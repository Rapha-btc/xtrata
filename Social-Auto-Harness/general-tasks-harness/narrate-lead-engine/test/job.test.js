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
  assert.equal(job.maxResultsPerQuery, 5);
  assert.equal(job.maxTotalQueries, 8);
  assert.equal(job.maxCollectedItems, 40);
  assert.equal(job.chatgptWaitBudgetMs, 240000);
  assert.equal(job.chatgptPollMs, 1000);
  assert.equal(job.chatgptReuseReplyThreadForRepairs, true);
  assert.equal(job.sources[0].maxQueries, 4);
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
