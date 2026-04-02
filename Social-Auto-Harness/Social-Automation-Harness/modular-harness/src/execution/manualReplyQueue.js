import { recordManualReplyOutcome } from "../audit/replyHistory.js";
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

export function isReadyReplyDraft(draft) {
  return Boolean(resolveTweetUrl(draft) && resolveReplyText(draft) && draft?.ready !== false);
}

export function selectReplyQueueDrafts(
  draftResult,
  {
    startIndex = 0,
    maxReplies = 3,
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

export async function runManualReplyQueue({
  adapter,
  draftResult,
  baseDir = process.cwd(),
  expectedHandle = null,
  personaProfile = null,
  startIndex = 0,
  maxReplies = 3,
  sendTimeoutMs = 180000,
  pollIntervalMs = 1000,
  continueOnUnconfirmed = false,
  onDraftPrepared = null,
  onDraftOutcome = null,
  prepareReplyComposerFn = prepareReplyComposer,
  waitForManualReplySendFn = waitForManualReplySend,
  recordManualReplyOutcomeFn = recordManualReplyOutcome,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const drafts = selectReplyQueueDrafts(draftResult, {
    startIndex,
    maxReplies,
  });
  const maxChecks = Math.max(1, Math.ceil(sendTimeoutMs / Math.max(100, pollIntervalMs)));
  const persona = personaProfile?.persona ?? "unknown";
  const outcomes = [];

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

    if (observation.status !== "sent" && !continueOnUnconfirmed) {
      break;
    }
  }

  return {
    ok: outcomes.every((outcome) => outcome.status === "sent"),
    processedCount: outcomes.length,
    sentCount: outcomes.filter((outcome) => outcome.status === "sent").length,
    stoppedEarly: outcomes.length < drafts.length,
    requestedDraftCount: drafts.length,
    outcomes,
  };
}
