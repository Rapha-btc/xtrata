import { sendPromptForJson } from "../../modular-harness/src/chatgpt/sendPromptForJson.js";

const RECOMMENDATION_RANK = {
  prioritize: 3,
  consider: 2,
  skip: 1,
};

const DEFAULT_RESEARCH_ANALYSIS_PROMPT_CHAR_LIMIT = 18000;
const ALLOWED_RECOMMENDATIONS = new Set(["prioritize", "consider", "skip"]);
const ALLOWED_SUGGESTED_USES = new Set(["lead", "supporting", "appendix", "discard"]);
const SPLITTABLE_BATCH_ERROR_PATTERNS = [
  /did not contain valid json/i,
  /json result/i,
  /expected json type/i,
  /custom json validation failed/i,
  /repair attempt returned the previous reply again/i,
];

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;

  try {
    await onProgress(event);
  } catch {
    // Progress logging must never break analysis.
  }
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function clampScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
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

function splitArrayInHalf(values) {
  const splitPoint = Math.ceil(values.length / 2);
  return [values.slice(0, splitPoint), values.slice(splitPoint)];
}

function sortByPriority(entries) {
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

function normalizeRecommendation(value) {
  return ALLOWED_RECOMMENDATIONS.has(value) ? value : "skip";
}

function normalizeSuggestedUse(value) {
  return ALLOWED_SUGGESTED_USES.has(value) ? value : "discard";
}

function buildJsonCallMetadata(result, extra = {}) {
  return {
    provider: "chatgpt-web-ui",
    model: null,
    sessionAction: result?.session?.action ?? null,
    replyUrl: result?.replyState?.url ?? null,
    ...extra,
  };
}

async function maybeCloseOpenedTab(adapter, session, shouldClose) {
  if (!shouldClose) return;
  if (session?.action !== "opened-new-tab") return;
  if (!Number.isFinite(session?.tab?.windowId) || !Number.isFinite(session?.tab?.tabIndex)) return;
  if (typeof adapter?.closeTab !== "function") return;

  await adapter.closeTab(session.tab);
}

export function normalizeResearchItemForAnalysis(item, itemIndex) {
  return {
    itemIndex,
    sourceType: item.sourceType ?? null,
    sourceLabel: item.sourceLabel ?? null,
    query: item.query ?? null,
    url: item.url ?? null,
    author: item.author ?? null,
    publishedAt: item.publishedAt ?? null,
    title: item.title ?? null,
    snippet: item.snippet ?? null,
    bodyText: item.bodyText ?? null,
    metadata: item.metadata ?? {},
    sourceDetail: item.metadata?.sourceName ?? null,
  };
}

export function prepareResearchAnalysisBatch({ job, items = [] } = {}) {
  const analyzedItems = items.map((item, itemIndex) => normalizeResearchItemForAnalysis(item, itemIndex));
  const prompt = buildResearchAnalysisPrompt({
    job,
    items: analyzedItems,
  });

  return {
    analyzedItems,
    prompt,
    promptLength: prompt.length,
  };
}

export function buildResearchAnalysisPrompt({ job, items } = {}) {
  return [
    "You are reviewing collected research items for an overnight topic report.",
    `Topic: ${job.topic}`,
    `Objective: ${job.objective}`,
    `Time window: ${job.timeWindowHours} hours`,
    "Be conservative and selective. Prefer skip for low-signal, repetitive, speculative, or weakly relevant items.",
    "Evaluate each item for relevance, credibility, and novelty for the stated objective.",
    'Use recommendation values only from: prioritize, consider, skip.',
    'Use suggestedUse values only from: lead, supporting, appendix, discard.',
    "Return one analysis object for every itemIndex provided.",
    `Item batch:\n${JSON.stringify(items, null, 2)}`,
  ].join("\n\n");
}

export function buildResearchAnalysisSchemaDescription(itemCount) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    '- summary: string',
    "- searchRefinementSuggestions: array of strings",
    `- analyses: array with ${itemCount} objects, one per itemIndex from 0 to ${Math.max(itemCount - 1, 0)}`,
    "Each analysis object must include:",
    "- itemIndex: integer",
    '- recommendation: "prioritize" | "consider" | "skip"',
    "- relevanceScore: integer 0-100",
    "- credibilityScore: integer 0-100",
    "- noveltyScore: integer 0-100",
    '- suggestedUse: "lead" | "supporting" | "appendix" | "discard"',
    "- reasoning: string",
    "- keyTakeaway: string or null",
    "- riskFlags: array of strings",
  ].join("\n");
}

function validateResearchAnalysisShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Analysis result must be a JSON object.";
  }

  if (!Array.isArray(value.analyses)) {
    return 'Analysis result must include an "analyses" array.';
  }

  if (!Array.isArray(value.searchRefinementSuggestions)) {
    return 'Analysis result must include a "searchRefinementSuggestions" array.';
  }

  return true;
}

export function normalizeResearchAnalysisValue(value, { itemCount } = {}) {
  const analysesByIndex = new Map();

  for (const rawEntry of value?.analyses ?? []) {
    const itemIndex = Number.parseInt(rawEntry?.itemIndex, 10);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) {
      continue;
    }

    if (analysesByIndex.has(itemIndex)) {
      continue;
    }

    analysesByIndex.set(itemIndex, {
      itemIndex,
      recommendation: normalizeRecommendation(rawEntry?.recommendation),
      relevanceScore: clampScore(rawEntry?.relevanceScore),
      credibilityScore: clampScore(rawEntry?.credibilityScore, 50),
      noveltyScore: clampScore(rawEntry?.noveltyScore, 50),
      suggestedUse: normalizeSuggestedUse(rawEntry?.suggestedUse),
      reasoning: normalizeString(rawEntry?.reasoning, "No analysis returned."),
      keyTakeaway:
        rawEntry?.keyTakeaway === null ? null : normalizeString(rawEntry?.keyTakeaway, "") || null,
      riskFlags: unique((rawEntry?.riskFlags ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
    });
  }

  const analyses = [];
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    analyses.push(
      analysesByIndex.get(itemIndex) ?? {
        itemIndex,
        recommendation: "skip",
        relevanceScore: 0,
        credibilityScore: 50,
        noveltyScore: 50,
        suggestedUse: "discard",
        reasoning: "Model did not return analysis for this item.",
        keyTakeaway: null,
        riskFlags: ["analysis-missing"],
      }
    );
  }

  return {
    summary: normalizeString(value?.summary, "No summary returned."),
    searchRefinementSuggestions: unique(
      (value?.searchRefinementSuggestions ?? []).map((entry) => normalizeString(entry)).filter(Boolean)
    ),
    analyses,
  };
}

export async function analyzeResearchBatch({
  adapter,
  job,
  items = [],
  preparedBatch = null,
  expectedAccountHint = null,
  personaProfile = null,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!job || typeof job !== "object") throw new TypeError("job is required.");

  const prepared = preparedBatch ?? prepareResearchAnalysisBatch({ job, items });
  const analyzedItems = prepared.analyzedItems;

  if (analyzedItems.length === 0) {
    return {
      ok: true,
      skipped: true,
      inputCount: items.length,
      analyzedCount: 0,
      analyzedItems,
      value: {
        summary: "No items were provided for analysis.",
        searchRefinementSuggestions: [],
        analyses: [],
      },
      enrichedAnalyses: [],
      callMetadata: [],
      promptLength: prepared.promptLength ?? 0,
    };
  }

  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt: prepared.prompt,
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildResearchAnalysisSchemaDescription(analyzedItems.length),
    expectedType: "object",
    requiredKeys: ["summary", "searchRefinementSuggestions", "analyses"],
    validate: validateResearchAnalysisShape,
    ...jsonReplyOptions,
  });

  const value = normalizeResearchAnalysisValue(jsonResult.value, {
    itemCount: analyzedItems.length,
  });
  const enrichedAnalyses = value.analyses.map((analysis) => ({
    ...analysis,
    item: analyzedItems[analysis.itemIndex] ?? null,
  }));

  return {
    ...jsonResult,
    inputCount: items.length,
    analyzedCount: analyzedItems.length,
    analyzedItems,
    value,
    enrichedAnalyses,
    callMetadata: [buildJsonCallMetadata(jsonResult, { stage: "batch" })],
    promptLength: prepared.promptLength ?? prepared.prompt?.length ?? 0,
  };
}

function buildBatchSummaryEntry(batchIndex, batchStart, batchSize, batchResult, extra = {}) {
  return {
    batchIndex,
    batchStart,
    batchSize,
    analyzedCount: batchResult?.analyzedCount ?? 0,
    summary: batchResult?.value?.summary ?? null,
    searchRefinementSuggestions: batchResult?.value?.searchRefinementSuggestions ?? [],
    callMetadata: batchResult?.callMetadata ?? [],
    batchLabel: extra.batchLabel ?? null,
    splitDepth: extra.splitDepth ?? 0,
    promptLength: extra.promptLength ?? batchResult?.promptLength ?? 0,
  };
}

function remapBatchAnalyses(batchResult, batchStart) {
  return (batchResult?.value?.analyses ?? []).map((analysis) => ({
    ...analysis,
    itemIndex: batchStart + analysis.itemIndex,
  }));
}

function buildResearchSynthesisShortlistEntries({
  analyzedItems,
  mergedAnalyses,
  finalSynthesisLimit,
} = {}) {
  const itemByIndex = new Map(analyzedItems.map((item) => [item.itemIndex, item]));
  const shortlisted = sortByPriority(
    mergedAnalyses
      .map((analysis) => ({
        ...analysis,
        item: itemByIndex.get(analysis.itemIndex) ?? null,
      }))
      .filter(
        (analysis) =>
          analysis.recommendation !== "skip" ||
          analysis.relevanceScore >= 60 ||
          analysis.credibilityScore >= 60 ||
          analysis.noveltyScore >= 60
      )
  ).slice(0, finalSynthesisLimit);

  return shortlisted.map((entry, shortlistIndex) => ({
    shortlistIndex,
    itemIndex: entry.itemIndex,
    sourceType: entry.item?.sourceType ?? null,
    sourceLabel: entry.item?.sourceLabel ?? null,
    query: entry.item?.query ?? null,
    url: entry.item?.url ?? null,
    author: entry.item?.author ?? null,
    publishedAt: entry.item?.publishedAt ?? null,
    title: entry.item?.title ?? null,
    snippet: entry.item?.snippet ?? null,
    bodyText: entry.item?.bodyText ?? null,
    preliminaryRecommendation: entry.recommendation,
    preliminaryRelevanceScore: entry.relevanceScore,
    preliminaryCredibilityScore: entry.credibilityScore,
    preliminaryNoveltyScore: entry.noveltyScore,
    preliminarySuggestedUse: entry.suggestedUse,
    preliminaryReasoning: entry.reasoning,
    preliminaryKeyTakeaway: entry.keyTakeaway,
    preliminaryRiskFlags: entry.riskFlags,
  }));
}

export function buildResearchSynthesisPrompt({ job, shortlistedEntries } = {}) {
  const parts = [
    "You are calibrating the final shortlist for an overnight topic report after an initial multi-batch review.",
    `Topic: ${job.topic}`,
    `Objective: ${job.objective}`,
    `Time window: ${job.timeWindowHours} hours`,
    "Be more selective than the first pass. Downgrade repetitive, weak, speculative, or low-credibility items aggressively.",
    "Return one synthesis analysis object for every shortlistIndex provided.",
    'Use recommendation values only from: prioritize, consider, skip.',
    'Use suggestedUse values only from: lead, supporting, appendix, discard.',
  ];

  if (job.reportInstructions?.trim()) {
    parts.push(`Additional report instructions:\n${job.reportInstructions}`);
  }

  parts.push(`Shortlist:\n${JSON.stringify(shortlistedEntries, null, 2)}`);
  return parts.join("\n\n");
}

export function buildResearchSynthesisSchemaDescription(shortlistCount) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    "- summary: string",
    "- searchRefinementSuggestions: array of strings",
    `- analyses: array with ${shortlistCount} objects, one per shortlistIndex from 0 to ${Math.max(shortlistCount - 1, 0)}`,
    "Each analysis object must include:",
    "- shortlistIndex: integer",
    "- itemIndex: integer, must equal the itemIndex provided for that shortlist item",
    '- recommendation: "prioritize" | "consider" | "skip"',
    "- relevanceScore: integer 0-100",
    "- credibilityScore: integer 0-100",
    "- noveltyScore: integer 0-100",
    '- suggestedUse: "lead" | "supporting" | "appendix" | "discard"',
    "- reasoning: string",
    "- keyTakeaway: string or null",
    "- riskFlags: array of strings",
  ].join("\n");
}

function validateResearchSynthesisShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Synthesis result must be a JSON object.";
  }

  if (!Array.isArray(value.analyses)) {
    return 'Synthesis result must include an "analyses" array.';
  }

  if (!Array.isArray(value.searchRefinementSuggestions)) {
    return 'Synthesis result must include a "searchRefinementSuggestions" array.';
  }

  return true;
}

function buildResearchAnalysisBatchLabel(rootBatchIndex, totalRootBatches, splitPath = []) {
  const suffix = splitPath.length > 0 ? `.${splitPath.join(".")}` : "";
  return `research-analysis:batch-${rootBatchIndex}-of-${totalRootBatches}${suffix}`;
}

function shouldSplitFailedResearchBatch(error, batchSize) {
  if (!Number.isFinite(batchSize) || batchSize <= 1) return false;
  const message = error?.message ?? "";
  return SPLITTABLE_BATCH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function normalizeResearchSynthesisValue(value, { shortlistedEntries = [] } = {}) {
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
      itemIndex: shortlistEntry.itemIndex,
      recommendation: normalizeRecommendation(rawEntry?.recommendation),
      relevanceScore: clampScore(rawEntry?.relevanceScore, shortlistEntry.preliminaryRelevanceScore),
      credibilityScore: clampScore(rawEntry?.credibilityScore, shortlistEntry.preliminaryCredibilityScore),
      noveltyScore: clampScore(rawEntry?.noveltyScore, shortlistEntry.preliminaryNoveltyScore),
      suggestedUse: normalizeSuggestedUse(rawEntry?.suggestedUse),
      reasoning: normalizeString(rawEntry?.reasoning, shortlistEntry.preliminaryReasoning),
      keyTakeaway:
        rawEntry?.keyTakeaway === null
          ? null
          : normalizeString(rawEntry?.keyTakeaway, shortlistEntry.preliminaryKeyTakeaway ?? "") || null,
      riskFlags: unique(
        (Array.isArray(rawEntry?.riskFlags) ? rawEntry.riskFlags : shortlistEntry.preliminaryRiskFlags ?? [])
          .map((entry) => normalizeString(entry))
          .filter(Boolean)
      ),
    });
  }

  return {
    summary: normalizeString(value?.summary, "No synthesis summary returned."),
    searchRefinementSuggestions: unique(
      (value?.searchRefinementSuggestions ?? []).map((entry) => normalizeString(entry)).filter(Boolean)
    ),
    analyses: shortlistedEntries.map((entry) => ({
      itemIndex: entry.itemIndex,
      recommendation: entry.preliminaryRecommendation,
      relevanceScore: entry.preliminaryRelevanceScore,
      credibilityScore: entry.preliminaryCredibilityScore,
      noveltyScore: entry.preliminaryNoveltyScore,
      suggestedUse: entry.preliminarySuggestedUse,
      reasoning: entry.preliminaryReasoning,
      keyTakeaway: entry.preliminaryKeyTakeaway,
      riskFlags: unique(entry.preliminaryRiskFlags ?? []),
      ...(byShortlistIndex.get(entry.shortlistIndex) ?? {}),
    })),
  };
}

export async function analyzeResearchCollection({
  adapter,
  job,
  items = [],
  expectedAccountHint = null,
  personaProfile = null,
  onProgress = null,
  freshChatGPTTabPerBatch = true,
  closeBatchTabs = true,
  analysisPromptCharLimit = DEFAULT_RESEARCH_ANALYSIS_PROMPT_CHAR_LIMIT,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!job || typeof job !== "object") throw new TypeError("job is required.");

  const candidateLimit = Math.max(1, clampPositiveInteger(job.maxItemsPerSource * (job.sources?.length ?? 1), items.length || 1));
  const batchSize = Math.max(1, clampPositiveInteger(job.analysisBatchSize, 10));
  const finalSynthesisLimit = Math.max(1, clampPositiveInteger(job.finalSynthesisLimit, 25));
  const promptCharLimit = Math.max(
    1,
    clampPositiveInteger(analysisPromptCharLimit, DEFAULT_RESEARCH_ANALYSIS_PROMPT_CHAR_LIMIT)
  );
  const limitedItems = items.slice(0, candidateLimit);
  const analyzedItems = limitedItems.map((item, itemIndex) => normalizeResearchItemForAnalysis(item, itemIndex));

  if (analyzedItems.length === 0) {
    return {
      ok: true,
      skipped: true,
      inputCount: items.length,
      analyzedCount: 0,
      analyzedItems,
      batchSummaries: [],
      synthesisResult: null,
      value: {
        summary: "No items were provided for analysis.",
        searchRefinementSuggestions: [],
        analyses: [],
      },
      enrichedAnalyses: [],
      callMetadata: [],
    };
  }

  const itemChunks = chunkArray(limitedItems, batchSize);
  const batchSummaries = [];
  const callMetadata = [];
  let mergedAnalyses = [];

  async function processBatchChunk({
    chunkItems,
    batchStart,
    rootBatchIndex,
    totalRootBatches,
    splitPath = [],
  }) {
    const preparedBatch = prepareResearchAnalysisBatch({
      job,
      items: chunkItems,
    });
    const progressLabel = buildResearchAnalysisBatchLabel(rootBatchIndex, totalRootBatches, splitPath);
    const progressDetails = {
      batchIndex: rootBatchIndex,
      totalBatches: totalRootBatches,
      batchStart,
      batchSize: chunkItems.length,
      splitDepth: splitPath.length,
      splitPath: splitPath.length > 0 ? splitPath.join(".") : null,
      promptLength: preparedBatch.promptLength,
    };

    if (preparedBatch.promptLength > promptCharLimit && chunkItems.length > 1) {
      await emitProgress(onProgress, {
        stage: "research-analysis-batch",
        action: "split",
        label: progressLabel,
        details: {
          ...progressDetails,
          reason: "prompt-too-large",
          promptCharLimit,
        },
      });

      const [leftItems, rightItems] = splitArrayInHalf(chunkItems);
      await processBatchChunk({
        chunkItems: leftItems,
        batchStart,
        rootBatchIndex,
        totalRootBatches,
        splitPath: splitPath.concat(1),
      });
      await processBatchChunk({
        chunkItems: rightItems,
        batchStart: batchStart + leftItems.length,
        rootBatchIndex,
        totalRootBatches,
        splitPath: splitPath.concat(2),
      });
      return;
    }

    await emitProgress(onProgress, {
      stage: "research-analysis-batch",
      action: "start",
      label: progressLabel,
      details: progressDetails,
    });

    let batchResult;
    try {
      batchResult = await analyzeResearchBatch({
        adapter,
        job,
        items: chunkItems,
        preparedBatch,
        expectedAccountHint,
        personaProfile,
        sendPromptForJsonFn,
        forceNewTab: freshChatGPTTabPerBatch,
        onProgress,
        progressLabel,
        ...jsonReplyOptions,
      });
    } catch (error) {
      await maybeCloseOpenedTab(adapter, error?.session, closeBatchTabs);

      if (shouldSplitFailedResearchBatch(error, chunkItems.length)) {
        await emitProgress(onProgress, {
          stage: "research-analysis-batch",
          action: "split",
          label: progressLabel,
          details: {
            ...progressDetails,
            message: error?.message ?? String(error),
            reason: "json-contract-failed",
          },
        });

        const [leftItems, rightItems] = splitArrayInHalf(chunkItems);
        await processBatchChunk({
          chunkItems: leftItems,
          batchStart,
          rootBatchIndex,
          totalRootBatches,
          splitPath: splitPath.concat(1),
        });
        await processBatchChunk({
          chunkItems: rightItems,
          batchStart: batchStart + leftItems.length,
          rootBatchIndex,
          totalRootBatches,
          splitPath: splitPath.concat(2),
        });
        return;
      }

      await emitProgress(onProgress, {
        stage: "research-analysis-batch",
        action: "error",
        label: progressLabel,
        details: {
          ...progressDetails,
          message: error?.message ?? String(error),
        },
      });
      throw error;
    }

    const batchCallMetadata = (batchResult.callMetadata ?? []).map((entry) => ({
      ...entry,
      stage: "batch",
      batchIndex: rootBatchIndex - 1,
      batchLabel: progressLabel,
      splitDepth: splitPath.length,
    }));
    batchSummaries.push(
      buildBatchSummaryEntry(rootBatchIndex - 1, batchStart, chunkItems.length, batchResult, {
        batchLabel: progressLabel,
        splitDepth: splitPath.length,
        promptLength: preparedBatch.promptLength,
      })
    );
    mergedAnalyses = mergedAnalyses.concat(remapBatchAnalyses(batchResult, batchStart));
    callMetadata.push(...batchCallMetadata);
    await maybeCloseOpenedTab(adapter, batchResult.session, closeBatchTabs);
    await emitProgress(onProgress, {
      stage: "research-analysis-batch",
      action: "complete",
      label: progressLabel,
      details: {
        ...progressDetails,
        analyzedCount: batchResult?.analyzedCount ?? 0,
      },
    });
  }

  for (let batchIndex = 0; batchIndex < itemChunks.length; batchIndex += 1) {
    const batchItems = itemChunks[batchIndex];
    const batchStart = batchIndex * batchSize;
    await processBatchChunk({
      chunkItems: batchItems,
      batchStart,
      rootBatchIndex: batchIndex + 1,
      totalRootBatches: itemChunks.length,
    });
  }

  const shortlistEntries = buildResearchSynthesisShortlistEntries({
    analyzedItems,
    mergedAnalyses,
    finalSynthesisLimit,
  });

  let synthesisResult = null;
  if (shortlistEntries.length > 0) {
    const progressLabel = "research-analysis:synthesis";
    const prompt = buildResearchSynthesisPrompt({
      job,
      shortlistedEntries: shortlistEntries,
    });
    await emitProgress(onProgress, {
      stage: "research-analysis-synthesis",
      action: "start",
      label: progressLabel,
      details: {
        shortlistedCount: shortlistEntries.length,
      },
    });

    let jsonResult;
    try {
      jsonResult = await sendPromptForJsonFn({
        adapter,
        prompt,
        expectedAccountHint,
        personaProfile,
        schemaDescription: buildResearchSynthesisSchemaDescription(shortlistEntries.length),
        expectedType: "object",
        requiredKeys: ["summary", "searchRefinementSuggestions", "analyses"],
        validate: validateResearchSynthesisShape,
        forceNewTab: freshChatGPTTabPerBatch,
        onProgress,
        progressLabel,
        ...jsonReplyOptions,
      });
    } catch (error) {
      await emitProgress(onProgress, {
        stage: "research-analysis-synthesis",
        action: "error",
        label: progressLabel,
        details: {
          shortlistedCount: shortlistEntries.length,
          message: error?.message ?? String(error),
        },
      });
      throw error;
    }

    const normalizedValue = normalizeResearchSynthesisValue(jsonResult.value, {
      shortlistedEntries: shortlistEntries,
    });
    const synthesisByItemIndex = new Map(
      normalizedValue.analyses.map((analysis) => [analysis.itemIndex, analysis])
    );
    mergedAnalyses = mergedAnalyses.map((analysis) => synthesisByItemIndex.get(analysis.itemIndex) ?? analysis);
    synthesisResult = {
      ...jsonResult,
      shortlistedCount: shortlistEntries.length,
      value: normalizedValue,
    };
    callMetadata.push(buildJsonCallMetadata(jsonResult, { stage: "synthesis" }));
    await maybeCloseOpenedTab(adapter, jsonResult.session, closeBatchTabs);
    await emitProgress(onProgress, {
      stage: "research-analysis-synthesis",
      action: "complete",
      label: progressLabel,
      details: {
        shortlistedCount: shortlistEntries.length,
      },
    });
  }

  const itemByIndex = new Map(analyzedItems.map((item) => [item.itemIndex, item]));
  const enrichedAnalyses = mergedAnalyses.map((analysis) => ({
    ...analysis,
    item: itemByIndex.get(analysis.itemIndex) ?? null,
  }));
  const searchRefinementSuggestions = unique([
    ...batchSummaries.flatMap((entry) => entry.searchRefinementSuggestions ?? []),
    ...(synthesisResult?.value?.searchRefinementSuggestions ?? []),
  ]);

  return {
    ok: true,
    inputCount: items.length,
    analyzedCount: analyzedItems.length,
    analyzedItems,
    batchSummaries,
    synthesisResult: synthesisResult
      ? {
          shortlistedCount: synthesisResult.shortlistedCount,
          summary: synthesisResult.value.summary,
          searchRefinementSuggestions: synthesisResult.value.searchRefinementSuggestions,
        }
      : null,
    value: {
      summary:
        synthesisResult?.value?.summary ??
        batchSummaries.map((entry) => entry.summary).filter(Boolean).join(" "),
      searchRefinementSuggestions,
      analyses: enrichedAnalyses.map(({ item, ...analysis }) => analysis),
    },
    enrichedAnalyses,
    callMetadata,
  };
}
