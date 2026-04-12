import { createHash } from "node:crypto";

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = value.toString().replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeTimestamp(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toISOString();
}

function canonicalizeUrl(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return normalized;
  }
}

function hashValue(value) {
  return createHash("sha1").update(value).digest("hex");
}

function inferPlatform(url, fallback = "open-web") {
  if (!url) return fallback;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname.includes("reddit.com")) return "reddit";
    if (hostname.includes("x.com") || hostname.includes("twitter.com")) return "x";
    if (hostname.includes("linkedin.com")) return "linkedin";
    return "open-web";
  } catch {
    return fallback;
  }
}

function buildFallbackDedupeKey(item) {
  return `${item.sourceType}:${item.authorName ?? "unknown"}:${hashValue(
    [item.title ?? "", item.excerpt ?? "", item.rawText ?? ""].join("\n")
  )}`;
}

export function normalizeDiscoveryCollections({
  collections = [],
  collectedAt = new Date().toISOString(),
} = {}) {
  const items = [];
  const seen = new Map();
  const duplicates = [];

  collections.forEach((collection, sourceIndex) => {
    (collection.items ?? []).forEach((item, itemIndex) => {
      const url = canonicalizeUrl(item.url ?? null);
      const dedupeKey = url ? `url:${url}` : buildFallbackDedupeKey({ ...item, sourceType: collection.sourceType });
      const normalized = {
        itemId: `narrate-src-${hashValue(`${dedupeKey}:${sourceIndex}:${itemIndex}`).slice(0, 16)}`,
        sourceType: collection.sourceType,
        sourceLabel: collection.sourceLabel,
        family: collection.queryPlan.family,
        query: collection.queryPlan.query,
        siteFilter: collection.queryPlan.siteFilter ?? null,
        platform: inferPlatform(url, item.platform ?? "open-web"),
        url,
        title: normalizeText(item.title),
        excerpt: normalizeText(item.excerpt),
        rawText: normalizeText(item.rawText) ?? normalizeText(item.excerpt),
        sourceName: normalizeText(item.sourceName),
        authorName: normalizeText(item.authorName),
        publishedAt: normalizeTimestamp(item.publishedAt),
        collectedAt,
        dedupeKey,
        raw: item,
      };

      const existing = seen.get(dedupeKey);
      if (existing) {
        duplicates.push({
          dedupeKey,
          keptItemId: existing.itemId,
          duplicateItemId: normalized.itemId,
          query: normalized.query,
        });
        return;
      }

      seen.set(dedupeKey, normalized);
      items.push(normalized);
    });
  });

  return {
    generatedAt: collectedAt,
    normalizedCount: items.length + duplicates.length,
    dedupedCount: items.length,
    duplicateCount: duplicates.length,
    duplicates,
    items,
  };
}
