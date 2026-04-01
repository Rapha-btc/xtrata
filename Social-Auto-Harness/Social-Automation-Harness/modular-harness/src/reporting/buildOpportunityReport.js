import { summarizeGovernanceForAnalysis } from "../analysis/analyzeCandidateBatch.js";

const RECOMMENDATION_RANK = {
  prioritize: 3,
  consider: 2,
  skip: 1,
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function sortOpportunities(opportunities) {
  return [...opportunities].sort((left, right) => {
    const recommendationDelta =
      (RECOMMENDATION_RANK[right.recommendation] ?? 0) -
      (RECOMMENDATION_RANK[left.recommendation] ?? 0);
    if (recommendationDelta !== 0) return recommendationDelta;

    const scoreDelta = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
    if (scoreDelta !== 0) return scoreDelta;

    return (right.safetyScore ?? 0) - (left.safetyScore ?? 0);
  });
}

function buildOpportunityItems(candidateType, analysisResult) {
  const enrichedAnalyses = analysisResult?.enrichedAnalyses ?? [];
  return sortOpportunities(
    enrichedAnalyses.map((entry, rankIndex) => ({
      rank: rankIndex + 1,
      candidateType,
      candidateIndex: entry.candidateIndex,
      recommendation: entry.recommendation,
      relevanceScore: entry.relevanceScore,
      safetyScore: entry.safetyScore,
      xtrataFit: entry.xtrataFit,
      suggestedAction: entry.suggestedAction,
      reasoning: entry.reasoning,
      draftBrief: entry.draftBrief,
      riskFlags: entry.riskFlags,
      candidate: entry.candidate,
    }))
  ).map((entry, sortedIndex) => ({
    ...entry,
    rank: sortedIndex + 1,
  }));
}

function summarizeRecommendationCounts(opportunities) {
  return opportunities.reduce(
    (counts, opportunity) => ({
      ...counts,
      [opportunity.recommendation]: (counts[opportunity.recommendation] ?? 0) + 1,
    }),
    { prioritize: 0, consider: 0, skip: 0 }
  );
}

function buildNextSteps({ threadOpportunities, followOpportunities, searchRefinementSuggestions }) {
  const nextSteps = [];

  if (threadOpportunities.some((entry) => entry.recommendation === "prioritize")) {
    nextSteps.push("Review the top prioritized thread opportunities for possible draft generation.");
  } else {
    nextSteps.push("Refine thread search terms before investing drafting effort.");
  }

  if (followOpportunities.some((entry) => entry.recommendation === "prioritize")) {
    nextSteps.push("Review prioritized follow opportunities and confirm they are not self or duplicate accounts.");
  }

  if (searchRefinementSuggestions.length > 0) {
    nextSteps.push("Apply the suggested search refinements before the next collection run.");
  }

  return nextSteps;
}

export function buildOpportunityReport({
  governanceState = null,
  threadCandidates = [],
  followCandidates = [],
  threadAnalysisResult = null,
  followAnalysisResult = null,
  generatedAt = new Date().toISOString(),
  sourceFiles = {},
} = {}) {
  const governanceSummary = summarizeGovernanceForAnalysis(governanceState);
  const threadOpportunities = buildOpportunityItems("thread", threadAnalysisResult);
  const followOpportunities = buildOpportunityItems("follow", followAnalysisResult);
  const searchRefinementSuggestions = unique([
    ...(threadAnalysisResult?.value?.searchRefinementSuggestions ?? []),
    ...(followAnalysisResult?.value?.searchRefinementSuggestions ?? []),
  ]);

  return {
    generatedAt,
    sourceFiles,
    governanceSummary,
    counts: {
      threadCandidates: threadCandidates.length,
      followCandidates: followCandidates.length,
      analyzedThreads: threadAnalysisResult?.analyzedCount ?? 0,
      analyzedFollows: followAnalysisResult?.analyzedCount ?? 0,
    },
    summaries: {
      threadAnalysisSummary: threadAnalysisResult?.value?.summary ?? null,
      followAnalysisSummary: followAnalysisResult?.value?.summary ?? null,
    },
    recommendationCounts: {
      thread: summarizeRecommendationCounts(threadOpportunities),
      follow: summarizeRecommendationCounts(followOpportunities),
    },
    threadOpportunities,
    followOpportunities,
    searchRefinementSuggestions,
    nextSteps: buildNextSteps({
      threadOpportunities,
      followOpportunities,
      searchRefinementSuggestions,
    }),
  };
}
