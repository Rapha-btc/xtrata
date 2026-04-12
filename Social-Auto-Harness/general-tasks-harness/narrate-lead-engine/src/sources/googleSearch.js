import { closeManagedTab, LeadEngineSafetyError } from "../safety.js";

function normalizeText(value) {
  return value?.toString().replace(/\s+/g, " ").trim() ?? "";
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function canonicalizeUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "ved" || key === "ei") {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function unwrapGoogleResultUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, "https://www.google.com");
    if (/google\./i.test(url.hostname) && url.pathname === "/url") {
      return canonicalizeUrl(url.searchParams.get("q"));
    }
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

function pickMatchingTab(tabs, matcher) {
  return tabs.find((tab) => matcher(tab)) ?? null;
}

function isNoChromeWindowError(error) {
  return /chrome window not found/i.test(error?.message ?? "");
}

function buildBrowserOpenError(error, targetUrl) {
  if (isNoChromeWindowError(error)) {
    const wrapped = new Error(
      `Google Chrome did not have an open window for ${targetUrl}. The collector attempted a safe fallback but browser bootstrapping still failed. Open Google Chrome manually, leave one window open, then rerun the job.`
    );
    wrapped.cause = error;
    return wrapped;
  }

  return error;
}

export async function openOrReuseTab({ adapter, targetUrl, matchTab, waitAfterOpenMs = 1200 }) {
  try {
    const tabs = await adapter.listTabs();
    const existing = pickMatchingTab(tabs, matchTab);
    if (existing) {
      await adapter.activateTab(existing);
      return {
        action: "activated-existing-tab",
        tab: existing,
      };
    }
  } catch {
    // Best-effort tab reuse only.
  }

  if (typeof adapter.openTabInFrontWindow === "function") {
    try {
      const tab = await adapter.openTabInFrontWindow(targetUrl);
      if (typeof adapter.wait === "function" && waitAfterOpenMs > 0) {
        await adapter.wait(waitAfterOpenMs);
      }
      return {
        action: "opened-new-tab",
        tab,
      };
    } catch (error) {
      if (!isNoChromeWindowError(error)) {
        throw buildBrowserOpenError(error, targetUrl);
      }
    }
  }

  if (typeof adapter.openTab !== "function") {
    throw new TypeError("adapter.openTab is required when no Chrome window is available.");
  }

  try {
    const tab = await adapter.openTab(targetUrl);
    if (typeof adapter.wait === "function" && waitAfterOpenMs > 0) {
      await adapter.wait(waitAfterOpenMs);
    }

    return {
      action: "opened-new-tab",
      tab,
    };
  } catch (error) {
    throw buildBrowserOpenError(error, targetUrl);
  }
}

export function buildGoogleSearchUrl(query, { maxResults = 10 } = {}) {
  if (!normalizeText(query)) throw new TypeError("query is required.");

  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", normalizeText(query));
  url.searchParams.set("hl", "en");
  url.searchParams.set("num", String(Math.max(1, Math.min(10, Number(maxResults) || 10))));
  return url.toString();
}

export function matchesGoogleSearchTab(query) {
  const expectedQuery = normalizeText(query);

  return (tab) => {
    try {
      const url = new URL(tab?.url ?? "");
      return /google\./i.test(url.hostname) && url.pathname === "/search" && url.searchParams.get("q") === expectedQuery;
    } catch {
      return false;
    }
  };
}

export function buildGoogleSearchProbeScript(maxResults = 10) {
  return `(() => {
    const maxResults = ${Math.max(1, Math.min(10, Number(maxResults) || 10))};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const bodyText = normalizeText(document.body?.innerText || "");
    const titleText = normalizeText(document.title || "");
    const securityCheck =
      /our systems have detected unusual traffic/i.test(bodyText) ||
      /about this page/i.test(titleText) ||
      /this page checks to see if it's really you/i.test(bodyText);
    const canonicalize = (href) => {
      if (!href) return null;
      try {
        const url = new URL(href, window.location.origin);
        if (/google\\./i.test(url.hostname) && url.pathname === "/url") {
          return url.searchParams.get("q");
        }
        if (/google\\./i.test(url.hostname) && url.pathname === "/search") {
          return null;
        }
        url.hash = "";
        for (const key of [...url.searchParams.keys()]) {
          if (/^utm_/i.test(key) || key === "ved" || key === "ei") {
            url.searchParams.delete(key);
          }
        }
        return url.toString();
      } catch {
        return null;
      }
    };
    const extractSnippet = (container, title) => {
      const candidateNodes = [
        container?.querySelector(".VwiC3b"),
        container?.querySelector(".yXK7lf"),
        container?.querySelector('[data-sncf="1"]'),
        container?.querySelector("span"),
        container,
      ].filter(Boolean);

      for (const node of candidateNodes) {
        const text = normalizeText(node.innerText || node.textContent || "");
        if (!text) continue;
        if (title && text === title) continue;
        if (title && text.startsWith(title)) {
          const remainder = normalizeText(text.slice(title.length));
          if (remainder) return remainder.slice(0, 420);
        }
        return text.slice(0, 420);
      }
      return null;
    };
    const extractPublishedText = (container) => {
      const text = normalizeText(container?.innerText || "");
      const match = text.match(/(?:\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\b\\s+\\d{1,2},\\s+\\d{4})|(?:\\b\\d{1,2}\\s+(?:days?|weeks?|months?|years?)\\s+ago\\b)/i);
      return match ? match[0] : null;
    };
    const anchors = [...document.querySelectorAll("a[href]")];
    const results = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const title = normalizeText(anchor.querySelector("h3")?.innerText || anchor.getAttribute("aria-label") || "");
      if (!title) continue;
      const url = canonicalize(anchor.href);
      if (!url || seen.has(url)) continue;
      let hostname = "";
      try {
        hostname = new URL(url).hostname.replace(/^www\\./, "");
      } catch {
        hostname = "";
      }
      if (!hostname || /google\\./i.test(hostname)) continue;

      const container =
        anchor.closest("div.g, div[data-snc], div.MjjYud, div.N54PNb, article, li") ||
        anchor.parentElement;
      const snippet = extractSnippet(container, title);
      const sourceName = normalizeText(container?.querySelector("cite")?.innerText || hostname) || hostname;

      results.push({
        url,
        title,
        excerpt: snippet,
        rawText: normalizeText(container?.innerText || "").slice(0, 1600),
        sourceName,
        publishedAt: extractPublishedText(container),
      });
      seen.add(url);
      if (results.length >= maxResults) break;
    }

    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      query: new URL(window.location.href).searchParams.get("q"),
      securityCheck,
      securityCheckReason: securityCheck
        ? "google-unusual-traffic"
        : null,
      noResults: /did not match any documents|no results found/i.test(normalizeText(document.body?.innerText || "")),
      resultCount: results.length,
      results,
    });
  })()`;
}

export function parseGoogleSearchProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      url: null,
      title: "",
      query: null,
      securityCheck: false,
      securityCheckReason: null,
      noResults: false,
      resultCount: 0,
      results: [],
    };
  }

  return JSON.parse(raw);
}

export function normalizeGoogleSearchResults(results = [], query) {
  return results.map((entry) => ({
    platform: "open-web",
    url: unwrapGoogleResultUrl(entry.url),
    title: normalizeOptionalText(entry.title),
    excerpt: normalizeOptionalText(entry.excerpt),
    rawText: normalizeOptionalText(entry.rawText) ?? normalizeOptionalText(entry.excerpt),
    sourceName: normalizeOptionalText(entry.sourceName),
    publishedAt: normalizeOptionalText(entry.publishedAt),
    authorName: null,
    searchQuery: normalizeOptionalText(query),
  }));
}

export async function scrapeGoogleSearchResults({
  adapter,
  query,
  maxResults = 8,
  maxChecks = 8,
  waitMs = 1000,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!normalizeText(query)) throw new TypeError("query is required.");

  const targetUrl = buildGoogleSearchUrl(query, { maxResults });
  const navigation = await openOrReuseTab({
    adapter,
    targetUrl,
    matchTab: matchesGoogleSearchTab(query),
  });

  let lastState = null;
  try {
    for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
      lastState = parseGoogleSearchProbeResult(
        await adapter.evaluateActiveTab(buildGoogleSearchProbeScript(maxResults))
      );

      if (lastState.securityCheck) {
        throw new LeadEngineSafetyError(
          "Google presented an unusual-traffic / security-check page. The app will stop here instead of pushing through a bot check. Disable direct Google scraping for this job or switch to gpt-web-search/manual sources.",
          {
            provider: "google",
            query,
            url: lastState.url ?? targetUrl,
            reason: lastState.securityCheckReason ?? "google-unusual-traffic",
          }
        );
      }

      if (lastState.resultCount > 0 || lastState.noResults) {
        break;
      }

      await adapter.wait(waitMs);
    }
  } finally {
    await closeManagedTab(adapter, navigation);
  }

  return {
    ok: true,
    navigation,
    query,
    searchUrl: targetUrl,
    state: lastState,
    items: normalizeGoogleSearchResults(lastState?.results ?? [], query),
  };
}

export async function collectGoogleSearchSource({
  source,
  queryPlan,
  job,
  adapter,
} = {}) {
  const rawResult = await scrapeGoogleSearchResults({
    adapter,
    query: queryPlan.query,
    maxResults: job.maxResultsPerQuery,
  });

  return {
    sourceType: source.type,
    sourceLabel: source.label,
    queryPlan,
    collectedCount: rawResult.items.length,
    items: rawResult.items,
    rawResult,
  };
}
