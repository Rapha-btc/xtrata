import { scrapeXSearchResults } from "../../../modular-harness/src/x/scrapeXSearchResults.js";

function normalizeText(value) {
  return value?.toString().replace(/\s+/g, " ").trim() ?? "";
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

export async function collectXSearchSource({
  source,
  queryPlan,
  job,
  adapter,
  personaProfile = null,
  scrapeXSearchResultsFn = scrapeXSearchResults,
} = {}) {
  if (!personaProfile?.xHandle) {
    throw new Error('Narrate jobs with "x-search" sources require a persona that resolves to an expected X handle.');
  }

  const rawResult = await scrapeXSearchResultsFn({
    adapter,
    query: queryPlan.query,
    mode: queryPlan.mode ?? "live",
    maxResults: job.maxResultsPerQuery,
    expectedHandle: personaProfile.xHandle,
    personaProfile,
  });

  return {
    sourceType: source.type,
    sourceLabel: source.label,
    queryPlan,
    collectedCount: rawResult?.candidates?.length ?? 0,
    items: (rawResult?.candidates ?? []).map((entry) => ({
      platform: "x",
      url: normalizeOptionalText(entry.url),
      title: null,
      excerpt: normalizeOptionalText(entry.text),
      rawText: normalizeOptionalText(entry.text),
      sourceName: "X",
      publishedAt: normalizeOptionalText(entry.postedAt),
      authorName: normalizeOptionalText(entry.author),
      searchQuery: queryPlan.query,
    })),
    rawResult,
  };
}
