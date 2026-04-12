import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleSearchUrl,
  normalizeGoogleSearchResults,
  parseGoogleSearchProbeResult,
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
