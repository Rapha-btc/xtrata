import assert from "node:assert/strict";
import test from "node:test";

import { buildOpportunityReport } from "../src/reporting/buildOpportunityReport.js";

const governanceState = {
  mode: {
    currentMode: "promotional-specific",
    currentConfig: {
      PROMO_SUBJECT: "DYLE0415",
    },
  },
  diversity: {
    cooldownDays: 14,
    lastStrategyUsed: "Strategy 4: NFT artist community",
    lastStandaloneAngle: "Collection promo — scarcity/sequel",
  },
  pendingImprovements: {
    pendingItems: [{ title: "Verify follower source quality" }],
  },
  followedAccounts: {
    handles: ["alreadyfollowed"],
  },
};

test("buildOpportunityReport sorts opportunities and aggregates guidance", () => {
  const report = buildOpportunityReport({
    governanceState,
    threadCandidates: [{ author: "@a" }, { author: "@b" }],
    followCandidates: [{ handle: "@c" }],
    threadAnalysisResult: {
      analyzedCount: 2,
      value: {
        summary: "Thread summary",
        searchRefinementSuggestions: ["Search more Stacks-native builders"],
      },
      enrichedAnalyses: [
        {
          candidateIndex: 0,
          recommendation: "consider",
          relevanceScore: 60,
          safetyScore: 80,
          xtrataFit: "medium",
          suggestedAction: "save",
          reasoning: "Decent fit",
          draftBrief: null,
          riskFlags: [],
          candidate: { author: "@a", url: "https://x.com/a/status/1" },
        },
        {
          candidateIndex: 1,
          recommendation: "prioritize",
          relevanceScore: 85,
          safetyScore: 90,
          xtrataFit: "high",
          suggestedAction: "reply",
          reasoning: "Strong fit",
          draftBrief: "Lead with permanence angle",
          riskFlags: [],
          candidate: { author: "@b", url: "https://x.com/b/status/2" },
        },
      ],
    },
    followAnalysisResult: {
      analyzedCount: 1,
      value: {
        summary: "Follow summary",
        searchRefinementSuggestions: ["Try another follower source"],
      },
      enrichedAnalyses: [
        {
          candidateIndex: 0,
          recommendation: "skip",
          relevanceScore: 10,
          safetyScore: 70,
          xtrataFit: "low",
          suggestedAction: "skip",
          reasoning: "Weak fit",
          draftBrief: null,
          riskFlags: ["self-follow-risk"],
          candidate: { handle: "@c" },
        },
      ],
    },
    sourceFiles: {
      threadsFile: "/tmp/threads.json",
    },
  });

  assert.equal(report.threadOpportunities[0].candidate.author, "@b");
  assert.equal(report.threadOpportunities[0].rank, 1);
  assert.deepEqual(report.searchRefinementSuggestions, [
    "Search more Stacks-native builders",
    "Try another follower source",
  ]);
  assert.equal(report.recommendationCounts.thread.prioritize, 1);
  assert.equal(report.recommendationCounts.follow.skip, 1);
  assert.match(report.nextSteps[0], /Review the top prioritized thread opportunities/);
});
