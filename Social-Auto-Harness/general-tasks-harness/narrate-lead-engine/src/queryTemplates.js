export const QUERY_FAMILY_TEMPLATES = Object.freeze({
  "cost-pain": [
    "\"audiobook\" expensive",
    "\"cost of producing an audiobook\"",
    "\"cheaper audiobook production\"",
    "\"looking for affordable audiobook narration\"",
    "\"audiobook\" budget OR affordable OR costly",
  ],
  "workflow-pain": [
    "\"how do I make an audiobook\"",
    "\"how to make an audiobook\"",
    "\"multiple voices\" audiobook fiction",
    "\"AI narrator\" fiction",
    "\"full cast\" audiobook alternative",
  ],
  "commercial-intent": [
    "\"seeking audiobook narrator\"",
    "\"need audiobook production\"",
    "\"publisher\" audiobook production",
    "\"audio rights\" \"no audiobook\"",
    "\"backlist audiobook rollout\"",
  ],
  "ai-openness": [
    "\"AI narration\" author OR publisher",
    "\"AI voice\" novel OR audiobook",
    "\"text to speech\" author audiobook",
    "\"using AI\" cover editing marketing author",
  ],
  "multi-voice": [
    "\"different character voices\" audiobook",
    "\"multiple voices\" novel",
    "\"dialogue-heavy\" novel audiobook",
    "\"dramatized audio\" fiction",
    "\"character voices\" audiobook production",
  ],
  "publisher-backlist": [
    "publisher backlist audiobook",
    "\"small press\" audiobook",
    "imprint backlist audio edition",
    "rights catalog audiobook expansion",
    "publisher \"audio edition\" backlist",
  ],
});

function uniqueByKey(values, keyFn) {
  const seen = new Set();
  const results = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(value);
  }
  return results;
}

export function buildQueriesForSource(source) {
  const templates = source.families.flatMap((family) =>
    (QUERY_FAMILY_TEMPLATES[family] ?? []).map((query) => ({
      sourceType: source.type,
      sourceLabel: source.label,
      family,
      query,
      siteFilter: null,
      mode: source.mode ?? null,
    }))
  );

  const withFilters =
    source.type === "google-search" && Array.isArray(source.siteFilters) && source.siteFilters.length > 0
      ? templates.flatMap((entry) =>
          source.siteFilters.map((siteFilter) => ({
            ...entry,
            siteFilter,
            query: `${entry.query} site:${siteFilter}`,
          }))
        )
      : templates;

  return uniqueByKey(withFilters, (entry) => `${entry.sourceType}:${entry.query}`).slice(0, source.maxQueries);
}

export function buildDiscoveryPlan(job) {
  return (job.sources ?? [])
    .filter((source) => source.enabled !== false)
    .flatMap((source) =>
      buildQueriesForSource(source).map((queryPlan, index) => ({
        sourceLabel: source.label,
        sourceType: source.type,
        family: queryPlan.family,
        query: queryPlan.query,
        siteFilter: queryPlan.siteFilter,
        mode: queryPlan.mode,
        order: index + 1,
      }))
    )
    .slice(0, job.maxTotalQueries ?? Number.MAX_SAFE_INTEGER);
}
