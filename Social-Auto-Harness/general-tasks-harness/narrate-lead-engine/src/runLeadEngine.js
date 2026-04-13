import fs from "node:fs/promises";
import path from "node:path";

import { ChromeAppleScriptAdapter } from "../../modular-harness/src/browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../../modular-harness/src/browser/profileRegistry.js";
import { replaceRunState, withDb } from "./db.js";
import { createTracedAdapter, renderDebugLogMarkdown } from "./debug.js";
import { enrichLead, mergeLeadEnrichment } from "./enrich.js";
import { readNarrateJob } from "./job.js";
import { appendText, writeJson, writeText } from "./lib/fs.js";
import { ensureAppDirs, ensureDir, getRunDir, getRunId, RUNS_DIR } from "./lib/paths.js";
import { normalizeDiscoveryCollections } from "./normalize.js";
import { draftOutreach } from "./outreach.js";
import { buildDiscoveryPlan } from "./queryTemplates.js";
import { scoreSourceItems } from "./score.js";
import { assertMemoryWithinLimit, buildMemorySnapshot, pauseIfNeeded } from "./safety.js";
import { collectLeadSources } from "./sources/index.js";

function buildArtifactPaths(runDir) {
  return {
    job: path.join(runDir, "job.json"),
    queryPlan: path.join(runDir, "query-plan.json"),
    collection: path.join(runDir, "collection.json"),
    sourceItems: path.join(runDir, "source-items.json"),
    leads: path.join(runDir, "leads.json"),
    outreach: path.join(runDir, "outreach.json"),
    manifest: path.join(runDir, "manifest.json"),
    error: path.join(runDir, "error.json"),
    progressLog: path.join(runDir, "progress.log"),
    debugEvents: path.join(runDir, "debug-events.jsonl"),
    debugLog: path.join(runDir, "debug-log.md"),
    invalidRepliesDir: path.join(runDir, "invalid-replies"),
  };
}

function buildHelpfulFailureHint(error) {
  const message = error?.message ?? "";

  if (/chrome did not have an open window/i.test(message) || /chrome window not found/i.test(message)) {
    return "Open Google Chrome manually, keep one window open, and rerun the smoke test. The collector now tries to fall back to a fresh browser window, but macOS browser automation can still fail if Chrome is not ready yet.";
  }

  if (/google presented an unusual-traffic/i.test(message) || /google-unusual-traffic/i.test(message)) {
    return "Do not keep retrying Google. Leave direct Google scraping disabled for this job and use gpt-web-search or other non-Google sources instead.";
  }

  if (/still generating when the wait budget expired/i.test(message)) {
    return "ChatGPT produced a slower-than-expected web-search reply. Increase chatgptWaitBudgetMs in the job file or reduce the scope of the run.";
  }

  if (/did not contain valid JSON/i.test(message) || /repair attempt returned the previous reply again/i.test(message)) {
    return "Review the latest invalid-reply artifacts before rerunning. Keep the next run narrow and confirm the prompt/reply pair matches the requested schema.";
  }

  if (/heap usage reached/i.test(message)) {
    return "Lower maxTotalQueries, maxCollectedItems, maxEnrichmentTasks, or maxDraftTasks in the job file before retrying.";
  }

  if (/collected items exceeded/i.test(message)) {
    return "Reduce maxResultsPerQuery or maxTotalQueries in the job file, or tighten your source families and site filters.";
  }

  return null;
}

function resolveChatGPTReplyOptions(job) {
  const replyWaitMs = Math.max(250, Number.parseInt(job?.chatgptPollMs ?? "1000", 10) || 1000);
  const waitBudgetMs = Math.max(
    replyWaitMs,
    Number.parseInt(job?.chatgptWaitBudgetMs ?? "240000", 10) || 240000
  );

  return {
    replyWaitMs,
    replyMaxChecks: Math.max(1, Math.ceil(waitBudgetMs / replyWaitMs)),
    waitBudgetMs,
    reuseReplyThreadForRepairs: job?.chatgptReuseReplyThreadForRepairs !== false,
  };
}

function formatProgressEntry(entry) {
  const parts = [`[${entry.timestamp}]`, `${entry.stage}:${entry.action}`];
  for (const [key, value] of Object.entries(entry.details ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.join(" ");
}

async function emitProgressFactory({
  writeFiles,
  progressLogPath,
  progressToConsole,
  progressConsole,
  onProgress,
  recordDebugEvent,
}) {
  return async function emitProgress({ stage, action, details = {} } = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      stage: stage ?? "lead-engine",
      action: action ?? "event",
      details,
    };
    const line = formatProgressEntry(entry);

    if (progressToConsole && typeof progressConsole?.log === "function") {
      progressConsole.log(line);
    }

    if (writeFiles) {
      await fs.appendFile(progressLogPath, `${line}\n`, "utf8");
    }

    if (typeof recordDebugEvent === "function") {
      await recordDebugEvent({
        kind: "progress",
        timestamp: entry.timestamp,
        stage: entry.stage,
        action: entry.action,
        details: entry.details,
      });
    }

    if (typeof onProgress === "function") {
      try {
        await onProgress(entry);
      } catch {
        // Progress hooks must never break the run.
      }
    }
  };
}

function selectLeadsForEnrichment(leads, threshold) {
  return leads.filter((lead) => lead.totalScore >= threshold);
}

function selectLeadsForDrafting(leads, threshold) {
  return leads.filter((lead) => lead.totalScore >= threshold);
}

export function buildLearningRows({ collections = [], leads = [], outreach = [] } = {}) {
  const byQuery = new Map();

  collections.forEach((collection) => {
    const key = `${collection.sourceLabel}\n${collection.queryPlan.query}`;
    const existing = byQuery.get(key) ?? {
      sourceLabel: collection.sourceLabel,
      query: collection.queryPlan.query,
      resultsFound: 0,
      qualifiedFound: 0,
      draftedFound: 0,
      replies: 0,
      meetings: 0,
      revenue: 0,
    };
    existing.resultsFound += collection.collectedCount ?? 0;
    byQuery.set(key, existing);
  });

  leads.forEach((lead) => {
    const query = lead.evidence?.query ?? null;
    const sourceLabel = lead.evidence?.sourceLabel ?? null;
    if (!query || !sourceLabel) return;

    const key = `${sourceLabel}\n${query}`;
    const existing = byQuery.get(key);
    if (!existing) return;
    if (lead.totalScore >= 60) {
      existing.qualifiedFound += 1;
    }
  });

  outreach.forEach((draft) => {
    const lead = leads.find((entry) => entry.leadId === draft.leadId);
    const query = lead?.evidence?.query ?? null;
    const sourceLabel = lead?.evidence?.sourceLabel ?? null;
    if (!query || !sourceLabel) return;

    const key = `${sourceLabel}\n${query}`;
    const existing = byQuery.get(key);
    if (!existing) return;
    existing.draftedFound += 1;
  });

  return [...byQuery.values()].sort(
    (left, right) => right.qualifiedFound - left.qualifiedFound || right.resultsFound - left.resultsFound
  );
}

export async function runLeadEngine({
  jobFilePath,
  runId = null,
  runsDir = RUNS_DIR,
  browserName = "Google Chrome",
  adapter = null,
  writeFiles = true,
  persistToDb = true,
  resolveBrowserPersonaFn = resolveBrowserPersona,
  collectLeadSourcesFn = collectLeadSources,
  enrichLeadFn = enrichLead,
  draftOutreachFn = draftOutreach,
  progressToConsole = true,
  progressConsole = console,
  onProgress = null,
  now = new Date(),
} = {}) {
  if (!jobFilePath?.toString().trim()) {
    throw new TypeError("jobFilePath is required.");
  }

  const resolvedNow = now instanceof Date ? now : new Date(now);
  const resolvedRunId = runId ?? getRunId(resolvedNow);
  const runDir = getRunDir(resolvedRunId, runsDir);
  const files = buildArtifactPaths(runDir);
  let job = null;
  let queryPlan = [];
  let collectionResult = { collections: [], collectedCount: 0 };
  let normalized = { items: [], dedupedCount: 0 };
  let enrichedLeads = [];
  let outreachResults = [];
  let learningRows = [];
  let debugEvents = [];
  let debugSequence = 0;
  let lastInvalidReplyArtifact = null;

  if (writeFiles) {
    await ensureAppDirs();
    await ensureDir(runsDir);
    await ensureDir(runDir);
    await writeText(files.progressLog, "");
    await writeText(files.debugEvents, "");
    await ensureDir(files.invalidRepliesDir);
  }

  async function recordDebugEvent(event) {
    const normalizedEvent = {
      sequence: ++debugSequence,
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event,
    };
    debugEvents.push(normalizedEvent);

    if (writeFiles) {
      await appendText(files.debugEvents, `${JSON.stringify(normalizedEvent)}\n`);
    }
  }

  let invalidReplyCounter = 0;
  async function captureInvalidReply(event) {
    invalidReplyCounter += 1;
    const artifactBase = path.join(
      files.invalidRepliesDir,
      `${String(invalidReplyCounter).padStart(3, "0")}-${event.kind ?? "invalid"}`
    );
    const artifactFiles = {
      rawReplyFile: `${artifactBase}.raw.txt`,
      promptFile: `${artifactBase}.prompt.txt`,
      metaFile: `${artifactBase}.meta.json`,
    };
    lastInvalidReplyArtifact = artifactFiles;

    if (writeFiles) {
      await writeText(artifactFiles.rawReplyFile, `${event.rawReplyText ?? ""}`);
      await writeText(artifactFiles.promptFile, `${event.dispatchedPrompt ?? ""}`);
      await writeJson(artifactFiles.metaFile, {
        capturedAt: new Date().toISOString(),
        ...event,
        ...artifactFiles,
      });
    }

    await recordDebugEvent({
      kind: "invalid-reply-artifact",
      kindName: event.kind ?? "invalid-json",
      label: event.label ?? null,
      attempt: event.attempt ?? null,
      files: artifactFiles,
    });
  }

  const emitProgress = await emitProgressFactory({
    writeFiles,
    progressLogPath: files.progressLog,
    progressToConsole,
    progressConsole,
    onProgress,
    recordDebugEvent,
  });

  await emitProgress({
    stage: "lead-engine",
    action: "start",
    details: {
      runId: resolvedRunId,
      runDir,
      jobFilePath: path.resolve(jobFilePath),
    },
  });
  try {
    job = await readNarrateJob(jobFilePath);
    queryPlan = buildDiscoveryPlan(job);
    const chatgptReplyOptions = resolveChatGPTReplyOptions(job);
    const personaProfile = job.persona ? await resolveBrowserPersonaFn(job.persona) : null;
    const baseAdapter =
      adapter ?? new ChromeAppleScriptAdapter({ browserName: personaProfile?.browserName ?? browserName });
    const resolvedAdapter = createTracedAdapter(baseAdapter, { recordEvent: recordDebugEvent });

    if (writeFiles) {
      await writeJson(files.job, job);
      await writeJson(files.queryPlan, queryPlan);
    }

    await emitProgress({
      stage: "lead-engine",
      action: "job-loaded",
      details: {
        sourceCount: job.sources.filter((source) => source.enabled !== false).length,
        queryCount: queryPlan.length,
        persona: job.persona ?? null,
        chatgptReplyMaxChecks: chatgptReplyOptions.replyMaxChecks,
        chatgptReplyWaitMs: chatgptReplyOptions.replyWaitMs,
        ...assertMemoryWithinLimit({ job, stage: "job-loaded" }),
      },
    });

    collectionResult = await collectLeadSourcesFn({
      job,
      adapter: resolvedAdapter,
      personaProfile,
      queryPlans: queryPlan,
      onProgress: emitProgress,
      onInvalidReply: captureInvalidReply,
      ...chatgptReplyOptions,
    });

    normalized = normalizeDiscoveryCollections({
      collections: collectionResult.collections,
      collectedAt: resolvedNow.toISOString(),
    });

    assertMemoryWithinLimit({
      job,
      stage: "post-normalization",
      extra: {
        dedupedCount: normalized.dedupedCount,
      },
    });
    await pauseIfNeeded(resolvedAdapter, job.stagePauseMs);

    const scoredLeads = scoreSourceItems(normalized.items, { now: resolvedNow }).slice(0, job.finalLeadLimit);
    const enrichmentTargets = selectLeadsForEnrichment(scoredLeads, job.enrichAboveScore).slice(0, job.maxEnrichmentTasks);
    const enrichmentResults = [];

    await emitProgress({
      stage: "qualification",
      action: "complete",
      details: {
        normalizedItems: normalized.dedupedCount,
        scoredLeads: scoredLeads.length,
        enrichmentTargets: enrichmentTargets.length,
        ...assertMemoryWithinLimit({ job, stage: "qualification:complete" }),
      },
    });

    for (const lead of enrichmentTargets) {
      enrichmentResults.push(
        await enrichLeadFn({
          adapter: resolvedAdapter,
          job,
          lead,
          personaProfile,
          expectedAccountHint: job.account,
          onInvalidReply: captureInvalidReply,
          ...chatgptReplyOptions,
        })
      );
      assertMemoryWithinLimit({
        job,
        stage: "enrichment:loop",
        extra: {
          enrichedCount: enrichmentResults.length,
        },
      });
      await pauseIfNeeded(resolvedAdapter, job.queryPauseMs);
    }

    const enrichmentByLeadId = new Map(enrichmentResults.map((entry) => [entry.leadId, entry.value]));
    enrichedLeads = scoredLeads
      .map((lead) => mergeLeadEnrichment(lead, enrichmentByLeadId.get(lead.leadId) ?? null))
      .sort((left, right) => right.totalScore - left.totalScore);

    const draftTargets = selectLeadsForDrafting(enrichedLeads, job.draftAboveScore).slice(0, job.maxDraftTasks);

    await emitProgress({
      stage: "enrichment",
      action: "complete",
      details: {
        enriched: enrichmentResults.length,
        draftTargets: draftTargets.length,
        ...assertMemoryWithinLimit({ job, stage: "enrichment:complete" }),
      },
    });

    await pauseIfNeeded(resolvedAdapter, job.stagePauseMs);

    for (const lead of draftTargets) {
      outreachResults.push(
        await draftOutreachFn({
          adapter: resolvedAdapter,
          job,
          lead,
          personaProfile,
          expectedAccountHint: job.account,
          onInvalidReply: captureInvalidReply,
          ...chatgptReplyOptions,
        })
      );
      assertMemoryWithinLimit({
        job,
        stage: "outreach:loop",
        extra: {
          draftedCount: outreachResults.length,
        },
      });
      await pauseIfNeeded(resolvedAdapter, job.queryPauseMs);
    }

    learningRows = buildLearningRows({
      collections: collectionResult.collections,
      leads: enrichedLeads,
      outreach: outreachResults,
    });

    const manifest = {
      runId: resolvedRunId,
      generatedAt: resolvedNow.toISOString(),
      jobFilePath: path.resolve(jobFilePath),
      status: "completed",
      counts: {
        queries: queryPlan.length,
        collected: collectionResult.collectedCount,
        normalized: normalized.dedupedCount,
        leads: enrichedLeads.length,
        hot: enrichedLeads.filter((lead) => lead.status === "hot").length,
        drafted: outreachResults.length,
      },
      safety: {
        maxTotalQueries: job.maxTotalQueries,
        maxCollectedItems: job.maxCollectedItems,
        maxEnrichmentTasks: job.maxEnrichmentTasks,
        maxDraftTasks: job.maxDraftTasks,
        maxHeapUsedMb: job.maxHeapUsedMb,
        chatgptWaitBudgetMs: job.chatgptWaitBudgetMs,
        chatgptPollMs: job.chatgptPollMs,
        finalMemorySnapshot: buildMemorySnapshot(),
      },
      artifacts: files,
    };

    if (writeFiles) {
      await writeJson(files.collection, collectionResult);
      await writeJson(files.sourceItems, normalized);
      await writeJson(files.leads, enrichedLeads);
      await writeJson(files.outreach, outreachResults);
      await writeJson(files.manifest, manifest);
    }

    if (persistToDb) {
      withDb((db) => {
        replaceRunState(db, {
          run: {
            id: resolvedRunId,
            name: job.name,
            objective: job.objective,
            startedAt: resolvedNow.toISOString(),
            finishedAt: new Date().toISOString(),
            status: "completed",
            counts: manifest.counts,
          },
          sourceItems: normalized.items.map((item) => ({
            ...item,
            detectedSignals: enrichedLeads.find((lead) => lead.sourceItemId === item.itemId)?.detectedSignals ?? [],
          })),
          leads: enrichedLeads,
          outreach: outreachResults,
          learning: learningRows,
        });
      });
    }

    await emitProgress({
      stage: "lead-engine",
      action: "complete",
      details: manifest.counts,
    });

    if (writeFiles) {
      await writeText(
        files.debugLog,
        renderDebugLogMarkdown({
          runId: resolvedRunId,
          events: debugEvents,
          manifest,
          error: null,
        })
      );
    }

    return {
      runId: resolvedRunId,
      runDir,
      job,
      queryPlan,
      collectionResult,
      normalized,
      leads: enrichedLeads,
      outreach: outreachResults,
      learning: learningRows,
      manifest,
    };
  } catch (error) {
    const errorPayload = {
      runId: resolvedRunId,
      failedAt: new Date().toISOString(),
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
        details: error?.details ?? null,
        helpfulHint: buildHelpfulFailureHint(error),
        context: {
          replyUrl: error?.replyState?.url ?? null,
          sessionAction: error?.session?.action ?? null,
          rawReplyText: error?.rawReplyText ?? null,
          dispatchedPrompt: error?.dispatchedPrompt ?? null,
          invalidReplyArtifact: lastInvalidReplyArtifact,
        },
      },
      memory: buildMemorySnapshot(),
      counts: {
        queriesPlanned: queryPlan.length,
        collected: collectionResult.collectedCount ?? 0,
        normalized: normalized.dedupedCount ?? 0,
        leads: enrichedLeads.length,
        drafted: outreachResults.length,
      },
    };

    await emitProgress({
      stage: "lead-engine",
      action: "failed",
      details: {
        message: errorPayload.error.message,
        ...errorPayload.memory,
      },
    });

    const failureManifest = {
      runId: resolvedRunId,
      generatedAt: resolvedNow.toISOString(),
      jobFilePath: path.resolve(jobFilePath),
      status: "failed",
      counts: errorPayload.counts,
      safety: job
        ? {
            maxTotalQueries: job.maxTotalQueries,
            maxCollectedItems: job.maxCollectedItems,
            maxEnrichmentTasks: job.maxEnrichmentTasks,
            maxDraftTasks: job.maxDraftTasks,
            maxHeapUsedMb: job.maxHeapUsedMb,
            chatgptWaitBudgetMs: job.chatgptWaitBudgetMs,
            chatgptPollMs: job.chatgptPollMs,
          }
        : null,
      artifacts: files,
      errorFile: files.error,
    };

    if (writeFiles) {
      await writeJson(files.error, errorPayload);
      await writeJson(files.manifest, failureManifest);
      await writeText(
        files.debugLog,
        renderDebugLogMarkdown({
          runId: resolvedRunId,
          events: debugEvents,
          manifest: failureManifest,
          error: errorPayload,
        })
      );
    }

    if (job && persistToDb) {
      withDb((db) => {
        replaceRunState(db, {
          run: {
            id: resolvedRunId,
            name: job.name,
            objective: job.objective,
            startedAt: resolvedNow.toISOString(),
            finishedAt: new Date().toISOString(),
            status: "failed",
            counts: errorPayload.counts,
          },
          sourceItems: [],
          leads: [],
          outreach: [],
          learning: [],
        });
      });
    }

    throw error;
  }
}
