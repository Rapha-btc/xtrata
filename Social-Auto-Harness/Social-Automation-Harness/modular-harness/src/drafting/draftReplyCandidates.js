import { summarizeGovernanceForAnalysis } from "../analysis/analyzeCandidateBatch.js";
import { sendPromptForJson } from "../chatgpt/sendPromptForJson.js";

const ALLOWED_STATUSES = new Set(["draft", "skip"]);
const RECOMMENDATION_PRIORITY = {
  prioritize: 2,
  consider: 1,
  skip: 0,
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeDraftStatus(value) {
  return ALLOWED_STATUSES.has(value) ? value : "skip";
}

function normalizeReplyText(value) {
  if (value === null || value === undefined) return null;
  const normalized = value
    .toString()
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return normalized || null;
}

function compareTargets(left, right) {
  const recommendationDelta =
    (RECOMMENDATION_PRIORITY[right?.recommendation] ?? 0) -
    (RECOMMENDATION_PRIORITY[left?.recommendation] ?? 0);
  if (recommendationDelta !== 0) return recommendationDelta;

  const relevanceDelta = (right?.relevanceScore ?? 0) - (left?.relevanceScore ?? 0);
  if (relevanceDelta !== 0) return relevanceDelta;

  return (right?.safetyScore ?? 0) - (left?.safetyScore ?? 0);
}

function inferDraftIssues(replyText) {
  const issues = [];
  if (!replyText) {
    issues.push("empty-reply");
    return issues;
  }

  if (replyText.length > 280) {
    issues.push("over-280-chars");
  }

  if (/(^|\s)#[\p{L}\p{N}_]+/u.test(replyText)) {
    issues.push("contains-hashtag");
  }

  if (/^\s*(xtrata(?:\.xyz)?|@xtratalayers)\b/i.test(replyText)) {
    issues.push("xtrata-opener");
  }

  return issues;
}

function buildTargetFromOpportunity(opportunity, draftIndex) {
  return {
    draftIndex,
    rank: opportunity.rank ?? draftIndex + 1,
    candidateIndex: opportunity.candidateIndex ?? null,
    url: opportunity.candidate?.url ?? null,
    author: opportunity.candidate?.author ?? null,
    text: opportunity.candidate?.text ?? null,
    postedAt: opportunity.candidate?.postedAt ?? null,
    recommendation: opportunity.recommendation ?? "skip",
    relevanceScore: opportunity.relevanceScore ?? 0,
    safetyScore: opportunity.safetyScore ?? 0,
    xtrataFit: opportunity.xtrataFit ?? "low",
    suggestedAction: opportunity.suggestedAction ?? "skip",
    reasoning: opportunity.reasoning ?? "",
    draftBrief: opportunity.draftBrief ?? null,
    riskFlags: unique(opportunity.riskFlags ?? []),
  };
}

export function selectReplyDraftTargets({
  opportunityReport,
  maxDrafts = 3,
  minSafetyScore = 70,
} = {}) {
  const limitedMaxDrafts = Math.max(1, maxDrafts);
  const minimumSafetyScore = Number.isFinite(minSafetyScore) ? minSafetyScore : 70;

  return [...(opportunityReport?.threadOpportunities ?? [])]
    .filter((opportunity) => ["prioritize", "consider"].includes(opportunity?.recommendation))
    .filter((opportunity) => (opportunity?.safetyScore ?? 0) >= minimumSafetyScore)
    .filter((opportunity) => opportunity?.candidate?.url && opportunity?.candidate?.text)
    .sort(compareTargets)
    .slice(0, limitedMaxDrafts)
    .map((opportunity, draftIndex) => buildTargetFromOpportunity(opportunity, draftIndex));
}

export function buildReplyDraftPrompt({
  governanceState,
  draftTargets,
} = {}) {
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);

  return [
    "You are drafting conservative X replies for @XtrataLayers and xtrata.xyz.",
    "This is a report-only drafting step. Draft high-quality candidate replies, but skip anything that should not be answered.",
    `Current governance summary:\n${JSON.stringify(governanceSummary, null, 2)}`,
    "Reply rules:",
    "- Keep replies under 280 characters.",
    "- No hashtags in replies.",
    "- Mention xtrata.xyz only when it is genuinely relevant and never as the opening words.",
    "- Keep the tone natural, specific, and non-spammy.",
    "- Avoid price speculation, hype-y promises, or generic engagement bait.",
    "- If the candidate is weak or unsafe, return status skip and replyText null.",
    "Return one draft object for every draftIndex provided.",
    `Draft targets:\n${JSON.stringify(draftTargets, null, 2)}`,
  ].join("\n\n");
}

export function buildReplyDraftSchemaDescription(draftCount) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    '- candidateType: string, must equal "thread-reply-drafts"',
    "- summary: short string",
    `- drafts: array with ${draftCount} objects, one per draftIndex from 0 to ${Math.max(draftCount - 1, 0)}`,
    "Each draft object must include:",
    "- draftIndex: integer",
    '- status: "draft" | "skip"',
    "- url: string",
    "- replyText: string or null",
    "- reasoning: short string",
    "- safetyChecks: array of strings",
  ].join("\n");
}

function validateTopLevelDraftShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Draft result must be a JSON object.";
  }

  if (value.candidateType !== "thread-reply-drafts") {
    return 'Draft result candidateType must equal "thread-reply-drafts".';
  }

  if (!Array.isArray(value.drafts)) {
    return 'Draft result must include a "drafts" array.';
  }

  return true;
}

export function normalizeReplyDraftValue(value, { draftTargets = [] } = {}) {
  const draftsByIndex = new Map();

  for (const rawEntry of value?.drafts ?? []) {
    const draftIndex = Number.parseInt(rawEntry?.draftIndex, 10);
    if (!Number.isInteger(draftIndex) || draftIndex < 0 || draftIndex >= draftTargets.length) {
      continue;
    }

    if (draftsByIndex.has(draftIndex)) {
      continue;
    }

    const target = draftTargets[draftIndex] ?? null;
    const replyText = normalizeReplyText(rawEntry?.replyText);
    const inferredIssues = inferDraftIssues(replyText);
    const safetyChecks = unique([
      ...((rawEntry?.safetyChecks ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
      ...inferredIssues,
    ]);
    const mentionsXtrata = Boolean(replyText && /\bxtrata(?:\.xyz)?\b/i.test(replyText));
    const status = normalizeDraftStatus(rawEntry?.status);
    const ready = status === "draft" && Boolean(replyText) && inferredIssues.length === 0;

    draftsByIndex.set(draftIndex, {
      draftIndex,
      candidateIndex: target?.candidateIndex ?? null,
      url: normalizeString(rawEntry?.url, target?.url ?? ""),
      status,
      replyText,
      reasoning: normalizeString(rawEntry?.reasoning, "No draft reasoning returned."),
      safetyChecks,
      mentionsXtrata,
      characterCount: replyText?.length ?? 0,
      ready,
    });
  }

  const drafts = [];
  for (let draftIndex = 0; draftIndex < draftTargets.length; draftIndex += 1) {
    const target = draftTargets[draftIndex] ?? null;
    drafts.push(
      draftsByIndex.get(draftIndex) ?? {
        draftIndex,
        candidateIndex: target?.candidateIndex ?? null,
        url: target?.url ?? null,
        status: "skip",
        replyText: null,
        reasoning: "Model did not return a draft for this target.",
        safetyChecks: ["draft-missing"],
        mentionsXtrata: false,
        characterCount: 0,
        ready: false,
      }
    );
  }

  return {
    candidateType: "thread-reply-drafts",
    summary: normalizeString(value?.summary, "No draft summary returned."),
    drafts,
  };
}

export async function draftReplyCandidates({
  adapter,
  opportunityReport,
  governanceState = null,
  expectedAccountHint = null,
  personaProfile = null,
  maxDrafts = 3,
  minSafetyScore = 70,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!opportunityReport || typeof opportunityReport !== "object") {
    throw new TypeError("opportunityReport is required.");
  }

  const draftTargets = selectReplyDraftTargets({
    opportunityReport,
    maxDrafts,
    minSafetyScore,
  });
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);

  if (draftTargets.length === 0) {
    const value = {
      candidateType: "thread-reply-drafts",
      summary: "No eligible thread opportunities were selected for drafting.",
      drafts: [],
    };

    return {
      ok: true,
      skipped: true,
      inputCount: opportunityReport?.threadOpportunities?.length ?? 0,
      draftedCount: 0,
      governanceSummary,
      draftTargets,
      value,
      enrichedDrafts: [],
    };
  }

  const prompt = buildReplyDraftPrompt({
    governanceState,
    draftTargets,
  });
  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt,
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildReplyDraftSchemaDescription(draftTargets.length),
    expectedType: "object",
    requiredKeys: ["candidateType", "summary", "drafts"],
    validate: validateTopLevelDraftShape,
    ...jsonReplyOptions,
  });

  const value = normalizeReplyDraftValue(jsonResult.value, { draftTargets });
  const enrichedDrafts = value.drafts.map((draft) => ({
    ...draft,
    target: draftTargets[draft.draftIndex] ?? null,
  }));

  return {
    ...jsonResult,
    inputCount: opportunityReport?.threadOpportunities?.length ?? 0,
    draftedCount: draftTargets.length,
    governanceSummary,
    draftTargets,
    value,
    enrichedDrafts,
  };
}
