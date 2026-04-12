import { collectGoogleSearchSource } from "./googleSearch.js";
import { collectGptWebSearchSource } from "./gptWebSearch.js";
import { collectXSearchSource } from "./xSearch.js";
import {
  assertCollectedItemBudget,
  assertMemoryWithinLimit,
  pauseIfNeeded,
} from "../safety.js";

const DEFAULT_SOURCE_HANDLERS = {
  "google-search": collectGoogleSearchSource,
  "gpt-web-search": collectGptWebSearchSource,
  "x-search": collectXSearchSource,
};

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;
  try {
    await onProgress(event);
  } catch {
    // Progress hooks must never break collection.
  }
}

export async function collectLeadSources({
  job,
  adapter,
  personaProfile = null,
  queryPlans = [],
  sourceHandlers = DEFAULT_SOURCE_HANDLERS,
  onProgress = null,
  ...jsonReplyOptions
} = {}) {
  const results = [];

  for (let index = 0; index < queryPlans.length; index += 1) {
    const queryPlan = queryPlans[index];
    const source = job.sources.find((entry) => entry.type === queryPlan.sourceType && entry.label === queryPlan.sourceLabel);
    const handler = sourceHandlers[queryPlan.sourceType];

    if (!source || typeof handler !== "function") {
      throw new Error(`Unsupported query-plan source "${queryPlan.sourceType}".`);
    }

    await emitProgress(onProgress, {
      stage: "discovery",
      action: "start-query",
      details: {
        queryIndex: index + 1,
        totalQueries: queryPlans.length,
        sourceType: queryPlan.sourceType,
        label: queryPlan.sourceLabel,
        family: queryPlan.family,
        query: queryPlan.query,
      },
    });

    const memoryBefore = assertMemoryWithinLimit({
      job,
      stage: "discovery:start-query",
      extra: {
        queryIndex: index + 1,
        totalQueries: queryPlans.length,
      },
    });

    await emitProgress(onProgress, {
      stage: "safety",
      action: "memory-snapshot",
      details: {
        stage: "discovery:start-query",
        queryIndex: index + 1,
        ...memoryBefore,
      },
    });

    const result = await handler({
      source,
      queryPlan,
      job,
      adapter,
      personaProfile,
      expectedAccountHint: job.account,
      onProgress,
      ...jsonReplyOptions,
    });

    results.push(result);

    const totalCollected = results.reduce((sum, entry) => sum + (entry.collectedCount ?? 0), 0);
    assertCollectedItemBudget({
      job,
      collectedCount: totalCollected,
      stage: "discovery:after-query",
    });
    const memoryAfter = assertMemoryWithinLimit({
      job,
      stage: "discovery:after-query",
      extra: {
        totalCollected,
        queryIndex: index + 1,
      },
    });

    await emitProgress(onProgress, {
      stage: "discovery",
      action: "complete-query",
      details: {
        queryIndex: index + 1,
        totalQueries: queryPlans.length,
        sourceType: queryPlan.sourceType,
        label: queryPlan.sourceLabel,
        family: queryPlan.family,
        collectedCount: result.collectedCount,
        totalCollected,
        ...memoryAfter,
      },
    });

    if (index < queryPlans.length - 1) {
      await pauseIfNeeded(adapter, job.queryPauseMs);
    }
  }

  return {
    collections: results,
    collectedCount: results.reduce((sum, entry) => sum + (entry.collectedCount ?? 0), 0),
  };
}

export { DEFAULT_SOURCE_HANDLERS };
