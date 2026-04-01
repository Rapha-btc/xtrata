import assert from "node:assert/strict";
import test from "node:test";

import {
  buildXSearchResultsProbeScript,
  buildXSearchUrl,
  matchesXSearchTab,
  parseXSearchProbeResult,
  scrapeXSearchResults,
} from "../src/x/scrapeXSearchResults.js";

function classifyScript(script) {
  if (script.includes("loggedIn")) return "session-probe";
  if (script.includes("searchResultCount")) return "search-probe";
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
    loading: false,
    noResults: false,
    results: [],
  });
});

test("scrapeXSearchResults opens a search tab in the verified window and returns scraped results", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ searchResultCount: 0, loading: true, noResults: false, results: [] }),
      JSON.stringify({
        searchResultCount: 2,
        loading: false,
        noResults: false,
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
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    ["evaluateActiveTab", "session-probe"],
    ["listTabs", undefined],
    ["openTabInFrontWindow", "https://x.com/search?q=Bitcoin+L2&src=typed_query&f=live"],
    ["evaluateActiveTab", "search-probe"],
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
      JSON.stringify({ searchResultCount: 0, loading: false, noResults: true, results: [] }),
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
