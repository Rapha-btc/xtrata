import fs from "node:fs/promises";
import path from "node:path";

import { ChromeAppleScriptAdapter } from "../../modular-harness/src/browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../../modular-harness/src/browser/profileRegistry.js";
import { replaceRunState, withDb } from "./db.js";
import { enrichLead, mergeLeadEnrichment } from "./enrich.js";
import { readNarrateJob } from "./job.js";
import { writeJson, writeText } from "./lib/fs.js";
import { ensureAppDirs, ensureDir, getRunDir, getRunId, RUNS_DIR } from "./lib/paths.js";
import { normalizeDiscoveryCollections } from "./normalize.js";
import { draftOutreach } from "./outreach.js";
import { buildDiscoveryPlan } from "./queryTemplates.js";
import { scoreSourceItems } from "./score.js";
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
    progressLog: path.join(runDir, "progress.log"),
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

async function emitProgressFactory({ writeFiles, progressLogPath, progressToConsole, progressConsole, onProgress }) {
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
  return leads.filter((lead) => lead.totalScore >= threshold).slice(0, 12);
}

function selectLeadsForDrafting(leads, threshold) {
  return leads.filter((lead) => lead.totalScore >= threshold).slice(0, 10);
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
  const runDir = getRunDir(resolvedRunId);
  const files = buildArtifactPaths(runDir);

  if (writeFiles) {
    await ensureAppDirs();
    await ensureDir(runDir);
    await writeText(files.progressLog, "");
  }

  const emitProgress = await emitProgressFactory({
    writeFiles,
    progressLogPath: files.progressLog,
    progressToConsole,
    progressConsole,
    onProgress,
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

  const job = await readNarrateJob(jobFilePath);
  const queryPlan = buildDiscoveryPlan(job);
  const personaProfile = job.persona ? await resolveBrowserPersonaFn(job.persona) : null;
  const resolvedAdapter = adapter ?? new ChromeAppleScriptAdapter({ browserName: personaProfile?.browserName ?? browserName });

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
    },
  });

  const collectionResult = await collectLeadSourcesFn({
    job,
    adapter: resolvedAdapter,
    personaProfile,
    queryPlans: queryPlan,
    onProgress: emitProgress,
  });

  const normalized = normalizeDiscoveryCollections({
    collections: collectionResult.collections,
    collectedAt: resolvedNow.toISOString(),
  });

  const scoredLeads = scoreSourceItems(normalized.items, { now: resolvedNow }).slice(0, job.finalLeadLimit);
  const enrichmentTargets = selectLeadsForEnrichment(scoredLeads, job.enrichAboveScore);
  const enrichmentResults = [];

  await emitProgress({
    stage: "qualification",
    action: "complete",
    details: {
      normalizedItems: normalized.dedupedCount,
      scoredLeads: scoredLeads.length,
      enrichmentTargets: enrichmentTargets.length,
    },
  });

  for (const lead of enrichmentTargets) {
    const enrichmentResult = await enrichLeadFn({
      adapter: resolvedAdapter,
      job,
      lead,
      personaProfile,
      expectedAccountHint: job.account,
    });
    enrichmentResults.push(enrichmentResult);
  }

  const enrichmentByLeadId = new Map(enrichmentResults.map((entry) => [entry.leadId, entry.value]));
  const enrichedLeads = scoredLeads
    .map((lead) => mergeLeadEnrichment(lead, enrichmentByLeadId.get(lead.leadId) ?? null))
    .sort((left, right) => right.totalScore - left.totalScore);

  const draftTargets = selectLeadsForDrafting(enrichedLeads, job.draftAboveScore);
  const outreachResults = [];

  await emitProgress({
    stage: "enrichment",
    action: "complete",
    details: {
      enriched: enrichmentResults.length,
      draftTargets: draftTargets.length,
    },
  });

  for (const lead of draftTargets) {
    outreachResults.push(
      await draftOutreachFn({
        adapter: resolvedAdapter,
        job,
        lead,
        personaProfile,
        expectedAccountHint: job.account,
      })
    );
  }

  const learningRows = buildLearningRows({
    collections: collectionResult.collections,
    leads: enrichedLeads,
    outreach: outreachResults,
  });

  const manifest = {
    runId: resolvedRunId,
    generatedAt: resolvedNow.toISOString(),
    jobFilePath: path.resolve(jobFilePath),
    counts: {
      queries: queryPlan.length,
      collected: collectionResult.collectedCount,
      normalized: normalized.dedupedCount,
      leads: enrichedLeads.length,
      hot: enrichedLeads.filter((lead) => lead.status === "hot").length,
      drafted: outreachResults.length,
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

  await emitProgress({
    stage: "lead-engine",
    action: "complete",
    details: manifest.counts,
  });

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
}
