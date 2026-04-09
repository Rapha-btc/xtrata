import { openVerifiedXTab } from "./openVerifiedXTab.js";

export const DEFAULT_X_SEARCH_MODE = "live";

const SEARCH_URL_PATTERN = /^https?:\/\/(www\.)?x\.com\/search\?/i;

export function buildXSearchUrl(query, { mode = DEFAULT_X_SEARCH_MODE } = {}) {
  if (!query?.trim()) throw new TypeError("query is required.");

  const url = new URL("https://x.com/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("src", "typed_query");
  if (mode === "live" || mode === "latest") {
    url.searchParams.set("f", "live");
  }

  return url.toString();
}

export function matchesXSearchTab(query, mode = DEFAULT_X_SEARCH_MODE) {
  const searchUrl = buildXSearchUrl(query, { mode });
  const parsedSearchUrl = new URL(searchUrl);
  const expectedQuery = parsedSearchUrl.searchParams.get("q");
  const expectedMode = parsedSearchUrl.searchParams.get("f");

  return (tab) => {
    if (!SEARCH_URL_PATTERN.test(tab?.url ?? "")) return false;

    try {
      const current = new URL(tab.url);
      return (
        current.searchParams.get("q") === expectedQuery &&
        (current.searchParams.get("f") ?? null) === (expectedMode ?? null)
      );
    } catch {
      return false;
    }
  };
}

export function buildXSearchResultsProbeScript(maxResults = 20) {
  return `(() => {
    const maxResults = ${Number(maxResults) || 20};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const toAbsoluteUrl = (href) => {
      if (!href) return null;
      try {
        return new URL(href, window.location.origin).toString();
      } catch {
        return null;
      }
    };
    const readStatusUrl = (article) => {
      const anchors = [...article.querySelectorAll('a[href*="/status/"]')];
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") || "";
        if (/\\/status\\/\\d+/i.test(href)) {
          return toAbsoluteUrl(href);
        }
      }
      return null;
    };
    const readAuthor = (article) => {
      const handleCandidates = [
        ...article.querySelectorAll('[data-testid="User-Name"] span'),
        ...article.querySelectorAll('a[href^="/"] span'),
      ]
        .map((node) => normalizeText(node.textContent || ""))
        .filter((value) => /^@[^\\s/]+$/.test(value));
      return handleCandidates[0] || null;
    };
    const readText = (article) =>
      normalizeText(
        article.querySelector('[data-testid="tweetText"]')?.innerText ||
          article.querySelector('[lang]')?.innerText ||
          ""
      );
    const readPostedAt = (article) => article.querySelector("time")?.getAttribute("datetime") || null;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const results = [];
    for (const article of articles) {
      const url = readStatusUrl(article);
      const author = readAuthor(article);
      if (!url || !author) continue;
      results.push({
        url,
        author,
        text: readText(article) || null,
        postedAt: readPostedAt(article),
      });
      if (results.length >= maxResults) break;
    }
    const loading = Boolean(
      document.querySelector('[role="progressbar"], [aria-label*="Loading" i], [data-testid="primaryColumn"] [aria-busy="true"]')
    );
    const noResults = /no results for/i.test(normalizeText(document.body?.innerText || ""));
    const scrollTop = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
    const scrollHeight = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      query: new URL(window.location.href).searchParams.get("q"),
      searchResultCount: results.length,
      articleCount: articles.length,
      loading,
      noResults,
      scrollTop,
      scrollHeight,
      viewportHeight,
      atBottom: scrollTop + viewportHeight >= scrollHeight - 32,
      results,
    });
  })()`;
}

export function buildXSearchResultsScrollScript({ stepMultiplier = 0.9 } = {}) {
  const normalizedStepMultiplier = Number.isFinite(stepMultiplier) ? stepMultiplier : 0.9;

  return `(() => {
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const step = Math.max(400, Math.round(viewportHeight * ${normalizedStepMultiplier}));
    window.scrollBy(0, step);
    const scrollTop = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
    const scrollHeight = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
    return JSON.stringify({
      scrollTop,
      scrollHeight,
      viewportHeight,
      atBottom: scrollTop + viewportHeight >= scrollHeight - 32,
    });
  })()`;
}

export function parseXSearchProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      url: null,
      title: "",
      query: null,
      searchResultCount: 0,
      articleCount: 0,
      loading: false,
      noResults: false,
      scrollTop: 0,
      scrollHeight: 0,
      viewportHeight: 0,
      atBottom: false,
      results: [],
    };
  }

  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function annotateSearchCandidates(results, query) {
  const normalizedQuery = query?.trim() || null;

  return (results ?? []).map((candidate) => ({
    ...candidate,
    source: candidate?.source?.toString().trim() || "x-search",
    searchQuery: candidate?.searchQuery?.toString().trim() || normalizedQuery,
  }));
}

export async function scrapeXSearchResults({
  adapter,
  query,
  expectedHandle = null,
  personaProfile = null,
  mode = DEFAULT_X_SEARCH_MODE,
  maxResults = 100,
  maxChecks = 40,
  waitMs = 1000,
  maxIdleChecks = 3,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!query?.trim()) throw new TypeError("query is required.");

  const targetUrl = buildXSearchUrl(query, { mode });
  const navigation = await openVerifiedXTab({
    adapter,
    expectedHandle,
    personaProfile,
    targetUrl,
    matchTab: matchesXSearchTab(query, mode),
  });

  const targetResultCount = Math.max(1, Math.min(100, Number(maxResults) || 100));
  const probeScript = buildXSearchResultsProbeScript(targetResultCount);
  const scrollScript = buildXSearchResultsScrollScript();
  let lastState = null;
  let bestResultCount = 0;
  let idleChecks = 0;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseXSearchProbeResult(await adapter.evaluateActiveTab(probeScript));
    if (lastState.searchResultCount >= targetResultCount || lastState.noResults) {
      return {
        ok: true,
        navigation,
        query,
        mode,
        searchUrl: targetUrl,
        candidates: annotateSearchCandidates(lastState.results, query),
        state: lastState,
      };
    }

    if (lastState.searchResultCount > 0 && !lastState.loading && lastState.atBottom) {
      return {
        ok: true,
        navigation,
        query,
        mode,
        searchUrl: targetUrl,
        candidates: annotateSearchCandidates(lastState.results, query),
        state: lastState,
      };
    }

    if (lastState.searchResultCount > bestResultCount) {
      bestResultCount = lastState.searchResultCount;
      idleChecks = 0;
    } else if (!lastState.loading && lastState.atBottom) {
      idleChecks += 1;
      if (idleChecks >= Math.max(1, maxIdleChecks)) {
        return {
          ok: true,
          navigation,
          query,
          mode,
          searchUrl: targetUrl,
          candidates: annotateSearchCandidates(lastState.results, query),
          state: lastState,
        };
      }
    } else if (!lastState.loading) {
      idleChecks += 1;
    }

    if (attempt < maxChecks) {
      if (!lastState.noResults && lastState.searchResultCount < targetResultCount) {
        await adapter.evaluateActiveTab(scrollScript);
      }

      if (typeof adapter.wait === "function") {
        await adapter.wait(waitMs);
      } else {
        await sleep(waitMs);
      }
    }
  }

  return {
    ok: true,
    navigation,
    query,
    mode,
    searchUrl: targetUrl,
    candidates: annotateSearchCandidates(lastState?.results, query),
    state: lastState,
  };
}
