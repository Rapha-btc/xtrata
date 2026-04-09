import assert from "node:assert/strict";
import test from "node:test";

import { buildResearchReport, renderResearchReportMarkdown } from "../src/research/report.js";

const researchJob = {
  topic: "Bitcoin data permanence",
  objective: "Summarize the strongest overnight themes.",
  timeWindowHours: 24,
  outputFormat: "markdown",
  reportInstructions: "",
  sources: [
    {
      type: "x-search",
      label: "Builders",
      query: "bitcoin permanence",
      mode: "live",
    },
  ],
};

test("buildResearchReport ranks findings deterministically and renders sections in order", () => {
  const report = buildResearchReport({
    job: researchJob,
    normalizedItems: [{ itemId: "1" }, { itemId: "2" }],
    analysisResult: {
      analyzedCount: 2,
      synthesisResult: { shortlistedCount: 2 },
      value: {
        summary: "Two useful findings.",
        searchRefinementSuggestions: ["Broaden builder-native terms"],
      },
      enrichedAnalyses: [
        {
          recommendation: "consider",
          suggestedUse: "supporting",
          relevanceScore: 75,
          credibilityScore: 80,
          noveltyScore: 70,
          reasoning: "Good support.",
          keyTakeaway: "Artists reinforced the infrastructure angle.",
          riskFlags: [],
          item: {
            itemId: "2",
            sourceType: "x-search",
            sourceLabel: "Builders",
            query: "bitcoin permanence",
            url: "https://x.com/example/status/2",
          },
        },
        {
          recommendation: "prioritize",
          suggestedUse: "lead",
          relevanceScore: 95,
          credibilityScore: 90,
          noveltyScore: 80,
          reasoning: "Best lead.",
          keyTakeaway: "Durability was the strongest repeated theme.",
          riskFlags: [],
          item: {
            itemId: "1",
            sourceType: "x-search",
            sourceLabel: "Builders",
            query: "bitcoin permanence",
            url: "https://x.com/example/status/1",
            author: "@builder",
          },
        },
      ],
    },
  });

  const markdown = renderResearchReportMarkdown(report);

  assert.equal(report.topFindings[0].item.url, "https://x.com/example/status/1");
  assert.equal(report.counts.shortlistedItems, 2);
  assert.deepEqual(report.searchRefinementSuggestions, ["Broaden builder-native terms"]);
  assert.ok(markdown.indexOf("## Executive Summary") < markdown.indexOf("## Top Findings"));
  assert.ok(markdown.indexOf("## Top Findings") < markdown.indexOf("## Evidence by Query/Source"));
  assert.ok(markdown.indexOf("## Evidence by Query/Source") < markdown.indexOf("## Open Questions and Gaps"));
  assert.ok(markdown.indexOf("## Open Questions and Gaps") < markdown.indexOf("## Search Refinements for Next Run"));
  assert.ok(markdown.indexOf("## Search Refinements for Next Run") < markdown.indexOf("## Appendix of Reviewed Items"));
});

test("renderResearchReportMarkdown handles zero findings explicitly", () => {
  const report = buildResearchReport({
    job: researchJob,
    normalizedItems: [],
    analysisResult: {
      analyzedCount: 0,
      synthesisResult: null,
      value: {
        summary: "No items were provided for analysis.",
        searchRefinementSuggestions: [],
      },
      enrichedAnalyses: [],
    },
  });

  const markdown = renderResearchReportMarkdown(report);

  assert.match(markdown, /No significant findings were identified/);
  assert.match(markdown, /No evidence groups were produced/);
  assert.match(markdown, /No items were reviewed/);
});
