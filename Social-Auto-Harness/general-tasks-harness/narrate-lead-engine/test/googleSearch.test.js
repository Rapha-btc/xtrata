import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleSearchUrl,
  normalizeGoogleSearchResults,
  openOrReuseTab,
  parseGoogleSearchProbeResult,
  scrapeGoogleSearchResults,
} from "../src/sources/googleSearch.js";

test("buildGoogleSearchUrl encodes the query and caps result count", () => {
  const url = new URL(buildGoogleSearchUrl("\"audiobook\" expensive", { maxResults: 99 }));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("q"), "\"audiobook\" expensive");
  assert.equal(url.searchParams.get("num"), "10");
});

test("normalizeGoogleSearchResults canonicalizes entries", () => {
  const results = normalizeGoogleSearchResults(
    [
      {
        url: "https://www.google.com/url?q=https://example.com/post?utm_source=test",
        title: " Prospect ",
        excerpt: " Useful signal ",
        rawText: " Useful signal with context ",
        sourceName: "Example",
        publishedAt: "Apr 1, 2026",
      },
    ],
    "audiobook cost"
  );

  assert.equal(results[0].url, "https://example.com/post");
  assert.equal(results[0].searchQuery, "audiobook cost");
  assert.equal(results[0].title, "Prospect");
});

test("parseGoogleSearchProbeResult returns an empty fallback for blank input", () => {
  const value = parseGoogleSearchProbeResult("");
  assert.equal(value.resultCount, 0);
  assert.deepEqual(value.results, []);
});

test("openOrReuseTab falls back to opening a fresh browser url when no Chrome window exists", async () => {
  const calls = [];
  const result = await openOrReuseTab({
    adapter: {
      async listTabs() {
        return [];
      },
      async openTabInFrontWindow() {
        throw new Error("Chrome window not found");
      },
      async openTab(url) {
        calls.push(url);
        return { windowId: null, tabIndex: null, url };
      },
      async wait() {
        calls.push("wait");
      },
    },
    targetUrl: "https://www.google.com/search?q=test",
    matchTab() {
      return false;
    },
    waitAfterOpenMs: 1,
  });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(calls[0], "https://www.google.com/search?q=test");
  assert.equal(calls[1], "wait");
});

test("scrapeGoogleSearchResults stops immediately on Google's unusual traffic page", async () => {
  await assert.rejects(
    () =>
      scrapeGoogleSearchResults({
        adapter: {
          async listTabs() {
            return [];
          },
          async openTabInFrontWindow(url) {
            return { windowId: 1, tabIndex: 1, url };
          },
          async evaluateActiveTab() {
            return JSON.stringify({
              url: "https://www.google.com/search?q=test",
              title: "About this page",
              query: "test",
              securityCheck: true,
              securityCheckReason: "google-unusual-traffic",
              noResults: false,
              resultCount: 0,
              results: [],
            });
          },
          async wait() {},
          async closeTab() {},
        },
        query: "test",
        maxResults: 3,
      }),
    /Google presented an unusual-traffic/
  );
});
