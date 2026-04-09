import assert from "node:assert/strict";
import test from "node:test";

import {
  buildXSearchResultsProbeScript,
  buildXSearchResultsScrollScript,
  buildXSearchUrl,
  matchesXSearchTab,
  parseXSearchProbeResult,
  scrapeXSearchResults,
} from "../src/x/scrapeXSearchResults.js";

function classifyScript(script) {
  if (script.includes("loggedIn")) return "session-probe";
  if (script.includes("searchResultCount")) return "search-probe";
  if (script.includes("window.scrollBy")) return "search-scroll";
  return "unknown";
}

class FakeBrowserAdapter {
  constructor({ tabs = [], evaluationResults = [] } = {}) {
    this.tabs = tabs;
    this.evaluationResults = [...evaluationResults];
    this.calls = [];
  }

  async ensureBrowserApp() {
    this.calls.push(["ensureBrowserApp"]);
  }

  async listTabs() {
    this.calls.push(["listTabs"]);
    return this.tabs;
  }

  async activateTab(tab) {
    this.calls.push(["activateTab", tab]);
  }

  async openProfileWindow({ profileDirectory, url }) {
    const tab = { windowId: 99, tabIndex: 1, url, profileDirectory };
    this.calls.push(["openProfileWindow", { profileDirectory, url }]);
    this.tabs.push(tab);
    return tab;
  }

  async openTabInFrontWindow(url) {
    const tab = { windowId: 1, tabIndex: 2, url };
    this.calls.push(["openTabInFrontWindow", url]);
    this.tabs.push(tab);
    return tab;
  }

  async openTab(url) {
    const tab = { windowId: null, tabIndex: null, url };
    this.calls.push(["openTab", url]);
    this.tabs.push(tab);
    return tab;
  }

  async evaluateActiveTab(script) {
    this.calls.push(["evaluateActiveTab", classifyScript(script)]);
    return this.evaluationResults.shift();
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("buildXSearchUrl creates a live-search URL by default", () => {
  assert.equal(
    buildXSearchUrl("Bitcoin L2"),
    "https://x.com/search?q=Bitcoin+L2&src=typed_query&f=live"
  );
});

test("matchesXSearchTab matches a tab with the same query and mode", () => {
  const matcher = matchesXSearchTab("Bitcoin L2");

  assert.equal(matcher({ url: "https://x.com/search?q=Bitcoin+L2&src=typed_query&f=live" }), true);
  assert.equal(matcher({ url: "https://x.com/search?q=sBTC&src=typed_query&f=live" }), false);
});

test("buildXSearchResultsProbeScript embeds the requested result cap", () => {
  const script = buildXSearchResultsProbeScript(12);
  assert.match(script, /const maxResults = 12;/);
  assert.match(script, /searchResultCount/);
  assert.match(script, /atBottom/);
});

test("buildXSearchResultsScrollScript scrolls the page in bounded steps", () => {
  const script = buildXSearchResultsScrollScript({ stepMultiplier: 0.75 });
  assert.match(script, /window\.scrollBy/);
  assert.match(script, /0.75/);
});

test("parseXSearchProbeResult accepts JSON text or raw objects", () => {
  assert.deepEqual(parseXSearchProbeResult('{"searchResultCount":1,"results":[{"url":"https://x.com/x/status/1"}]}'), {
    searchResultCount: 1,
    results: [{ url: "https://x.com/x/status/1" }],
  });
  assert.deepEqual(parseXSearchProbeResult({ searchResultCount: 0, results: [] }), {
    searchResultCount: 0,
    results: [],
  });
  assert.deepEqual(parseXSearchProbeResult(""), {
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
  });
});

test("scrapeXSearchResults opens a search tab in the verified window and returns scraped results", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({
        searchResultCount: 0,
        articleCount: 0,
        loading: true,
        noResults: false,
        atBottom: false,
        results: [],
      }),
      JSON.stringify({
        scrollTop: 800,
        scrollHeight: 3000,
        viewportHeight: 900,
        atBottom: false,
      }),
      JSON.stringify({
        searchResultCount: 2,
        articleCount: 2,
        loading: false,
        noResults: false,
        atBottom: true,
        results: [
          {
            url: "https://x.com/example/status/1",
            author: "@freshbuilder",
            text: "Builder post",
            postedAt: "2026-04-01T12:00:00.000Z",
          },
          {
            url: "https://x.com/example/status/2",
            author: "@secondbuilder",
            text: "Another post",
            postedAt: "2026-04-01T12:05:00.000Z",
          },
        ],
      }),
    ],
  });

  const result = await scrapeXSearchResults({
    adapter,
    query: "Bitcoin L2",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    waitMs: 10,
  });

  assert.equal(result.navigation.action, "opened-new-tab");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].author, "@freshbuilder");
  assert.equal(result.candidates[0].source, "x-search");
  assert.equal(result.candidates[0].searchQuery, "Bitcoin L2");
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    ["evaluateActiveTab", "session-probe"],
    ["listTabs", undefined],
    ["openTabInFrontWindow", "https://x.com/search?q=Bitcoin+L2&src=typed_query&f=live"],
    ["evaluateActiveTab", "search-probe"],
    ["evaluateActiveTab", "search-scroll"],
    ["wait", 10],
    ["evaluateActiveTab", "search-probe"],
  ]);
});

test("scrapeXSearchResults returns an empty result set once the page is loaded without hits", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/search?q=Bitcoin+L2&src=typed_query&f=live" },
    ],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ searchResultCount: 0, articleCount: 0, loading: false, noResults: true, atBottom: true, results: [] }),
    ],
  });

  const result = await scrapeXSearchResults({
    adapter,
    query: "Bitcoin L2",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
  });

  assert.equal(result.navigation.action, "activated-existing-matching-tab");
  assert.deepEqual(result.candidates, []);
});

test("scrapeXSearchResults keeps scrolling until the requested cap is reached", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ searchResultCount: 20, articleCount: 20, loading: false, noResults: false, atBottom: false, results: Array.from({ length: 20 }, (_, index) => ({ url: `https://x.com/example/status/${index}`, author: `@author${index}` })) }),
      JSON.stringify({ scrollTop: 800, scrollHeight: 4000, viewportHeight: 900, atBottom: false }),
      JSON.stringify({ searchResultCount: 45, articleCount: 45, loading: false, noResults: false, atBottom: false, results: Array.from({ length: 45 }, (_, index) => ({ url: `https://x.com/example/status/${index}`, author: `@author${index}` })) }),
      JSON.stringify({ scrollTop: 1600, scrollHeight: 5000, viewportHeight: 900, atBottom: false }),
      JSON.stringify({ searchResultCount: 100, articleCount: 100, loading: false, noResults: false, atBottom: true, results: Array.from({ length: 100 }, (_, index) => ({ url: `https://x.com/example/status/${index}`, author: `@author${index}` })) }),
    ],
  });

  const result = await scrapeXSearchResults({
    adapter,
    query: "Ordinals",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    maxResults: 100,
    waitMs: 10,
  });

  assert.equal(result.candidates.length, 100);
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    ["evaluateActiveTab", "session-probe"],
    ["listTabs", undefined],
    ["openTabInFrontWindow", "https://x.com/search?q=Ordinals&src=typed_query&f=live"],
    ["evaluateActiveTab", "search-probe"],
    ["evaluateActiveTab", "search-scroll"],
    ["wait", 10],
    ["evaluateActiveTab", "search-probe"],
    ["evaluateActiveTab", "search-scroll"],
    ["wait", 10],
    ["evaluateActiveTab", "search-probe"],
  ]);
});
