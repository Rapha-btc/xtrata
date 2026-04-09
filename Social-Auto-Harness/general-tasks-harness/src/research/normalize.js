import { createHash } from "node:crypto";

import { normalizeGovernanceUrl } from "../../modular-harness/src/governance/loadGovernanceState.js";
import { normalizeHandle } from "../../modular-harness/src/session/xSessionSignals.js";

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = value.toString().replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeTimestamp(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toISOString();
}

function hashText(value) {
  return createHash("sha1").update(value).digest("hex");
}

function buildFallbackDedupeKey({ sourceType, author, bodyText, title }) {
  const fingerprint = [sourceType, author ?? "", bodyText ?? "", title ?? ""].join("\n");
  return `${sourceType}:${author ?? "unknown"}:${hashText(fingerprint)}`;
}

export function normalizeXSearchCandidateToResearchItem({
  source,
  candidate,
  collectedAt,
  sourceIndex,
  candidateIndex,
} = {}) {
  if (!candidate || typeof candidate !== "object") return null;

  const url = normalizeGovernanceUrl(candidate.url ?? null);
  const bodyText = normalizeText(candidate.text ?? null);
  const authorHandle = normalizeHandle(candidate.author ?? null);
  const author = authorHandle ? `@${authorHandle}` : normalizeText(candidate.author ?? null);
  const dedupeKey = url
    ? `url:${url}`
    : buildFallbackDedupeKey({
        sourceType: source.type,
        author,
        bodyText,
        title: null,
      });

  return {
    itemId: `research-${hashText(dedupeKey).slice(0, 16)}`,
    sourceType: source.type,
    sourceLabel: source.label,
    query: normalizeText(source.query),
    url,
    author,
    publishedAt: normalizeTimestamp(candidate.postedAt ?? null),
    title: null,
    snippet: bodyText,
    bodyText,
    collectedAt,
    dedupeKey,
    metadata: {
      mode: source.mode,
      sourceIndex,
      candidateIndex,
      searchUrl: normalizeGovernanceUrl(candidate.searchUrl ?? null),
    },
    raw: candidate,
  };
}

export function flattenResearchCollections({
  sourceCollections = [],
  collectedAt = new Date().toISOString(),
} = {}) {
  const items = [];

  sourceCollections.forEach((sourceCollection, sourceIndex) => {
    const source = sourceCollection?.source ?? null;
    if (!source) return;

    if (source.type === "x-search") {
      const candidates = sourceCollection?.rawResult?.candidates ?? [];
      candidates.forEach((candidate, candidateIndex) => {
        const item = normalizeXSearchCandidateToResearchItem({
          source,
          candidate,
          collectedAt,
          sourceIndex,
          candidateIndex,
        });
        if (item) items.push(item);
      });
    }

    if (source.type === "gpt-web-search") {
      const webItems = sourceCollection?.rawResult?.value?.items ?? [];
      webItems.forEach((webItem, candidateIndex) => {
        const url = normalizeGovernanceUrl(webItem.url ?? null);
        const title = normalizeText(webItem.title ?? null);
        const snippet = normalizeText(webItem.snippet ?? null);
        const bodyText = normalizeText(webItem.bodyText ?? webItem.snippet ?? null);
        const author = normalizeText(webItem.author ?? null);
        const dedupeKey = url
          ? `url:${url}`
          : buildFallbackDedupeKey({
              sourceType: source.type,
              author,
              bodyText,
              title,
            });

        items.push({
          itemId: `research-${hashText(`${dedupeKey}:${candidateIndex}`).slice(0, 16)}`,
          sourceType: source.type,
          sourceLabel: source.label,
          query: normalizeText(source.query),
          url,
          author,
          publishedAt: normalizeTimestamp(webItem.publishedAt ?? null),
          title,
          snippet,
          bodyText,
          collectedAt,
          dedupeKey,
          metadata: {
            sourceName: normalizeText(webItem.sourceName ?? null),
            whyRelevant: normalizeText(webItem.whyRelevant ?? null),
            riskFlags: Array.isArray(webItem.riskFlags) ? webItem.riskFlags : [],
            sourceIndex,
            candidateIndex,
          },
          raw: webItem,
        });
      });
    }
  });

  return items;
}

export function dedupeResearchItems(items = []) {
  const dedupedItems = [];
  const duplicates = [];
  const seenByKey = new Map();

  for (const item of items) {
    const dedupeKey = item?.dedupeKey ?? null;
    if (!dedupeKey) continue;

    const existing = seenByKey.get(dedupeKey);
    if (existing) {
      duplicates.push({
        dedupeKey,
        keptItemId: existing.itemId,
        duplicateItemId: item.itemId,
        keptSourceLabel: existing.sourceLabel,
        duplicateSourceLabel: item.sourceLabel,
      });
      continue;
    }

    seenByKey.set(dedupeKey, item);
    dedupedItems.push(item);
  }

  return {
    items: dedupedItems,
    duplicateCount: duplicates.length,
    duplicates,
  };
}

export function normalizeResearchCollections({
  sourceCollections = [],
  collectedAt = new Date().toISOString(),
} = {}) {
  const normalizedItems = flattenResearchCollections({ sourceCollections, collectedAt });
  const dedupeResult = dedupeResearchItems(normalizedItems);

  return {
    generatedAt: collectedAt,
    normalizedCount: normalizedItems.length,
    dedupedCount: dedupeResult.items.length,
    duplicateCount: dedupeResult.duplicateCount,
    duplicates: dedupeResult.duplicates,
    items: dedupeResult.items,
  };
}
