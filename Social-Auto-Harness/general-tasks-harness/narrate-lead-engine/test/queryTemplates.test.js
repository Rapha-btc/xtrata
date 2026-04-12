import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscoveryPlan } from "../src/queryTemplates.js";

test("buildDiscoveryPlan expands site-filtered google queries and respects maxQueries", () => {
  const plan = buildDiscoveryPlan({
    maxTotalQueries: 2,
    sources: [
      {
        type: "google-search",
        label: "Open web",
        families: ["cost-pain"],
        siteFilters: ["reddit.com", "kboards.com"],
        maxQueries: 3,
        enabled: true,
      },
    ],
  });

  assert.equal(plan.length, 2);
  assert.ok(plan.every((entry) => entry.query.includes("site:")));
  assert.equal(plan[0].sourceType, "google-search");
});
