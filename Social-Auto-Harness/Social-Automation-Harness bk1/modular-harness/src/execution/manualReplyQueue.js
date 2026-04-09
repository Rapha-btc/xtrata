import { recordManualReplyOutcome } from "../audit/replyHistory.js";
import { evaluateThreadCandidate } from "../policy/sharedRulesEngine.js";
import {
  normalizeReplyDraftText,
  prepareReplyComposer,
  waitForManualReplySend,
} from "../x/replyComposer.js";

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeIndex(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveSourceDrafts(draftResult) {
  if (Array.isArray(draftResult?.enrichedDrafts)) {
    return draftResult.enrichedDrafts;
  }
  if (Array.isArray(draftResult?.value?.drafts)) {
    return draftResult.value.drafts;
  }

  throw new TypeError("draftResult must contain enrichedDrafts or value.drafts.");
}

function resolveTweetUrl(draft) {
  return draft?.url ?? draft?.target?.url ?? null;
}

function resolveReplyText(draft) {
  return normalizeReplyDraftText(draft?.replyText ?? "");
}

function shouldContinueAfterObservation({ status, continueOnUnconfirmed }) {
  if (status === "sent" || status === "declined-by-operator") {
    return true;
  }

  return Boolean(continueOnUnconfirmed);
}

export function isReadyReplyDraft(draft) {
  return Boolean(resolveTweetUrl(draft) && resolveReplyText(draft) && draft?.ready !== false);
}

function normalizeDraftForGovernanceCheck(draft) {
  return {
    author: draft?.author ?? draft?.target?.author ?? null,
    url: resolveTweetUrl(draft),
    text: draft?.text ?? draft?.target?.text ?? null,
    postedAt: draft?.postedAt ?? draft?.target?.postedAt ?? null,
    source: draft?.source ?? draft?.target?.source ?? null,
    searchQuery: draft?.searchQuery ?? draft?.target?.searchQuery ?? null,
  };
}

export function selectReplyQueueDrafts(
  draftResult,
  {
    startIndex = 0,
    maxReplies = 8,
  } = {}
) {
  const sourceDrafts = resolveSourceDrafts(draftResult);
  const selected = [];
  const normalizedStartIndex = normalizeIndex(startIndex, 0);
  const normalizedMaxReplies = normalizeCount(maxReplies, 3);

  for (let sourceIndex = normalizedStartIndex; sourceIndex < sourceDrafts.length; sourceIndex += 1) {
    const sourceDraft = sourceDrafts[sourceIndex];
    if (!isReadyReplyDraft(sourceDraft)) {
      continue;
    }

    selected.push({
      ...sourceDraft,
      queueIndex: selected.length,
      sourceIndex,
      url: resolveTweetUrl(sourceDraft),
      replyText: resolveReplyText(sourceDraft),
    });
    if (selected.length >= normalizedMaxReplies) {
      break;
    }
  }

  return selected;
}

export function filterReplyQueueDraftsByGovernance(
  drafts,
  {
    governanceState = null,
    now = null,
  } = {}
) {
  if (!governanceState) {
    return {
      acceptedDrafts: drafts,
      blockedDrafts: [],
    };
  }

  const acceptedDrafts = [];
  const blockedDrafts = [];

  for (const draft of drafts) {
    const evaluation = evaluateThreadCandidate({
      candidate: normalizeDraftForGovernanceCheck(draft),
      governanceState,
      now,
    });

    if (evaluation.allowed) {
      acceptedDrafts.push(draft);
      continue;
    }

    blockedDrafts.push({
      draftIndex: draft.draftIndex ?? null,
      sourceIndex: draft.sourceIndex ?? null,
      tweetUrl: draft.url,
      rejectedReasons: evaluation.rejectedReasons,
    });
  }

  return {
    acceptedDrafts,
    blockedDrafts,
  };
}

export async function runManualReplyQueue({
  adapter,
  draftResult,
  governanceState = null,
  baseDir = process.cwd(),
  expectedHandle = null,
  personaProfile = null,
  startIndex = 0,
  maxReplies = 8,
  sendTimeoutMs = 180000,
  pollIntervalMs = 1000,
  continueOnUnconfirmed = false,
  onDraftPrepared = null,
  onDraftOutcome = null,
  onDraftBlocked = null,
  prepareReplyComposerFn = prepareReplyComposer,
  waitForManualReplySendFn = waitForManualReplySend,
  recordManualReplyOutcomeFn = recordManualReplyOutcome,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const selectedDrafts = selectReplyQueueDrafts(draftResult, {
    startIndex,
    maxReplies,
  });
  const { acceptedDrafts: drafts, blockedDrafts } = filterReplyQueueDraftsByGovernance(selectedDrafts, {
    governanceState,
  });
  const maxChecks = Math.max(1, Math.ceil(sendTimeoutMs / Math.max(100, pollIntervalMs)));
  const persona = personaProfile?.persona ?? "unknown";
  const outcomes = [];

  for (const blockedDraft of blockedDrafts) {
    if (typeof onDraftBlocked === "function") {
      await onDraftBlocked(blockedDraft);
    }
  }

  for (const draft of drafts) {
    const prepared = await prepareReplyComposerFn({
      adapter,
      tweetUrl: draft.url,
      replyText: draft.replyText,
      expectedHandle,
      personaProfile,
    });

    if (typeof onDraftPrepared === "function") {
      await onDraftPrepared({
        draft,
        prepared,
        totalDrafts: drafts.length,
      });
    }

    const observation = await waitForManualReplySendFn({
      adapter,
      replyText: draft.replyText,
      tweetUrl: draft.url,
      expectedHandle,
      maxChecks,
      waitMs: pollIntervalMs,
    });

    const recorded = await recordManualReplyOutcomeFn({
      baseDir,
      persona,
      draft,
      status: observation.status,
      observedState: observation.state,
    });

    outcomes.push({
      draftIndex: draft.draftIndex ?? null,
      sourceIndex: draft.sourceIndex,
      tweetUrl: draft.url,
      status: observation.status,
      prepared: {
        tweetUrl: prepared.tweetUrl,
        navigationAction: prepared.navigation.action,
        openAction: prepared.opened.action,
        textMatches: prepared.textMatches,
        canSubmit: prepared.state.canSubmit,
      },
      observation,
      recorded,
    });

    if (typeof onDraftOutcome === "function") {
      await onDraftOutcome({
        ...outcomes.at(-1),
        totalDrafts: drafts.length,
      });
    }

    if (!shouldContinueAfterObservation({ status: observation.status, continueOnUnconfirmed })) {
      break;
    }
  }

  return {
    ok: outcomes.every((outcome) => ["sent", "declined-by-operator"].includes(outcome.status)),
    processedCount: outcomes.length,
    blockedCount: blockedDrafts.length,
    sentCount: outcomes.filter((outcome) => outcome.status === "sent").length,
    declinedCount: outcomes.filter((outcome) => outcome.status === "declined-by-operator").length,
    stoppedEarly: outcomes.length < drafts.length,
    requestedDraftCount: drafts.length,
    blockedDrafts,
    outcomes,
  };
}
