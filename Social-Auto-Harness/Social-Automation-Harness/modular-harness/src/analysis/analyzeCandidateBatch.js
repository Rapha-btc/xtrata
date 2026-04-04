import { sendPromptForJson } from "../chatgpt/sendPromptForJson.js";

const ALLOWED_CANDIDATE_TYPES = new Set(["thread", "follow"]);
const ALLOWED_RECOMMENDATIONS = new Set(["prioritize", "consider", "skip"]);
const ALLOWED_XTRATA_FIT = new Set(["high", "medium", "low"]);

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function clampScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeRecommendation(value) {
  return ALLOWED_RECOMMENDATIONS.has(value) ? value : "skip";
}

function normalizeXtrataFit(value) {
  return ALLOWED_XTRATA_FIT.has(value) ? value : "low";
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export function summarizeGovernanceForAnalysis(governanceState) {
  const currentMode = governanceState?.mode?.currentMode ?? null;
  const currentConfig = governanceState?.mode?.currentConfig ?? {};
  const pendingImprovementTitles = (governanceState?.pendingImprovements?.pendingItems ?? [])
    .slice(0, 5)
    .map((item) => item.title);

  return {
    currentMode,
    currentConfig,
    lastStrategyUsed: governanceState?.diversity?.lastStrategyUsed ?? null,
    lastStandaloneAngle: governanceState?.diversity?.lastStandaloneAngle ?? null,
    cooldownDays: governanceState?.diversity?.cooldownDays ?? null,
    pendingImprovementsCount: governanceState?.pendingImprovements?.pendingItems?.length ?? 0,
    pendingImprovementTitles,
    followedAccountsCount: governanceState?.followedAccounts?.handles?.length ?? 0,
  };
}

export function normalizeCandidateForAnalysis(candidateType, candidate, candidateIndex) {
  if (candidateType === "thread") {
    return {
      candidateIndex,
      author: candidate.author ?? null,
      url: candidate.url ?? null,
      text: candidate.text ?? null,
      postedAt: candidate.postedAt ?? null,
      authorBio: candidate.authorBio ?? null,
      authorBioObserved: candidate.authorBioObserved ?? false,
      source: candidate.source ?? null,
      searchQuery: candidate.searchQuery ?? null,
    };
  }

  if (candidateType === "follow") {
    return {
      candidateIndex,
      handle: candidate.handle ?? null,
      bio: candidate.bio ?? null,
      bioObserved: candidate.bioObserved ?? false,
      followers: candidate.followers ?? null,
      following: candidate.following ?? null,
      postCount: candidate.postCount ?? null,
      source: candidate.source ?? null,
    };
  }

  throw new TypeError(`Unsupported candidate type "${candidateType}".`);
}

export function buildCandidateAnalysisPrompt({
  candidateType,
  candidates,
  governanceState,
  maxCandidates,
} = {}) {
  if (!ALLOWED_CANDIDATE_TYPES.has(candidateType)) {
    throw new TypeError(`Unsupported candidate type "${candidateType}".`);
  }

  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);
  const analysisTarget =
    candidateType === "thread"
      ? "reply or save-for-later opportunities"
      : "follow opportunities";
  const typeSpecificRules =
    candidateType === "thread"
      ? [
          "Prefer skip for weakly relevant or generic crypto chatter.",
          "For strong fits, favor contextual, natural replies over overt promotion.",
          "Use prioritize sparingly and reserve it for threads with a clear reply surface, strong topical fit, and low obvious downside.",
          "Prefer breadth across different authors and angles; do not fill the top tier with repetitive threads that would lead to near-duplicate replies.",
          "If two threads are highly similar, recommend the stronger one and downgrade the weaker one.",
          "Risk flags should call out cooldown, obvious spam, low topical fit, or likely low-engagement threads.",
        ]
      : [
          "Prefer genuine Bitcoin, Stacks, Ordinals, generative-art, or builder-adjacent accounts.",
          "Skip obvious self accounts, spam, generic farming accounts, or low-signal follows.",
          "Risk flags should call out self-follow risk, low signal, obvious spam, or unclear topical fit.",
        ];

  return [
    "You are evaluating candidate X/Twitter targets for @XtrataLayers and xtrata.xyz.",
    "This is a report-only planning step. Do not propose posting actions directly; recommend candidate quality conservatively.",
    `Current governance summary:\n${JSON.stringify(governanceSummary, null, 2)}`,
    `You are analyzing ${Math.min(candidates.length, maxCandidates ?? candidates.length)} ${candidateType} candidates for ${analysisTarget}.`,
    `Rules for this batch:\n- ${typeSpecificRules.join("\n- ")}`,
    "Your goal is to surface only the highest-quality opportunities that could justify real attention in a single session.",
    "Return one analysis object for every candidateIndex provided.",
    "Use recommendation values only from: prioritize, consider, skip.",
    "Use xtrataFit values only from: high, medium, low.",
    "Keep reasoning and draftBrief concise but specific enough to differentiate one strong thread from another.",
    `Candidate batch:\n${JSON.stringify(candidates, null, 2)}`,
  ].join("\n\n");
}

export function buildCandidateAnalysisSchemaDescription(candidateType, candidateCount) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    `- candidateType: string, must equal "${candidateType}"`,
    "- summary: short string",
    "- searchRefinementSuggestions: array of strings",
    `- analyses: array with ${candidateCount} objects, one per candidateIndex from 0 to ${Math.max(candidateCount - 1, 0)}`,
    "Each analysis object must include:",
    "- candidateIndex: integer",
    '- recommendation: "prioritize" | "consider" | "skip"',
    "- relevanceScore: integer 0-100",
    "- safetyScore: integer 0-100",
    '- xtrataFit: "high" | "medium" | "low"',
    "- suggestedAction: short string",
    "- reasoning: short string",
    "- draftBrief: short string or null",
    "- riskFlags: array of strings",
  ].join("\n");
}

function validateTopLevelAnalysisShape(value, candidateType) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Analysis result must be a JSON object.";
  }

  if (value.candidateType !== candidateType) {
    return `Analysis candidateType must equal "${candidateType}".`;
  }

  if (!Array.isArray(value.analyses)) {
    return 'Analysis result must include an "analyses" array.';
  }

  if (!Array.isArray(value.searchRefinementSuggestions)) {
    return 'Analysis result must include a "searchRefinementSuggestions" array.';
  }

  return true;
}

export function normalizeCandidateAnalysisValue(value, { candidateType, candidateCount } = {}) {
  const analysisByIndex = new Map();

  for (const rawEntry of value.analyses ?? []) {
    const candidateIndex = Number.parseInt(rawEntry?.candidateIndex, 10);
    if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex >= candidateCount) {
      continue;
    }

    if (analysisByIndex.has(candidateIndex)) {
      continue;
    }

    analysisByIndex.set(candidateIndex, {
      candidateIndex,
      recommendation: normalizeRecommendation(rawEntry?.recommendation),
      relevanceScore: clampScore(rawEntry?.relevanceScore),
      safetyScore: clampScore(rawEntry?.safetyScore, 50),
      xtrataFit: normalizeXtrataFit(rawEntry?.xtrataFit),
      suggestedAction: normalizeString(rawEntry?.suggestedAction, "skip"),
      reasoning: normalizeString(rawEntry?.reasoning, "No analysis returned."),
      draftBrief: rawEntry?.draftBrief === null ? null : normalizeString(rawEntry?.draftBrief, ""),
      riskFlags: unique((rawEntry?.riskFlags ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
    });
  }

  const analyses = [];
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    analyses.push(
      analysisByIndex.get(candidateIndex) ?? {
        candidateIndex,
        recommendation: "skip",
        relevanceScore: 0,
        safetyScore: 50,
        xtrataFit: "low",
        suggestedAction: "skip",
        reasoning: "Model did not return analysis for this candidate.",
        draftBrief: null,
        riskFlags: ["analysis-missing"],
      }
    );
  }

  return {
    candidateType,
    summary: normalizeString(value.summary, "No summary returned."),
    searchRefinementSuggestions: unique(
      (value.searchRefinementSuggestions ?? []).map((entry) => normalizeString(entry)).filter(Boolean)
    ),
    analyses,
  };
}

export async function analyzeCandidateBatch({
  adapter,
  candidateType,
  candidates = [],
  governanceState = null,
  expectedAccountHint = null,
  personaProfile = null,
  maxCandidates = 20,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  if (!ALLOWED_CANDIDATE_TYPES.has(candidateType)) {
    throw new TypeError(`Unsupported candidate type "${candidateType}".`);
  }

  const candidateLimit = Math.max(1, maxCandidates);
  const analyzedCandidates = candidates
    .slice(0, candidateLimit)
    .map((candidate, candidateIndex) => normalizeCandidateForAnalysis(candidateType, candidate, candidateIndex));
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);

  if (analyzedCandidates.length === 0) {
    const value = {
      candidateType,
      summary: "No candidates were provided for analysis.",
      searchRefinementSuggestions: [],
      analyses: [],
    };

    return {
      ok: true,
      skipped: true,
      candidateType,
      inputCount: candidates.length,
      analyzedCount: 0,
      governanceSummary,
      analyzedCandidates,
      value,
      enrichedAnalyses: [],
    };
  }

  const prompt = buildCandidateAnalysisPrompt({
    candidateType,
    candidates: analyzedCandidates,
    governanceState,
    maxCandidates: candidateLimit,
  });
  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt,
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildCandidateAnalysisSchemaDescription(candidateType, analyzedCandidates.length),
    expectedType: "object",
    requiredKeys: ["candidateType", "summary", "searchRefinementSuggestions", "analyses"],
    validate(value) {
      return validateTopLevelAnalysisShape(value, candidateType);
    },
    ...jsonReplyOptions,
  });

  const normalizedValue = normalizeCandidateAnalysisValue(jsonResult.value, {
    candidateType,
    candidateCount: analyzedCandidates.length,
  });
  const enrichedAnalyses = normalizedValue.analyses.map((analysis) => ({
    ...analysis,
    candidate: analyzedCandidates[analysis.candidateIndex] ?? null,
  }));

  return {
    ...jsonResult,
    candidateType,
    inputCount: candidates.length,
    analyzedCount: analyzedCandidates.length,
    governanceSummary,
    analyzedCandidates,
    value: normalizedValue,
    enrichedAnalyses,
  };
}
