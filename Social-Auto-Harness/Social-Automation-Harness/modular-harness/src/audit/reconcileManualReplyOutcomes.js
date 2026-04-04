import { loadGovernanceState, normalizeGovernanceUrl } from "../governance/loadGovernanceState.js";
import { recordManualReplyOutcome } from "./replyHistory.js";
import { buildXStatusUrl, readReplySendObservationState } from "../x/replyComposer.js";
import { openVerifiedXTab } from "../x/openVerifiedXTab.js";

function resolveSourceDrafts(draftResult) {
  if (Array.isArray(draftResult?.enrichedDrafts)) {
    return draftResult.enrichedDrafts;
  }
  if (Array.isArray(draftResult?.value?.drafts)) {
    return draftResult.value.drafts;
  }

  throw new TypeError("draftResult must contain enrichedDrafts or value.drafts.");
}

function resolveOutcomeDraft(drafts, outcome) {
  const draftIndex = Number.isInteger(outcome?.draftIndex) ? outcome.draftIndex : null;
  if (draftIndex !== null) {
    const matchedByDraftIndex = drafts.find((draft) => draft?.draftIndex === draftIndex);
    if (matchedByDraftIndex) return matchedByDraftIndex;
  }

  const sourceIndex = Number.isInteger(outcome?.sourceIndex) ? outcome.sourceIndex : null;
  if (sourceIndex !== null && sourceIndex >= 0 && sourceIndex < drafts.length) {
    return drafts[sourceIndex] ?? null;
  }

  return null;
}

export function selectReplyDraftsForReconciliation({
  draftResult,
  queueResult = null,
} = {}) {
  const drafts = resolveSourceDrafts(draftResult);

  if (!queueResult?.outcomes?.length) {
    return drafts.filter((draft) => draft?.ready !== false && draft?.replyText && draft?.url);
  }

  return queueResult.outcomes
    .filter((outcome) => outcome?.status !== "sent")
    .map((outcome) => ({
      ...resolveOutcomeDraft(drafts, outcome),
      _queueOutcome: outcome,
    }))
    .filter((draft) => draft?.ready !== false && draft?.replyText && draft?.url);
}

export async function reconcileManualReplyOutcomes({
  adapter,
  draftResult,
  queueResult = null,
  baseDir = process.cwd(),
  expectedHandle = null,
  personaProfile = null,
  loadGovernanceStateFn = loadGovernanceState,
  openVerifiedXTabFn = openVerifiedXTab,
  readReplySendObservationStateFn = readReplySendObservationState,
  recordManualReplyOutcomeFn = recordManualReplyOutcome,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const governanceState = await loadGovernanceStateFn({ baseDir });
  const drafts = selectReplyDraftsForReconciliation({ draftResult, queueResult });
  const postedThreadUrls = new Set(governanceState?.postedThreads?.urls ?? []);
  const persona = personaProfile?.persona ?? "unknown";
  const outcomes = [];

  for (const draft of drafts) {
    const normalizedThreadUrl = normalizeGovernanceUrl(draft.url);
    if (normalizedThreadUrl && postedThreadUrls.has(normalizedThreadUrl)) {
      outcomes.push({
        draftIndex: draft.draftIndex ?? null,
        tweetUrl: draft.url,
        status: "already-posted",
        recorded: null,
      });
      continue;
    }

    await openVerifiedXTabFn({
      adapter,
      expectedHandle,
      personaProfile,
      targetUrl: buildXStatusUrl(draft.url),
      matchTab: (tab) => normalizeGovernanceUrl(tab?.url ?? null) === normalizeGovernanceUrl(buildXStatusUrl(draft.url)),
    });

    const observedState = await readReplySendObservationStateFn({
      adapter,
      replyText: draft.replyText,
      tweetUrl: draft.url,
      expectedHandle,
    });

    if (observedState.matchingReplyVisible) {
      const recorded = await recordManualReplyOutcomeFn({
        baseDir,
        persona,
        draft,
        status: "sent",
        observedState,
      });

      if (normalizedThreadUrl) {
        postedThreadUrls.add(normalizedThreadUrl);
      }

      outcomes.push({
        draftIndex: draft.draftIndex ?? null,
        tweetUrl: draft.url,
        status: "reconciled-sent",
        recorded,
      });
      continue;
    }

    outcomes.push({
      draftIndex: draft.draftIndex ?? null,
      tweetUrl: draft.url,
      status: "reply-not-found",
      recorded: null,
    });
  }

  return {
    ok: true,
    inspectedCount: drafts.length,
    reconciledCount: outcomes.filter((outcome) => outcome.status === "reconciled-sent").length,
    alreadyPostedCount: outcomes.filter((outcome) => outcome.status === "already-posted").length,
    unresolvedCount: outcomes.filter((outcome) => outcome.status === "reply-not-found").length,
    outcomes,
  };
}
