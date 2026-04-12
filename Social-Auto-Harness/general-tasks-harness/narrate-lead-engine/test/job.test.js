import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNarrateJob } from "../src/job.js";

test("normalizeNarrateJob applies defaults and supports mixed source types", () => {
  const job = normalizeNarrateJob({
    name: "Narrate test",
    objective: "Find audiobook pain.",
    sources: [
      {
        type: "google-search",
        label: "Open web",
        families: ["cost-pain"],
      },
      {
        type: "gpt-web-search",
        label: "GPT web",
        families: ["commercial-intent"],
      },
    ],
  });

  assert.equal(job.timeWindowDays, 30);
  assert.equal(job.maxResultsPerQuery, 8);
  assert.equal(job.sources[0].maxQueries, 6);
  assert.deepEqual(job.sources[0].siteFilters, []);
  assert.equal(job.sources[1].type, "gpt-web-search");
});

test("normalizeNarrateJob rejects unsupported source types", () => {
  assert.throws(
    () =>
      normalizeNarrateJob({
        name: "Bad",
        objective: "Bad",
        sources: [
          {
            type: "reddit-api",
            label: "Bad",
            families: ["cost-pain"],
          },
        ],
      }),
    /Unsupported source type "reddit-api"/
  );
});
