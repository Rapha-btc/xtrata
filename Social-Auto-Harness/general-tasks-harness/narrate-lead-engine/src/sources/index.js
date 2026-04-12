import { collectGoogleSearchSource } from "./googleSearch.js";
import { collectGptWebSearchSource } from "./gptWebSearch.js";
import { collectXSearchSource } from "./xSearch.js";

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
      },
    });
  }

  return {
    collections: results,
    collectedCount: results.reduce((sum, entry) => sum + (entry.collectedCount ?? 0), 0),
  };
}

export { DEFAULT_SOURCE_HANDLERS };
