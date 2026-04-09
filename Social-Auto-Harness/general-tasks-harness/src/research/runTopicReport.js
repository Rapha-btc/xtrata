import fs from "node:fs/promises";
import path from "node:path";

import { ChromeAppleScriptAdapter } from "../../modular-harness/src/browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../../modular-harness/src/browser/profileRegistry.js";
import { ensureDir, getRunId, RESEARCH_RUNS_DIR } from "../lib/paths.js";
import { writeJson, writeText } from "../lib/fs.js";
import { analyzeResearchCollection } from "./analyze.js";
import { readResearchJob } from "./job.js";
import { normalizeResearchCollections } from "./normalize.js";
import { buildResearchReport, renderResearchReportMarkdown } from "./report.js";
import { collectResearchSources } from "./sources/index.js";

export const DEFAULT_RESEARCH_CHATGPT_WAIT_BUDGET_MS = 5 * 60 * 1000;
export const DEFAULT_RESEARCH_CHATGPT_POLL_MS = 1000;

function buildArtifactPaths(runDir) {
  return {
    job: path.join(runDir, "job.json"),
    progressLog: path.join(runDir, "progress.log"),
    invalidRepliesDir: path.join(runDir, "invalid-replies"),
    collection: path.join(runDir, "collection.json"),
    normalizedItems: path.join(runDir, "normalized-items.json"),
    analysis: path.join(runDir, "analysis.json"),
    reportJson: path.join(runDir, "report.json"),
    reportMarkdown: path.join(runDir, "report.md"),
    manifest: path.join(runDir, "manifest.json"),
  };
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProgressValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized ? JSON.stringify(normalized) : null;
  }

  return JSON.stringify(value);
}

function slugifyArtifactLabel(value, fallback = "chatgpt-json") {
  const normalized = value
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function formatProgressEntry(entry) {
  const parts = [`[${entry.timestamp}]`, `${entry.stage}:${entry.action}`];

  if (entry.label) {
    parts.push(`label=${normalizeProgressValue(entry.label)}`);
  }

  const details = entry.details && typeof entry.details === "object" ? entry.details : {};
  for (const key of Object.keys(details).sort()) {
    const normalizedValue = normalizeProgressValue(details[key]);
    if (normalizedValue === null) continue;
    parts.push(`${key}=${normalizedValue}`);
  }

  return parts.join(" ");
}

export function resolveResearchChatGPTReplyOptions({
  chatgptWaitBudgetMs = DEFAULT_RESEARCH_CHATGPT_WAIT_BUDGET_MS,
  chatgptPollMs = DEFAULT_RESEARCH_CHATGPT_POLL_MS,
} = {}) {
  const replyWaitMs = normalizePositiveInteger(chatgptPollMs, DEFAULT_RESEARCH_CHATGPT_POLL_MS);
  const waitBudgetMs = Math.max(
    replyWaitMs,
    normalizePositiveInteger(chatgptWaitBudgetMs, DEFAULT_RESEARCH_CHATGPT_WAIT_BUDGET_MS)
  );

  return {
    replyWaitMs,
    replyMaxChecks: Math.max(1, Math.ceil(waitBudgetMs / replyWaitMs)),
    waitBudgetMs,
  };
}

export async function runTopicReport({
  jobFilePath,
  runId = null,
  researchRunsDir = RESEARCH_RUNS_DIR,
  browserName = "Google Chrome",
  adapter = null,
  now = new Date(),
  writeFiles = true,
  resolveBrowserPersonaFn = resolveBrowserPersona,
  sendPromptForJsonFn,
  scrapeXSearchResultsFn,
  chatgptWaitBudgetMs = DEFAULT_RESEARCH_CHATGPT_WAIT_BUDGET_MS,
  chatgptPollMs = DEFAULT_RESEARCH_CHATGPT_POLL_MS,
  onProgress = null,
  progressToConsole = true,
  progressConsole = console,
} = {}) {
  if (!jobFilePath?.toString().trim()) {
    throw new TypeError("jobFilePath is required.");
  }

  const resolvedNow = now instanceof Date ? now : new Date(now);
  const generatedAt = resolvedNow.toISOString();
  const resolvedRunId = runId ?? getRunId(resolvedNow);
  const effectiveRunDir = path.resolve(researchRunsDir, resolvedRunId);
  const files = buildArtifactPaths(effectiveRunDir);
  const chatgptReplyOptions = resolveResearchChatGPTReplyOptions({
    chatgptWaitBudgetMs,
    chatgptPollMs,
  });
  const progressEntries = [];
  let invalidReplyCounter = 0;
  const emitProgress = async ({ stage, action, label = null, details = {} } = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      stage: stage ?? "topic-report",
      action: action ?? "event",
      label,
      details,
    };
    progressEntries.push(entry);
    const line = formatProgressEntry(entry);

    if (progressToConsole && typeof progressConsole?.log === "function") {
      progressConsole.log(line);
    }

    if (writeFiles) {
      await fs.appendFile(files.progressLog, `${line}\n`, "utf8");
    }

    if (typeof onProgress === "function") {
      try {
        await onProgress(entry);
      } catch {
        // Progress hooks must never break the run itself.
      }
    }
  };

  const captureInvalidReply = async ({
    label = null,
    attempt = null,
    maxAttempts = null,
    kind = null,
    errorMessage = null,
    rawReplyText = null,
    dispatchedPrompt = null,
    replyUrl = null,
    sessionAction = null,
    isFinalAttempt = false,
  } = {}) => {
    if (!writeFiles) return;

    try {
      invalidReplyCounter += 1;
      const artifactId = String(invalidReplyCounter).padStart(3, "0");
      const artifactLabel = slugifyArtifactLabel(label, "chatgpt-json");
      const attemptSuffix = Number.isFinite(attempt) ? `-attempt-${attempt}` : "";
      const artifactBase = path.join(files.invalidRepliesDir, `${artifactId}-${artifactLabel}${attemptSuffix}`);

      await ensureDir(files.invalidRepliesDir);
      await writeText(`${artifactBase}.raw.txt`, rawReplyText ?? "");
      await writeText(`${artifactBase}.prompt.txt`, dispatchedPrompt ?? "");
      await writeJson(`${artifactBase}.meta.json`, {
        capturedAt: new Date().toISOString(),
        label,
        attempt,
        maxAttempts,
        kind,
        errorMessage,
        replyUrl,
        sessionAction,
        isFinalAttempt,
        files: {
          rawReply: `${artifactBase}.raw.txt`,
          prompt: `${artifactBase}.prompt.txt`,
          metadata: `${artifactBase}.meta.json`,
        },
      });
      await emitProgress({
        stage: "topic-report",
        action: "invalid-reply-captured",
        label,
        details: {
          attempt,
          maxAttempts,
          kind,
          isFinalAttempt,
          fileBase: artifactBase,
        },
      });
    } catch {
      // Invalid reply capture must never break the run itself.
    }
  };

  if (writeFiles) {
    await ensureDir(researchRunsDir);
    await ensureDir(effectiveRunDir);
    await ensureDir(files.invalidRepliesDir);
    await fs.writeFile(files.progressLog, "", "utf8");
  }

  await emitProgress({
    stage: "topic-report",
    action: "start",
    details: {
      runId: resolvedRunId,
      runDir: effectiveRunDir,
      progressLog: files.progressLog,
      jobFilePath: path.resolve(jobFilePath),
      waitBudgetMs: chatgptReplyOptions.waitBudgetMs,
      replyMaxChecks: chatgptReplyOptions.replyMaxChecks,
      replyWaitMs: chatgptReplyOptions.replyWaitMs,
    },
  });

  try {
    const job = await readResearchJob(jobFilePath);
    if (writeFiles) {
      await writeJson(files.job, job);
    }
    await emitProgress({
      stage: "topic-report",
      action: "job-loaded",
      details: {
        topic: job.topic,
        sourceCount: job.sources.length,
        analysisBatchSize: job.analysisBatchSize,
        finalSynthesisLimit: job.finalSynthesisLimit,
      },
    });

    const personaProfile = job.persona ? await resolveBrowserPersonaFn(job.persona) : null;
    const needsXPersona = job.sources.some((source) => source.type === "x-search");
    if (needsXPersona && !personaProfile?.xHandle) {
      throw new Error('Research jobs with "x-search" sources require a persona that resolves to an expected X handle.');
    }
    await emitProgress({
      stage: "topic-report",
      action: "persona-resolved",
      details: {
        persona: job.persona ?? null,
        expectedXHandle: personaProfile?.xHandle ?? null,
        browserName: personaProfile?.browserName ?? browserName,
      },
    });

    const resolvedAdapter =
      adapter ??
      new ChromeAppleScriptAdapter({
        browserName: personaProfile?.browserName ?? browserName,
      });

    await emitProgress({
      stage: "topic-report",
      action: "collection-start",
      details: {
        sourceCount: job.sources.length,
      },
    });
    const collection = await collectResearchSources({
      job,
      adapter: resolvedAdapter,
      personaProfile,
      scrapeXSearchResultsFn,
      sendPromptForJsonFn,
      onProgress: emitProgress,
      onInvalidReply: captureInvalidReply,
      ...chatgptReplyOptions,
    });
    const collectionArtifact = {
      generatedAt,
      topic: job.topic,
      objective: job.objective,
      sources: collection.sourceCollections.map((entry) => ({
        source: entry.source,
        sourceType: entry.sourceType,
        collectedCount: entry.collectedCount,
        rawResult: entry.rawResult,
      })),
    };
    if (writeFiles) {
      await writeJson(files.collection, collectionArtifact);
    }
    await emitProgress({
      stage: "topic-report",
      action: "collection-complete",
      details: {
        collectedCount: collection.collectedCount,
      },
    });

    const normalized = normalizeResearchCollections({
      sourceCollections: collection.sourceCollections,
      collectedAt: generatedAt,
    });
    if (writeFiles) {
      await writeJson(files.normalizedItems, normalized);
    }
    await emitProgress({
      stage: "topic-report",
      action: "normalize-complete",
      details: {
        normalizedCount: normalized.normalizedCount,
        dedupedCount: normalized.dedupedCount,
        duplicateCount: normalized.duplicateCount,
      },
    });

    await emitProgress({
      stage: "topic-report",
      action: "analysis-start",
      details: {
        itemCount: normalized.items.length,
      },
    });
    const analysis = await analyzeResearchCollection({
      adapter: resolvedAdapter,
      job,
      items: normalized.items,
      expectedAccountHint: job.account,
      personaProfile,
      sendPromptForJsonFn,
      onProgress: emitProgress,
      onInvalidReply: captureInvalidReply,
      ...chatgptReplyOptions,
    });
    if (writeFiles) {
      await writeJson(files.analysis, analysis);
    }
    await emitProgress({
      stage: "topic-report",
      action: "analysis-complete",
      details: {
        analyzedCount: analysis.analyzedCount,
        shortlistedCount: analysis.synthesisResult?.shortlistedCount ?? 0,
      },
    });

    const report = buildResearchReport({
      job,
      normalizedItems: normalized.items,
      analysisResult: analysis,
      generatedAt,
      sourceFiles: {
        jobFile: path.resolve(jobFilePath),
        collectionFile: files.collection,
        normalizedItemsFile: files.normalizedItems,
        analysisFile: files.analysis,
      },
    });
    const reportMarkdown = renderResearchReportMarkdown(report);

    const manifest = {
      runId: resolvedRunId,
      generatedAt,
      runDir: effectiveRunDir,
      resolvedJobConfig: job,
      counts: {
        sources: job.sources.length,
        collected: collection.collectedCount,
        normalized: normalized.normalizedCount,
        deduped: normalized.dedupedCount,
        analyzed: analysis.analyzedCount,
        shortlisted: analysis.synthesisResult?.shortlistedCount ?? 0,
      },
      perSourceCounts: collection.sourceCollections.map((entry) => ({
        label: entry.source.label,
        type: entry.source.type,
        query: entry.source.query,
        collectedCount: entry.collectedCount,
      })),
      analysisCallMetadata: analysis.callMetadata,
      chatgptReplyOptions,
      artifacts: {
        job: files.job,
        progressLog: files.progressLog,
        invalidRepliesDir: files.invalidRepliesDir,
        collection: files.collection,
        normalizedItems: files.normalizedItems,
        analysis: files.analysis,
        reportJson: files.reportJson,
        reportMarkdown: files.reportMarkdown,
        manifest: files.manifest,
      },
    };

    if (writeFiles) {
      await Promise.all([
        writeJson(files.reportJson, report),
        writeText(files.reportMarkdown, reportMarkdown),
        writeJson(files.manifest, manifest),
      ]);
    }
    await emitProgress({
      stage: "topic-report",
      action: "complete",
      details: {
        collectedCount: collection.collectedCount,
        analyzedCount: analysis.analyzedCount,
        shortlistedCount: analysis.synthesisResult?.shortlistedCount ?? 0,
      },
    });

    return {
      runId: resolvedRunId,
      generatedAt,
      runDir: effectiveRunDir,
      files,
      job,
      collection: collectionArtifact,
      normalized,
      analysis,
      report,
      reportMarkdown,
      manifest,
      progressEntries,
    };
  } catch (error) {
    await emitProgress({
      stage: "topic-report",
      action: "error",
      details: {
        message: error?.message ?? String(error),
      },
    });
    throw error;
  }
}
