import { scrapeXSearchResults } from "../../../modular-harness/src/x/scrapeXSearchResults.js";

export async function collectXSearchSource({
  source,
  job,
  adapter,
  personaProfile = null,
  scrapeXSearchResultsFn = scrapeXSearchResults,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!source || typeof source !== "object") throw new TypeError("source is required.");
  if (!job || typeof job !== "object") throw new TypeError("job is required.");

  if (!personaProfile?.xHandle) {
    throw new Error('Research jobs with "x-search" sources require a persona that resolves to an expected X handle.');
  }

  const rawResult = await scrapeXSearchResultsFn({
    adapter,
    query: source.query,
    mode: source.mode,
    maxResults: job.maxItemsPerSource,
    expectedHandle: personaProfile.xHandle,
    personaProfile,
  });

  return {
    source,
    sourceType: source.type,
    collectedCount: rawResult?.candidates?.length ?? 0,
    rawResult,
  };
}
