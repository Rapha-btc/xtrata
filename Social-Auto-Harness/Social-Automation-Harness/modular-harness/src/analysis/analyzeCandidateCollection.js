import { sendPromptForJson } from "../chatgpt/sendPromptForJson.js";
import {
  analyzeCandidateBatch,
  normalizeCandidateForAnalysis,
  summarizeGovernanceForAnalysis,
} from "./analyzeCandidateBatch.js";

const RECOMMENDATION_RANK = {
  prioritize: 3,
  consider: 2,
  skip: 1,
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function clampPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function chunkArray(values, chunkSize) {
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function sortByPriority(entries) {
  return [...entries].sort((left, right) => {
    const recommendationDelta =
      (RECOMMENDATION_RANK[right.recommendation] ?? 0) -
      (RECOMMENDATION_RANK[left.recommendation] ?? 0);
    if (recommendationDelta !== 0) return recommendationDelta;

    const relevanceDelta = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
    if (relevanceDelta !== 0) return relevanceDelta;

    return (right.safetyScore ?? 0) - (left.safetyScore ?? 0);
  });
}

function buildBatchSummaryEntry(batchIndex, batchStart, batchSize, batchResult) {
  return {
    batchIndex,
    batchStart,
    batchSize,
    analyzedCount: batchResult?.analyzedCount ?? 0,
    summary: batchResult?.value?.summary ?? null,
    searchRefinementSuggestions: batchResult?.value?.searchRefinementSuggestions ?? [],
  };
}

function remapBatchAnalyses(batchResult, batchStart) {
  return (batchResult?.value?.analyses ?? []).map((analysis) => ({
    ...analysis,
    candidateIndex: batchStart + analysis.candidateIndex,
  }));
}

function buildSynthesisShortlistEntries({
  analyzedCandidates,
  mergedAnalyses,
  finalSynthesisLimit,
} = {}) {
  const candidateByIndex = new Map(
    analyzedCandidates.map((candidate) => [candidate.candidateIndex, candidate])
  );
  const shortlisted = sortByPriority(
    mergedAnalyses
      .map((analysis) => ({
        ...analysis,
        candidate: candidateByIndex.get(analysis.candidateIndex) ?? null,
      }))
      .filter(
        (analysis) =>
          analysis.recommendation !== "skip" ||
          analysis.relevanceScore >= 55 ||
          analysis.xtrataFit !== "low"
      )
  ).slice(0, finalSynthesisLimit);

  return shortlisted.map((entry, shortlistIndex) => ({
    shortlistIndex,
    candidateIndex: entry.candidateIndex,
    author: entry.candidate?.author ?? null,
    url: entry.candidate?.url ?? null,
    text: entry.candidate?.text ?? null,
    postedAt: entry.candidate?.postedAt ?? null,
    source: entry.candidate?.source ?? null,
    searchQuery: entry.candidate?.searchQuery ?? null,
    preliminaryRecommendation: entry.recommendation,
    preliminaryRelevanceScore: entry.relevanceScore,
    preliminarySafetyScore: entry.safetyScore,
    preliminaryXtrataFit: entry.xtrataFit,
    preliminarySuggestedAction: entry.suggestedAction,
    preliminaryReasoning: entry.reasoning,
    preliminaryDraftBrief: entry.draftBrief,
    preliminaryRiskFlags: entry.riskFlags,
  }));
}

export function buildCandidateAnalysisSynthesisPrompt({
  candidateType,
  governanceState,
  shortlistedEntries,
} = {}) {
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);
  const analysisTarget =
    candidateType === "thread"
      ? "final thread-reply shortlist"
      : "final follow shortlist";

  return [
    "You are calibrating the final shortlist for @XtrataLayers and xtrata.xyz after an initial multi-batch review.",
    "This is still a report-only planning step. Be more selective than the first pass.",
    `Current governance summary:\n${JSON.stringify(governanceSummary, null, 2)}`,
    `You are reviewing ${shortlistedEntries.length} shortlisted ${candidateType} candidates for the ${analysisTarget}.`,
    "Use the preliminary analysis as input, not as a mandate. Downgrade aggressively if a candidate is repetitive, weakly relevant, or likely to produce a bland reply.",
    "Prefer breadth across authors and angles. Use prioritize very sparingly.",
    "Return one synthesis analysis object for every shortlistIndex provided.",
    "Keep reasoning and draftBrief concise but specific enough to support a strong later draft.",
    `Shortlist:\n${JSON.stringify(shortlistedEntries, null, 2)}`,
  ].join("\n\n");
}

export function buildCandidateAnalysisSynthesisSchemaDescription(candidateType, shortlistCount) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    `- candidateType: string, must equal "${candidateType}"`,
    "- summary: short string",
    "- searchRefinementSuggestions: array of strings",
    `- analyses: array with ${shortlistCount} objects, one per shortlistIndex from 0 to ${Math.max(shortlistCount - 1, 0)}`,
    "Each analysis object must include:",
    "- shortlistIndex: integer",
    "- candidateIndex: integer, must equal the candidateIndex provided for that shortlist item",
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

function validateSynthesisShape(value, candidateType) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Synthesis result must be a JSON object.";
  }

  if (value.candidateType !== candidateType) {
    return `Synthesis candidateType must equal "${candidateType}".`;
  }

  if (!Array.isArray(value.analyses)) {
    return 'Synthesis result must include an "analyses" array.';
  }

  if (!Array.isArray(value.searchRefinementSuggestions)) {
    return 'Synthesis result must include a "searchRefinementSuggestions" array.';
  }

  return true;
}

export function normalizeCandidateAnalysisSynthesisValue(
  value,
  {
    candidateType,
    shortlistedEntries,
  } = {}
) {
  const byShortlistIndex = new Map();

  for (const rawEntry of value?.analyses ?? []) {
    const shortlistIndex = Number.parseInt(rawEntry?.shortlistIndex, 10);
    if (!Number.isInteger(shortlistIndex) || shortlistIndex < 0 || shortlistIndex >= shortlistedEntries.length) {
      continue;
    }

    if (byShortlistIndex.has(shortlistIndex)) {
      continue;
    }

    const shortlistEntry = shortlistedEntries[shortlistIndex];
    byShortlistIndex.set(shortlistIndex, {
      candidateIndex: shortlistEntry.candidateIndex,
      recommendation: ["prioritize", "consider", "skip"].includes(rawEntry?.recommendation)
        ? rawEntry.recommendation
        : shortlistEntry.preliminaryRecommendation,
      relevanceScore: Number.isFinite(Number(rawEntry?.relevanceScore))
        ? Math.max(0, Math.min(100, Math.round(Number(rawEntry.relevanceScore))))
        : shortlistEntry.preliminaryRelevanceScore,
      safetyScore: Number.isFinite(Number(rawEntry?.safetyScore))
        ? Math.max(0, Math.min(100, Math.round(Number(rawEntry.safetyScore))))
        : shortlistEntry.preliminarySafetyScore,
      xtrataFit: ["high", "medium", "low"].includes(rawEntry?.xtrataFit)
        ? rawEntry.xtrataFit
        : shortlistEntry.preliminaryXtrataFit,
      suggestedAction: normalizeString(rawEntry?.suggestedAction, shortlistEntry.preliminarySuggestedAction),
      reasoning: normalizeString(rawEntry?.reasoning, shortlistEntry.preliminaryReasoning),
      draftBrief:
        rawEntry?.draftBrief === null
          ? null
          : normalizeString(rawEntry?.draftBrief, shortlistEntry.preliminaryDraftBrief ?? ""),
      riskFlags: unique(
        (Array.isArray(rawEntry?.riskFlags) ? rawEntry.riskFlags : shortlistEntry.preliminaryRiskFlags ?? [])
          .map((entry) => normalizeString(entry))
          .filter(Boolean)
      ),
    });
  }

  return {
    candidateType,
    summary: normalizeString(value?.summary, "No synthesis summary returned."),
    searchRefinementSuggestions: unique(
      (value?.searchRefinementSuggestions ?? []).map((entry) => normalizeString(entry)).filter(Boolean)
    ),
    analyses: shortlistedEntries.map((entry) => ({
      candidateIndex: entry.candidateIndex,
      recommendation: entry.preliminaryRecommendation,
      relevanceScore: entry.preliminaryRelevanceScore,
      safetyScore: entry.preliminarySafetyScore,
      xtrataFit: entry.preliminaryXtrataFit,
      suggestedAction: entry.preliminarySuggestedAction,
      reasoning: entry.preliminaryReasoning,
      draftBrief: entry.preliminaryDraftBrief,
      riskFlags: unique(entry.preliminaryRiskFlags ?? []),
      ...(byShortlistIndex.get(entry.shortlistIndex) ?? {}),
    })),
  };
}

async function maybeCloseOpenedTab(adapter, session, shouldClose) {
  if (!shouldClose) return;
  if (session?.action !== "opened-new-tab") return;
  if (!Number.isFinite(session?.tab?.windowId) || !Number.isFinite(session?.tab?.tabIndex)) return;
  if (typeof adapter?.closeTab !== "function") return;

  await adapter.closeTab(session.tab);
}

export async function analyzeCandidateCollection({
  adapter,
  candidateType,
  candidates = [],
  governanceState = null,
  expectedAccountHint = null,
  personaProfile = null,
  maxCandidates = 100,
  batchSize = 25,
  finalSynthesisLimit = 25,
  freshChatGPTTabPerBatch = true,
  closeBatchTabs = true,
  analyzeCandidateBatchFn = analyzeCandidateBatch,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const candidateLimit = Math.max(1, Math.min(100, clampPositiveInteger(maxCandidates, 100)));
  const normalizedBatchSize = Math.max(1, clampPositiveInteger(batchSize, 25));
  const normalizedFinalSynthesisLimit = Math.max(
    1,
    clampPositiveInteger(finalSynthesisLimit, 25)
  );
  const limitedCandidates = candidates.slice(0, candidateLimit);
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);
  const analyzedCandidates = limitedCandidates.map((candidate, candidateIndex) =>
    normalizeCandidateForAnalysis(candidateType, candidate, candidateIndex)
  );

  if (analyzedCandidates.length === 0) {
    return {
      ok: true,
      skipped: true,
      candidateType,
      inputCount: candidates.length,
      analyzedCount: 0,
      governanceSummary,
      analyzedCandidates,
      batchSummaries: [],
      value: {
        candidateType,
        summary: "No candidates were provided for analysis.",
        searchRefinementSuggestions: [],
        analyses: [],
      },
      enrichedAnalyses: [],
    };
  }

  const candidateChunks = chunkArray(limitedCandidates, normalizedBatchSize);
  const batchSummaries = [];
  let mergedAnalyses = [];

  for (let batchIndex = 0; batchIndex < candidateChunks.length; batchIndex += 1) {
    const batchCandidates = candidateChunks[batchIndex];
    const batchStart = batchIndex * normalizedBatchSize;
    const batchResult = await analyzeCandidateBatchFn({
      adapter,
      candidateType,
      candidates: batchCandidates,
      governanceState,
      expectedAccountHint,
      personaProfile,
      maxCandidates: batchCandidates.length,
      sendPromptForJsonFn,
      forceNewTab: freshChatGPTTabPerBatch,
      ...jsonReplyOptions,
    });

    batchSummaries.push(
      buildBatchSummaryEntry(batchIndex, batchStart, batchCandidates.length, batchResult)
    );
    mergedAnalyses = mergedAnalyses.concat(remapBatchAnalyses(batchResult, batchStart));
    await maybeCloseOpenedTab(adapter, batchResult.session, closeBatchTabs);
  }

  const shortlistEntries = buildSynthesisShortlistEntries({
    analyzedCandidates,
    mergedAnalyses,
    finalSynthesisLimit: normalizedFinalSynthesisLimit,
  });

  let synthesisResult = null;
  if (shortlistEntries.length > 0) {
    const prompt = buildCandidateAnalysisSynthesisPrompt({
      candidateType,
      governanceState,
      shortlistedEntries: shortlistEntries,
    });
    const jsonResult = await sendPromptForJsonFn({
      adapter,
      prompt,
      expectedAccountHint,
      personaProfile,
      schemaDescription: buildCandidateAnalysisSynthesisSchemaDescription(candidateType, shortlistEntries.length),
      expectedType: "object",
      requiredKeys: ["candidateType", "summary", "searchRefinementSuggestions", "analyses"],
      validate(value) {
        return validateSynthesisShape(value, candidateType);
      },
      forceNewTab: freshChatGPTTabPerBatch,
      ...jsonReplyOptions,
    });

    const normalizedValue = normalizeCandidateAnalysisSynthesisValue(jsonResult.value, {
      candidateType,
      shortlistedEntries: shortlistEntries,
    });
    const synthesisByCandidateIndex = new Map(
      normalizedValue.analyses.map((analysis) => [analysis.candidateIndex, analysis])
    );
    mergedAnalyses = mergedAnalyses.map((analysis) => synthesisByCandidateIndex.get(analysis.candidateIndex) ?? analysis);
    synthesisResult = {
      ...jsonResult,
      shortlistedCount: shortlistEntries.length,
      value: normalizedValue,
    };
    await maybeCloseOpenedTab(adapter, jsonResult.session, closeBatchTabs);
  }

  const candidateByIndex = new Map(
    analyzedCandidates.map((candidate) => [candidate.candidateIndex, candidate])
  );
  const enrichedAnalyses = mergedAnalyses.map((analysis) => ({
    ...analysis,
    candidate: candidateByIndex.get(analysis.candidateIndex) ?? null,
  }));
  const searchRefinementSuggestions = unique([
    ...batchSummaries.flatMap((entry) => entry.searchRefinementSuggestions ?? []),
    ...(synthesisResult?.value?.searchRefinementSuggestions ?? []),
  ]);

  return {
    ok: true,
    candidateType,
    inputCount: candidates.length,
    analyzedCount: analyzedCandidates.length,
    governanceSummary,
    analyzedCandidates,
    batchSummaries,
    synthesisResult: synthesisResult
      ? {
          shortlistedCount: synthesisResult.shortlistedCount,
          summary: synthesisResult.value.summary,
          searchRefinementSuggestions: synthesisResult.value.searchRefinementSuggestions,
        }
      : null,
    value: {
      candidateType,
      summary:
        synthesisResult?.value?.summary ??
        batchSummaries.map((entry) => entry.summary).filter(Boolean).join(" "),
      searchRefinementSuggestions,
      analyses: enrichedAnalyses.map(({ candidate, ...analysis }) => analysis),
    },
    enrichedAnalyses,
  };
}
