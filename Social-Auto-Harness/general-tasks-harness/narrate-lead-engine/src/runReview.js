import fs from "node:fs/promises";
import path from "node:path";

import { readJsonIfExists, readTextIfExists } from "./lib/fs.js";
import { RUNS_DIR, getRunDir } from "./lib/paths.js";

function hasOwnKeys(value) {
  return Boolean(value) && Object.keys(value).length > 0;
}

function summarizeInvalidReply(reply) {
  if (!reply) return null;

  return {
    kind: reply.kind ?? null,
    label: reply.label ?? null,
    attempt: reply.attempt ?? null,
    replyUrl: reply.replyUrl ?? null,
    rawReplyFile: reply.rawReplyFile ?? null,
    promptFile: reply.promptFile ?? null,
    metaFile: reply.metaFile ?? null,
  };
}

export function parseJsonLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJsonLinesIfExists(filePath, fallback = []) {
  const raw = await readTextIfExists(filePath, null);
  if (raw === null) return fallback;
  return parseJsonLines(raw);
}

async function readInvalidReplies(invalidRepliesDir) {
  try {
    const names = (await fs.readdir(invalidRepliesDir))
      .filter((entry) => entry.endsWith(".meta.json"))
      .sort();

    const replies = await Promise.all(
      names.map((name) => readJsonIfExists(path.join(invalidRepliesDir, name), null))
    );
    return replies.filter(Boolean);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return [];
  }
}

function latestProgressEvent(events, { includeTerminal = true } = {}) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "progress") continue;
    if (
      !includeTerminal &&
      event.stage === "lead-engine" &&
      (event.action === "failed" || event.action === "complete")
    ) {
      continue;
    }
    return event;
  }
  return null;
}

export function inferFailureKind(errorPayload) {
  const message = errorPayload?.error?.message ?? errorPayload?.message ?? "";

  if (/repair attempt returned the previous reply again/i.test(message)) {
    return "chatgpt-stale-retry";
  }
  if (/did not contain valid JSON/i.test(message)) {
    return "chatgpt-invalid-json";
  }
  if (/still generating when the wait budget expired/i.test(message)) {
    return "chatgpt-timeout";
  }
  if (/google presented an unusual-traffic/i.test(message) || /google-unusual-traffic/i.test(message)) {
    return "google-unusual-traffic";
  }
  if (/Expected ChatGPT account hint/i.test(message)) {
    return "chatgpt-account-mismatch";
  }
  if (/No logged-in ChatGPT session detected/i.test(message)) {
    return "chatgpt-session-missing";
  }
  if (/heap usage reached/i.test(message)) {
    return "memory-budget";
  }
  if (/collected items exceeded/i.test(message)) {
    return "collection-budget";
  }

  return "unknown";
}

function buildSuggestedScopePatch(job, options = {}) {
  const patch = {};

  if (!job) return null;

  if (options.maxResultsPerQuery !== undefined && job.maxResultsPerQuery > options.maxResultsPerQuery) {
    patch.maxResultsPerQuery = options.maxResultsPerQuery;
  }
  if (options.maxTotalQueries !== undefined && job.maxTotalQueries > options.maxTotalQueries) {
    patch.maxTotalQueries = options.maxTotalQueries;
  }
  if (options.maxEnrichmentTasks !== undefined && job.maxEnrichmentTasks > options.maxEnrichmentTasks) {
    patch.maxEnrichmentTasks = options.maxEnrichmentTasks;
  }
  if (options.maxDraftTasks !== undefined && job.maxDraftTasks > options.maxDraftTasks) {
    patch.maxDraftTasks = options.maxDraftTasks;
  }
  if (options.chatgptWaitBudgetMs !== undefined && job.chatgptWaitBudgetMs < options.chatgptWaitBudgetMs) {
    patch.chatgptWaitBudgetMs = options.chatgptWaitBudgetMs;
  }
  if (options.maxCollectedItems !== undefined && job.maxCollectedItems > options.maxCollectedItems) {
    patch.maxCollectedItems = options.maxCollectedItems;
  }

  return hasOwnKeys(patch) ? patch : null;
}

export function applySuggestedJobChanges(
  job,
  { suggestedJobPatch = null, suggestedSourceUpdates = [] } = {}
) {
  if (!job) return null;

  let updatedJob = suggestedJobPatch ? { ...job, ...suggestedJobPatch } : { ...job };
  if (suggestedSourceUpdates.length === 0) {
    return suggestedJobPatch ? updatedJob : null;
  }

  const updatesByLabel = new Map(
    suggestedSourceUpdates.map((entry) => [entry.label, entry.changes ?? {}])
  );
  updatedJob = {
    ...updatedJob,
    sources: (job.sources ?? []).map((source) =>
      updatesByLabel.has(source.label)
        ? { ...source, ...updatesByLabel.get(source.label) }
        : source
    ),
  };

  return updatedJob;
}

export function buildRunReview({
  job = null,
  manifest = null,
  error = null,
  debugEvents = [],
  invalidReplies = [],
} = {}) {
  const status = manifest?.status ?? (error ? "failed" : "unknown");
  const lastProgress = latestProgressEvent(debugEvents, { includeTerminal: false });
  const terminalProgress = latestProgressEvent(debugEvents);
  const latestInvalidReply = invalidReplies.at(-1) ?? null;
  const failureKind = status === "failed" ? inferFailureKind(error) : null;

  let rerunDecision = status === "completed" ? "not-needed" : "manual-review-required";
  let recommendedAction =
    status === "completed"
      ? "Review the collected leads before widening query breadth or enabling more sources."
      : "Review the latest artifacts before preparing another run.";
  let nextTestingStep =
    status === "completed"
      ? "Use the safe smoke job before widening query count or enabling additional sources."
      : "Do not widen scope until the current failure is explained.";
  let suggestedJobPatch = null;
  let suggestedSourceUpdates = [];

  switch (failureKind) {
    case "chatgpt-invalid-json":
      suggestedJobPatch = buildSuggestedScopePatch(job, {
        maxResultsPerQuery: 3,
        maxTotalQueries: 2,
        maxEnrichmentTasks: 1,
        maxDraftTasks: 1,
      });
      recommendedAction =
        "Review the latest invalid reply artifact, confirm the prompt/reply mismatch, then rerun with a tighter scope.";
      nextTestingStep =
        "Rerun the safe smoke job with the same single source after reviewing the invalid-reply files.";
      break;
    case "chatgpt-stale-retry":
      suggestedJobPatch = buildSuggestedScopePatch(job, {
        maxResultsPerQuery: 3,
        maxTotalQueries: 2,
        maxEnrichmentTasks: 1,
        maxDraftTasks: 1,
      }) ?? {};
      suggestedJobPatch.chatgptReuseReplyThreadForRepairs = false;
      recommendedAction =
        "Review the latest invalid reply artifact before rerunning. Then retry from a fresh ChatGPT tab instead of reusing the previous reply thread.";
      nextTestingStep =
        "Open the latest reply URL manually, inspect the thread state, and rerun the smoke job with reply-thread reuse disabled for repairs.";
      break;
    case "chatgpt-timeout":
      rerunDecision = "safe-to-prepare";
      suggestedJobPatch = buildSuggestedScopePatch(job, {
        chatgptWaitBudgetMs: 300000,
        maxTotalQueries: 2,
      });
      recommendedAction =
        "Increase the ChatGPT wait budget before rerunning and keep the next run at smoke-test breadth.";
      nextTestingStep =
        "Apply the wait-budget patch, then rerun the safe smoke job before restoring wider query counts.";
      break;
    case "google-unusual-traffic":
      suggestedSourceUpdates = (job?.sources ?? [])
        .filter((source) => source.type === "google-search" && source.enabled !== false)
        .map((source) => ({
          label: source.label,
          changes: { enabled: false },
        }));
      rerunDecision = suggestedSourceUpdates.length > 0 ? "safe-to-prepare" : "do-not-rerun";
      recommendedAction =
        "Do not rerun direct Google scraping unchanged. Disable google-search sources and rely on gpt-web-search or other non-Google sources.";
      nextTestingStep =
        "Rerun the safe smoke job with only gpt-web-search enabled.";
      break;
    case "memory-budget":
      rerunDecision = "safe-to-prepare";
      suggestedJobPatch = buildSuggestedScopePatch(job, {
        maxTotalQueries: Math.max(1, Math.min(job?.maxTotalQueries ?? 1, 4)),
        maxCollectedItems: Math.max(6, Math.floor((job?.maxCollectedItems ?? 6) / 2)),
        maxEnrichmentTasks: 2,
        maxDraftTasks: 2,
      });
      recommendedAction =
        "Lower the run budgets before rerunning. Recursive retries should reduce query breadth and downstream tasks together.";
      nextTestingStep =
        "Apply the budget patch and rerun the safe smoke job first.";
      break;
    case "collection-budget":
      rerunDecision = "safe-to-prepare";
      suggestedJobPatch = buildSuggestedScopePatch(job, {
        maxResultsPerQuery: 3,
        maxTotalQueries: 2,
      });
      recommendedAction =
        "Tighten query breadth before rerunning. The current source/query mix is producing too many collected items.";
      nextTestingStep =
        "Apply the smaller collection limits and rerun the safe smoke job.";
      break;
    case "chatgpt-session-missing":
      recommendedAction =
        "Restore a logged-in ChatGPT browser session before retrying. This should not auto-rerun until the session is confirmed manually.";
      nextTestingStep =
        "Open ChatGPT in Chrome, confirm the correct account is ready, then rerun the smoke job.";
      break;
    case "chatgpt-account-mismatch":
      recommendedAction =
        "Fix the ChatGPT account mismatch before retrying. Recursive execution should stop here and wait for operator confirmation.";
      nextTestingStep =
        "Verify the expected persona/account manually, then rerun the smoke job.";
      break;
    case "unknown":
      recommendedAction =
        "Review the debug log and error context before preparing another run. Unknown failures should not auto-rerun.";
      nextTestingStep =
        "Inspect the latest debug artifacts manually, then rerun the safe smoke job only if the cause is clear.";
      break;
    default:
      break;
  }

  const suggestedJob = applySuggestedJobChanges(job, {
    suggestedJobPatch,
    suggestedSourceUpdates,
  });

  return {
    status,
    counts: manifest?.counts ?? null,
    failureKind,
    lastStage: lastProgress?.stage ?? terminalProgress?.stage ?? null,
    lastAction: lastProgress?.action ?? terminalProgress?.action ?? null,
    lastMessage: error?.error?.message ?? null,
    latestReplyUrl:
      latestInvalidReply?.replyUrl ??
      error?.error?.context?.replyUrl ??
      null,
    invalidReplyCount: invalidReplies.length,
    latestInvalidReply: summarizeInvalidReply(latestInvalidReply),
    rerunDecision,
    approvalRequired: status === "failed",
    recommendedAction,
    nextTestingStep,
    suggestedJobPatch,
    suggestedSourceUpdates,
    suggestedJob,
  };
}

export async function loadRunArtifacts({
  runId,
  runsDir = RUNS_DIR,
} = {}) {
  if (!runId?.toString().trim()) {
    throw new TypeError("runId is required.");
  }

  const resolvedRunId = runId.toString().trim();
  const runDir = getRunDir(resolvedRunId, runsDir);
  const [manifest, job, leads, outreach, error, debugLog, debugEvents, invalidReplies] = await Promise.all([
    readJsonIfExists(path.join(runDir, "manifest.json"), null),
    readJsonIfExists(path.join(runDir, "job.json"), null),
    readJsonIfExists(path.join(runDir, "leads.json"), []),
    readJsonIfExists(path.join(runDir, "outreach.json"), []),
    readJsonIfExists(path.join(runDir, "error.json"), null),
    readTextIfExists(path.join(runDir, "debug-log.md"), null),
    readJsonLinesIfExists(path.join(runDir, "debug-events.jsonl"), []),
    readInvalidReplies(path.join(runDir, "invalid-replies")),
  ]);

  return {
    runId: resolvedRunId,
    runDir,
    manifest,
    job,
    leads,
    outreach,
    error,
    debugLog,
    debugEvents,
    invalidReplies,
    review: buildRunReview({
      job,
      manifest,
      error,
      debugEvents,
      invalidReplies,
    }),
  };
}
