import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeGovernanceUrl } from "../governance/loadGovernanceState.js";
import { normalizeHandle } from "../session/xSessionSignals.js";

export const INTERACTION_LEDGER_PATH = path.join("modular-harness", "state", "interaction-ledger.jsonl");
export const POSTED_THREADS_LOG_FILE = "posted-threads-log.json";

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function buildDraftIdentifier(draft) {
  const draftIndex = Number.isInteger(draft?.draftIndex) ? draft.draftIndex : null;
  return draftIndex === null ? null : `manual-reply-draft-${draftIndex}`;
}

function buildSourceRunId(timestamp) {
  return `manual-reply-queue-${timestamp.slice(0, 10)}`;
}

function buildTopic(draft) {
  const preferred =
    normalizeString(draft?.target?.draftBrief, "") ||
    normalizeString(draft?.target?.reasoning, "") ||
    normalizeString(draft?.target?.text, "");
  return preferred ? preferred.slice(0, 180) : "Manual modular-harness reply";
}

async function readJsonObject(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}

export function buildReplyLedgerEntry({
  persona = null,
  draft,
  status,
  observedState = null,
  timestamp = new Date().toISOString(),
} = {}) {
  const normalizedStatus = normalizeString(status, "manual-action-not-confirmed");
  const threadUrl = normalizeGovernanceUrl(draft?.url ?? draft?.target?.url ?? null);
  const targetHandle = normalizeHandle(draft?.target?.author ?? null);
  const riskFlags = unique([...(draft?.target?.riskFlags ?? []), ...(draft?.safetyChecks ?? [])]);
  const sent = normalizedStatus === "sent";

  return {
    timestamp,
    persona: normalizeString(persona, "unknown"),
    platform: "x",
    actionType: sent ? "reply-posted" : "reply-prepared",
    status: sent ? "posted" : "prepared",
    targetHandle: targetHandle ? `@${targetHandle}` : null,
    threadUrl,
    postUrl: normalizeGovernanceUrl(observedState?.matchingReplyUrl ?? null),
    sourceQuery: normalizeString(draft?.target?.searchQuery, "") || null,
    sourceRunId: buildSourceRunId(timestamp),
    analysisId: null,
    draftId: buildDraftIdentifier(draft),
    qualityRating: normalizeString(draft?.target?.recommendation, "") || "consider",
    riskFlags,
    reason: sent
      ? "Operator manually clicked Reply and the sent reply was observed in the thread."
      : "Draft prepared for manual approval, but send was not confirmed automatically.",
    operatorApproved: sent,
  };
}

export async function appendInteractionLedgerEntry({
  baseDir = process.cwd(),
  entry,
} = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("entry is required.");
  }

  const filePath = path.join(baseDir, INTERACTION_LEDGER_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return filePath;
}

export function buildPostedThreadEntry({
  draft,
  observedState = null,
  timestamp = new Date().toISOString(),
} = {}) {
  return {
    url: normalizeGovernanceUrl(draft?.url ?? draft?.target?.url ?? null),
    author: normalizeString(draft?.target?.author, "") || null,
    topic: buildTopic(draft),
    replied_at: timestamp.slice(0, 10),
    our_reply_url: normalizeGovernanceUrl(observedState?.matchingReplyUrl ?? null),
    our_reply: normalizeString(draft?.replyText, "") || null,
  };
}

export async function upsertPostedThreadEntry({
  baseDir = process.cwd(),
  entry,
} = {}) {
  if (!entry?.url) {
    throw new TypeError("entry.url is required.");
  }

  const filePath = path.join(baseDir, POSTED_THREADS_LOG_FILE);
  const parsed = await readJsonObject(filePath);
  const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
  const normalizedUrl = normalizeGovernanceUrl(entry.url);
  const existingIndex = threads.findIndex(
    (thread) => normalizeGovernanceUrl(thread?.url ?? null) === normalizedUrl
  );

  if (existingIndex >= 0) {
    threads[existingIndex] = {
      ...threads[existingIndex],
      ...entry,
    };
  } else {
    threads.push(entry);
  }

  parsed.threads = threads;
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return filePath;
}

export async function recordManualReplyOutcome({
  baseDir = process.cwd(),
  persona = null,
  draft,
  status,
  observedState = null,
  timestamp = new Date().toISOString(),
} = {}) {
  if (!draft || typeof draft !== "object") {
    throw new TypeError("draft is required.");
  }

  const ledgerEntry = buildReplyLedgerEntry({
    persona,
    draft,
    status,
    observedState,
    timestamp,
  });
  const ledgerPath = await appendInteractionLedgerEntry({
    baseDir,
    entry: ledgerEntry,
  });

  let postedThreadsPath = null;
  let postedThreadEntry = null;
  if (status === "sent") {
    postedThreadEntry = buildPostedThreadEntry({
      draft,
      observedState,
      timestamp,
    });
    postedThreadsPath = await upsertPostedThreadEntry({
      baseDir,
      entry: postedThreadEntry,
    });
  }

  return {
    ledgerPath,
    postedThreadsPath,
    ledgerEntry,
    postedThreadEntry,
  };
}
