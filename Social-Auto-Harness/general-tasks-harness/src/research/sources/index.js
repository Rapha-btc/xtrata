import { collectGptWebSearchSource } from "./gptWebSearch.js";
import { collectXSearchSource } from "./xSearch.js";

const DEFAULT_SOURCE_HANDLERS = {
  "gpt-web-search": collectGptWebSearchSource,
  "x-search": collectXSearchSource,
};

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;

  try {
    await onProgress(event);
  } catch {
    // Progress logging must never break source collection.
  }
}

export async function collectResearchSources({
  job,
  adapter,
  personaProfile = null,
  sourceHandlers = DEFAULT_SOURCE_HANDLERS,
  scrapeXSearchResultsFn,
  sendPromptForJsonFn,
  onProgress = null,
  ...jsonReplyOptions
} = {}) {
  if (!job || typeof job !== "object") throw new TypeError("job is required.");
  if (!adapter) throw new TypeError("adapter is required.");

  const sourceCollections = [];
  const sources = job.sources ?? [];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    const handler = sourceHandlers[source.type];
    if (typeof handler !== "function") {
      throw new Error(`Unsupported research source type "${source.type}".`);
    }

    await emitProgress(onProgress, {
      stage: "research-source",
      action: "start",
      details: {
        sourceIndex: sourceIndex + 1,
        totalSources: sources.length,
        sourceType: source.type,
        label: source.label ?? null,
        query: source.query ?? null,
      },
    });

    let collection;
    try {
      collection = await handler({
        source,
        job,
        adapter,
        personaProfile,
        scrapeXSearchResultsFn,
        sendPromptForJsonFn,
        expectedAccountHint: job.account,
        onProgress,
        ...jsonReplyOptions,
      });
    } catch (error) {
      await emitProgress(onProgress, {
        stage: "research-source",
        action: "error",
        details: {
          sourceIndex: sourceIndex + 1,
          totalSources: sources.length,
          sourceType: source.type,
          label: source.label ?? null,
          message: error?.message ?? String(error),
        },
      });
      throw error;
    }

    sourceCollections.push(collection);
    await emitProgress(onProgress, {
      stage: "research-source",
      action: "complete",
      details: {
        sourceIndex: sourceIndex + 1,
        totalSources: sources.length,
        sourceType: source.type,
        label: source.label ?? null,
        collectedCount: collection?.collectedCount ?? 0,
      },
    });
  }

  return {
    sourceCollections,
    collectedCount: sourceCollections.reduce((sum, entry) => sum + (entry.collectedCount ?? 0), 0),
  };
}

export { DEFAULT_SOURCE_HANDLERS };
