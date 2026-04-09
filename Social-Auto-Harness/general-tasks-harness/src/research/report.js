const RECOMMENDATION_RANK = {
  prioritize: 3,
  consider: 2,
  skip: 1,
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function sortFindings(entries) {
  return [...entries].sort((left, right) => {
    const recommendationDelta =
      (RECOMMENDATION_RANK[right.recommendation] ?? 0) -
      (RECOMMENDATION_RANK[left.recommendation] ?? 0);
    if (recommendationDelta !== 0) return recommendationDelta;

    const relevanceDelta = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
    if (relevanceDelta !== 0) return relevanceDelta;

    const credibilityDelta = (right.credibilityScore ?? 0) - (left.credibilityScore ?? 0);
    if (credibilityDelta !== 0) return credibilityDelta;

    return (right.noveltyScore ?? 0) - (left.noveltyScore ?? 0);
  });
}

function buildTopFindings(analysisResult) {
  return sortFindings(
    (analysisResult?.enrichedAnalyses ?? []).filter((entry) =>
      ["prioritize", "consider"].includes(entry.recommendation)
    )
  ).map((entry, rankIndex) => ({
    rank: rankIndex + 1,
    recommendation: entry.recommendation,
    suggestedUse: entry.suggestedUse,
    relevanceScore: entry.relevanceScore,
    credibilityScore: entry.credibilityScore,
    noveltyScore: entry.noveltyScore,
    reasoning: entry.reasoning,
    keyTakeaway: entry.keyTakeaway,
    riskFlags: entry.riskFlags,
    item: entry.item,
  }));
}

function summarizeRecommendationCounts(entries) {
  return entries.reduce(
    (counts, entry) => ({
      ...counts,
      [entry.recommendation]: (counts[entry.recommendation] ?? 0) + 1,
    }),
    { prioritize: 0, consider: 0, skip: 0 }
  );
}

function buildEvidenceBySource(analysisResult) {
  const grouped = new Map();

  for (const entry of analysisResult?.enrichedAnalyses ?? []) {
    const item = entry.item ?? {};
    const groupKey = `${item.sourceLabel ?? "Unknown"}\n${item.query ?? ""}`;
    const existing = grouped.get(groupKey) ?? {
      sourceType: item.sourceType ?? null,
      sourceLabel: item.sourceLabel ?? "Unknown source",
      query: item.query ?? null,
      items: [],
    };
    existing.items.push({
      recommendation: entry.recommendation,
      suggestedUse: entry.suggestedUse,
      relevanceScore: entry.relevanceScore,
      credibilityScore: entry.credibilityScore,
      noveltyScore: entry.noveltyScore,
      reasoning: entry.reasoning,
      keyTakeaway: entry.keyTakeaway,
      riskFlags: entry.riskFlags,
      item,
    });
    grouped.set(groupKey, existing);
  }

  return [...grouped.values()]
    .map((group) => {
      const sortedItems = sortFindings(group.items);
      return {
        sourceType: group.sourceType,
        sourceLabel: group.sourceLabel,
        query: group.query,
        itemCount: sortedItems.length,
        recommendationCounts: summarizeRecommendationCounts(sortedItems),
        items: sortedItems,
      };
    })
    .sort((left, right) => left.sourceLabel.localeCompare(right.sourceLabel) || (left.query ?? "").localeCompare(right.query ?? ""));
}

function buildOpenQuestionsAndGaps({ topFindings, evidenceBySource, searchRefinementSuggestions }) {
  const riskFlags = unique(
    evidenceBySource.flatMap((group) =>
      group.items.flatMap((entry) => entry.riskFlags ?? []).filter(Boolean)
    )
  );
  const openQuestions = [];

  if (topFindings.length === 0) {
    openQuestions.push("The reviewed items did not produce any high-confidence findings for the requested objective.");
  }

  if (riskFlags.length > 0) {
    openQuestions.push(`Items still need verification around: ${riskFlags.join(", ")}.`);
  }

  if (searchRefinementSuggestions.length > 0) {
    openQuestions.push("Search coverage should be refined or widened in the next run.");
  }

  if (openQuestions.length === 0) {
    openQuestions.push("No major open gaps were identified in the reviewed set.");
  }

  return openQuestions;
}

function buildAppendix(analysisResult) {
  return sortFindings(analysisResult?.enrichedAnalyses ?? []).map((entry, rankIndex) => ({
    rank: rankIndex + 1,
    recommendation: entry.recommendation,
    suggestedUse: entry.suggestedUse,
    relevanceScore: entry.relevanceScore,
    credibilityScore: entry.credibilityScore,
    noveltyScore: entry.noveltyScore,
    reasoning: entry.reasoning,
    keyTakeaway: entry.keyTakeaway,
    riskFlags: entry.riskFlags,
    item: entry.item,
  }));
}

export function buildResearchReport({
  job,
  normalizedItems = [],
  analysisResult = null,
  generatedAt = new Date().toISOString(),
  sourceFiles = {},
} = {}) {
  const topFindings = buildTopFindings(analysisResult);
  const evidenceBySource = buildEvidenceBySource(analysisResult);
  const searchRefinementSuggestions = unique(analysisResult?.value?.searchRefinementSuggestions ?? []);
  const openQuestionsAndGaps = buildOpenQuestionsAndGaps({
    topFindings,
    evidenceBySource,
    searchRefinementSuggestions,
  });
  const executiveSummary =
    topFindings.length > 0
      ? analysisResult?.value?.summary ?? "The run surfaced several relevant findings."
      : "No significant findings were identified in the reviewed set.";

  return {
    generatedAt,
    topic: job.topic,
    objective: job.objective,
    timeWindowHours: job.timeWindowHours,
    outputFormat: job.outputFormat,
    reportInstructions: job.reportInstructions,
    sourceFiles,
    counts: {
      sources: job.sources.length,
      normalizedItems: normalizedItems.length,
      analyzedItems: analysisResult?.analyzedCount ?? 0,
      shortlistedItems: analysisResult?.synthesisResult?.shortlistedCount ?? topFindings.length,
    },
    executiveSummary,
    searchRefinementSuggestions,
    topFindings,
    evidenceBySource,
    openQuestionsAndGaps,
    appendix: buildAppendix(analysisResult),
  };
}

function formatFindingLabel(finding) {
  const item = finding.item ?? {};
  const author = item.author ? `${item.author} ` : "";
  const url = item.url ?? "no-url";
  return `${author}${url}`;
}

export function renderResearchReportMarkdown(report) {
  const lines = [
    `# ${new Date(report.generatedAt).toISOString().slice(0, 10)} - ${report.topic}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Objective: ${report.objective}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary,
    "",
    "## Top Findings",
    "",
  ];

  if (report.topFindings.length === 0) {
    lines.push("- No significant findings were identified in this run.", "");
  } else {
    for (const finding of report.topFindings) {
      lines.push(
        `- [${finding.recommendation}] ${formatFindingLabel(finding)} | use=${finding.suggestedUse} | relevance=${finding.relevanceScore} | credibility=${finding.credibilityScore} | novelty=${finding.noveltyScore}`,
        `  ${finding.keyTakeaway ?? finding.reasoning}`,
        ""
      );
    }
  }

  lines.push("## Evidence by Query/Source", "");
  if (report.evidenceBySource.length === 0) {
    lines.push("- No evidence groups were produced.", "");
  } else {
    for (const group of report.evidenceBySource) {
      lines.push(`### ${group.sourceLabel}${group.query ? ` - ${group.query}` : ""}`, "");
      for (const entry of group.items) {
        lines.push(
          `- [${entry.recommendation}] ${entry.item.url ?? entry.item.itemId} | use=${entry.suggestedUse} | relevance=${entry.relevanceScore} | credibility=${entry.credibilityScore} | novelty=${entry.noveltyScore}`,
          `  ${entry.keyTakeaway ?? entry.reasoning}`
        );
      }
      lines.push("");
    }
  }

  lines.push("## Open Questions and Gaps", "");
  for (const entry of report.openQuestionsAndGaps) {
    lines.push(`- ${entry}`);
  }
  lines.push("", "## Search Refinements for Next Run", "");
  if (report.searchRefinementSuggestions.length === 0) {
    lines.push("- No additional refinements were suggested.", "");
  } else {
    for (const suggestion of report.searchRefinementSuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }

  lines.push("## Appendix of Reviewed Items", "");
  if (report.appendix.length === 0) {
    lines.push("- No items were reviewed.", "");
  } else {
    for (const entry of report.appendix) {
      lines.push(
        `- #${entry.rank} [${entry.recommendation}] ${entry.item.url ?? entry.item.itemId} | source=${entry.item.sourceLabel} | query=${entry.item.query ?? "n/a"} | use=${entry.suggestedUse}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
