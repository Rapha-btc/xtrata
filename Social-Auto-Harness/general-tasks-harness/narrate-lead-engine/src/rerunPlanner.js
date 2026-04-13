import fs from "node:fs/promises";
import path from "node:path";

import { writeJson } from "./lib/fs.js";
import { ensureDir } from "./lib/paths.js";
import { loadRunArtifacts } from "./runReview.js";

function hasScopeChanges(review) {
  return Boolean(review?.suggestedJobPatch) || (review?.suggestedSourceUpdates?.length ?? 0) > 0;
}

function buildPreparedRunName(name, runId) {
  const normalizedName = name?.toString().trim() || "Narrate Lead Discovery";
  if (/\(Prepared rerun from .+\)$/.test(normalizedName)) {
    return normalizedName;
  }
  return `${normalizedName} (Prepared rerun from ${runId})`;
}

function buildDefaultOutputPaths(runDir) {
  return {
    job: path.join(runDir, "prepared-rerun-job.json"),
    plan: path.join(runDir, "prepared-rerun-plan.json"),
  };
}

async function assertWritableOutput(filePath, overwrite) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  if (!overwrite) {
    throw new Error(`Refusing to overwrite existing file: ${filePath}`);
  }
}

function buildRequiredChecks(review) {
  const checks = [
    "Review error.json and debug-log.md before running the prepared job.",
    "Confirm the proposed job file still matches your intended source scope and budgets.",
  ];

  if (review?.latestInvalidReply?.metaFile) {
    checks.push("Inspect the latest invalid-reply metadata, prompt, and raw reply artifacts.");
  }

  switch (review?.failureKind) {
    case "chatgpt-invalid-json":
    case "chatgpt-stale-retry":
      checks.push("Confirm the latest ChatGPT reply thread is understood before rerunning.");
      break;
    case "chatgpt-session-missing":
    case "chatgpt-account-mismatch":
      checks.push("Confirm the correct logged-in ChatGPT session is open before rerunning.");
      break;
    case "google-unusual-traffic":
      checks.push("Confirm direct google-search sources remain disabled in the prepared job.");
      break;
    default:
      break;
  }

  return checks;
}

function buildPreparedJob(artifacts) {
  const candidate = artifacts.review?.suggestedJob
    ? { ...artifacts.review.suggestedJob }
    : { ...(artifacts.job ?? {}) };

  candidate.name = buildPreparedRunName(candidate.name, artifacts.runId);
  return candidate;
}

export function buildPreparedRerunPlan({
  artifacts,
  preparedJobPath,
  preparedPlanPath,
} = {}) {
  if (!artifacts?.job) {
    throw new Error(`Run "${artifacts?.runId ?? "unknown"}" does not have a recoverable job artifact.`);
  }

  if (artifacts.review?.rerunDecision === "not-needed") {
    throw new Error(`Run "${artifacts.runId}" completed successfully. No rerun plan is needed.`);
  }

  if (artifacts.review?.rerunDecision === "do-not-rerun") {
    throw new Error(`Run "${artifacts.runId}" should not be rerun automatically. Resolve the blocking issue first.`);
  }

  const preparedJob = buildPreparedJob(artifacts);
  const plan = {
    sourceRunId: artifacts.runId,
    sourceRunDir: artifacts.runDir,
    sourceStatus: artifacts.manifest?.status ?? null,
    generatedAt: new Date().toISOString(),
    approvalRequired: true,
    executionStatus: "prepared-not-run",
    rerunDecision: artifacts.review?.rerunDecision ?? null,
    canRunAfterApproval: true,
    requiresArtifactReview: artifacts.review?.rerunDecision === "manual-review-required",
    failureKind: artifacts.review?.failureKind ?? null,
    recommendedAction: artifacts.review?.recommendedAction ?? null,
    nextTestingStep: artifacts.review?.nextTestingStep ?? null,
    requiredChecks: buildRequiredChecks(artifacts.review),
    scopeChangesApplied: hasScopeChanges(artifacts.review),
    suggestedJobPatch: artifacts.review?.suggestedJobPatch ?? null,
    suggestedSourceUpdates: artifacts.review?.suggestedSourceUpdates ?? [],
    latestReplyUrl: artifacts.review?.latestReplyUrl ?? null,
    latestInvalidReply: artifacts.review?.latestInvalidReply ?? null,
    inputArtifacts: {
      manifest: artifacts.manifest?.artifacts?.manifest ?? path.join(artifacts.runDir, "manifest.json"),
      error: artifacts.manifest?.artifacts?.error ?? path.join(artifacts.runDir, "error.json"),
      debugLog: artifacts.manifest?.artifacts?.debugLog ?? path.join(artifacts.runDir, "debug-log.md"),
      debugEvents: artifacts.manifest?.artifacts?.debugEvents ?? path.join(artifacts.runDir, "debug-events.jsonl"),
      invalidRepliesDir:
        artifacts.manifest?.artifacts?.invalidRepliesDir ?? path.join(artifacts.runDir, "invalid-replies"),
      job: artifacts.manifest?.artifacts?.job ?? path.join(artifacts.runDir, "job.json"),
    },
    outputs: {
      preparedJobPath,
      preparedPlanPath,
    },
    recommendedCommand: `npm run run-job -- --job-file=${JSON.stringify(preparedJobPath)}`,
  };

  return {
    preparedJob,
    preparedPlan: plan,
  };
}

export async function prepareRerun({
  runId,
  runsDir,
  outputJobPath = null,
  outputPlanPath = null,
  overwrite = false,
} = {}) {
  const artifacts = await loadRunArtifacts({ runId, runsDir });
  const defaultPaths = buildDefaultOutputPaths(artifacts.runDir);
  const preparedJobPath = path.resolve(outputJobPath ?? defaultPaths.job);
  const preparedPlanPath = path.resolve(outputPlanPath ?? defaultPaths.plan);

  await Promise.all([
    ensureDir(path.dirname(preparedJobPath)),
    ensureDir(path.dirname(preparedPlanPath)),
  ]);
  await Promise.all([
    assertWritableOutput(preparedJobPath, overwrite),
    assertWritableOutput(preparedPlanPath, overwrite),
  ]);

  const { preparedJob, preparedPlan } = buildPreparedRerunPlan({
    artifacts,
    preparedJobPath,
    preparedPlanPath,
  });

  await Promise.all([
    writeJson(preparedJobPath, preparedJob),
    writeJson(preparedPlanPath, preparedPlan),
  ]);

  return {
    runId: artifacts.runId,
    runDir: artifacts.runDir,
    review: artifacts.review,
    preparedJobPath,
    preparedPlanPath,
    preparedJob,
    preparedPlan,
  };
}
