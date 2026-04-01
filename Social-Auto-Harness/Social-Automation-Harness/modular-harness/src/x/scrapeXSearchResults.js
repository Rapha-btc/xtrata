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
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      query: new URL(window.location.href).searchParams.get("q"),
      searchResultCount: results.length,
      loading,
      noResults,
      results,
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
      loading: false,
      noResults: false,
      results: [],
    };
  }

  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeXSearchResults({
  adapter,
  query,
  expectedHandle = null,
  personaProfile = null,
  mode = DEFAULT_X_SEARCH_MODE,
  maxResults = 20,
  maxChecks = 5,
  waitMs = 1000,
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

  const probeScript = buildXSearchResultsProbeScript(maxResults);
  let lastState = null;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseXSearchProbeResult(await adapter.evaluateActiveTab(probeScript));
    if (lastState.searchResultCount > 0 || lastState.noResults || !lastState.loading) {
      return {
        ok: true,
        navigation,
        query,
        mode,
        searchUrl: targetUrl,
        candidates: lastState.results ?? [],
        state: lastState,
      };
    }

    if (attempt < maxChecks) {
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
    candidates: lastState?.results ?? [],
    state: lastState,
  };
}
