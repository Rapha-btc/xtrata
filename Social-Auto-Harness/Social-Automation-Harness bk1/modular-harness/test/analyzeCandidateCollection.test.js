import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeCandidateCollection,
  buildCandidateAnalysisSynthesisPrompt,
  buildCandidateAnalysisSynthesisSchemaDescription,
  normalizeCandidateAnalysisSynthesisValue,
} from "../src/analysis/analyzeCandidateCollection.js";

const governanceState = {
  mode: {
    currentMode: "promotional-specific",
    currentConfig: {
      PROMO_SUBJECT: "xtrata",
    },
  },
  diversity: {
    cooldownDays: 14,
    lastStrategyUsed: "Ordinals",
    lastStandaloneAngle: "Builder angle",
  },
  pendingImprovements: {
    pendingItems: [],
  },
  followedAccounts: {
    handles: [],
  },
};

test("buildCandidateAnalysisSynthesisPrompt includes shortlist and selective instructions", () => {
  const prompt = buildCandidateAnalysisSynthesisPrompt({
    candidateType: "thread",
    governanceState,
    shortlistedEntries: [
      {
        shortlistIndex: 0,
        candidateIndex: 12,
        author: "@builder",
        preliminaryRecommendation: "consider",
      },
    ],
  });

  assert.match(prompt, /final shortlist/i);
  assert.match(prompt, /candidateIndex/);
  assert.match(prompt, /Downgrade aggressively/i);
});

test("buildCandidateAnalysisSynthesisSchemaDescription locks the expected shortlist shape", () => {
  const schema = buildCandidateAnalysisSynthesisSchemaDescription("thread", 2);
  assert.match(schema, /shortlistIndex: integer/);
  assert.match(schema, /candidateIndex: integer/);
});

test("normalizeCandidateAnalysisSynthesisValue falls back to preliminary fields when synthesis is incomplete", () => {
  const normalized = normalizeCandidateAnalysisSynthesisValue(
    {
      candidateType: "thread",
      summary: "ok",
      searchRefinementSuggestions: ["More builders"],
      analyses: [
        {
          shortlistIndex: 0,
          candidateIndex: 12,
          recommendation: "prioritize",
          relevanceScore: 91,
          safetyScore: 93,
          xtrataFit: "high",
          suggestedAction: "reply",
          reasoning: "Strong fit",
          draftBrief: "Use a builder angle",
          riskFlags: ["good"],
        },
      ],
    },
    {
      candidateType: "thread",
      shortlistedEntries: [
        {
          shortlistIndex: 0,
          candidateIndex: 12,
          preliminaryRecommendation: "consider",
          preliminaryRelevanceScore: 60,
          preliminarySafetyScore: 80,
          preliminaryXtrataFit: "medium",
          preliminarySuggestedAction: "save",
          preliminaryReasoning: "Decent fit",
          preliminaryDraftBrief: "Builder angle",
          preliminaryRiskFlags: ["baseline"],
        },
        {
          shortlistIndex: 1,
          candidateIndex: 15,
          preliminaryRecommendation: "consider",
          preliminaryRelevanceScore: 55,
          preliminarySafetyScore: 82,
          preliminaryXtrataFit: "medium",
          preliminarySuggestedAction: "save",
          preliminaryReasoning: "Second fit",
          preliminaryDraftBrief: "Second angle",
          preliminaryRiskFlags: ["baseline-2"],
        },
      ],
    }
  );

  assert.equal(normalized.analyses.length, 2);
  assert.equal(normalized.analyses[0].recommendation, "prioritize");
  assert.equal(normalized.analyses[1].recommendation, "consider");
  assert.deepEqual(normalized.searchRefinementSuggestions, ["More builders"]);
});

test("analyzeCandidateCollection batches candidates, runs synthesis, and closes fresh tabs", async () => {
  const candidates = Array.from({ length: 60 }, (_, index) => ({
    author: `@builder${index}`,
    url: `https://x.com/example/status/${index}`,
    text: `Candidate ${index}`,
    postedAt: "2026-04-03T12:00:00.000Z",
    source: "x-search",
    searchQuery: "Ordinals",
  }));
  const batchSizes = [];
  const closedTabs = [];
  let synthesisCall = null;

  const result = await analyzeCandidateCollection({
    adapter: {
      async closeTab(tab) {
        closedTabs.push(tab);
      },
    },
    candidateType: "thread",
    candidates,
    governanceState,
    batchSize: 25,
    maxCandidates: 100,
    finalSynthesisLimit: 25,
    async analyzeCandidateBatchFn(options) {
      batchSizes.push(options.candidates.length);
      const batchStart = batchSizes.slice(0, -1).reduce((sum, value) => sum + value, 0);
      return {
        analyzedCount: options.candidates.length,
        value: {
          summary: `batch ${batchStart}`,
          searchRefinementSuggestions: [`refine ${batchStart}`],
          analyses: options.candidates.map((candidate, localIndex) => ({
            candidateIndex: localIndex,
            recommendation: localIndex === 0 ? "prioritize" : "skip",
            relevanceScore: localIndex === 0 ? 80 : 10,
            safetyScore: localIndex === 0 ? 90 : 60,
            xtrataFit: localIndex === 0 ? "high" : "low",
            suggestedAction: localIndex === 0 ? "reply" : "skip",
            reasoning: localIndex === 0 ? "strong" : "weak",
            draftBrief: localIndex === 0 ? "builder angle" : null,
            riskFlags: [],
          })),
        },
        session: {
          action: "opened-new-tab",
          tab: { windowId: 1, tabIndex: batchStart / 25 + 2 },
        },
      };
    },
    async sendPromptForJsonFn(options) {
      synthesisCall = options;
      return {
        value: {
          candidateType: "thread",
          summary: "final shortlist",
          searchRefinementSuggestions: ["use more builder-native search terms"],
          analyses: [
            {
              shortlistIndex: 0,
              candidateIndex: 0,
              recommendation: "prioritize",
              relevanceScore: 92,
              safetyScore: 95,
              xtrataFit: "high",
              suggestedAction: "reply",
              reasoning: "best overall",
              draftBrief: "Lead with builder composability",
              riskFlags: [],
            },
            {
              shortlistIndex: 1,
              candidateIndex: 25,
              recommendation: "consider",
              relevanceScore: 84,
              safetyScore: 90,
              xtrataFit: "high",
              suggestedAction: "reply",
              reasoning: "second-best",
              draftBrief: "Mention recursion",
              riskFlags: [],
            },
            {
              shortlistIndex: 2,
              candidateIndex: 50,
              recommendation: "consider",
              relevanceScore: 81,
              safetyScore: 88,
              xtrataFit: "medium",
              suggestedAction: "save",
              reasoning: "third-best",
              draftBrief: "Mention discovery",
              riskFlags: [],
            },
          ],
        },
        session: {
          action: "opened-new-tab",
          tab: { windowId: 1, tabIndex: 9 },
        },
      };
    },
  });

  assert.deepEqual(batchSizes, [25, 25, 10]);
  assert.equal(result.analyzedCount, 60);
  assert.equal(result.batchSummaries.length, 3);
  assert.equal(result.synthesisResult.shortlistedCount, 3);
  assert.equal(result.value.summary, "final shortlist");
  assert.match(synthesisCall.prompt, /Shortlist:/);
  assert.equal(synthesisCall.forceNewTab, true);
  assert.equal(closedTabs.length, 4);
  assert.equal(result.enrichedAnalyses[0].candidate.author, "@builder0");
  assert.deepEqual(result.value.searchRefinementSuggestions, [
    "refine 0",
    "refine 25",
    "refine 50",
    "use more builder-native search terms",
  ]);
});

test("analyzeCandidateCollection skips GPT work when no candidates are provided", async () => {
  const result = await analyzeCandidateCollection({
    adapter: {},
    candidateType: "thread",
    candidates: [],
    governanceState,
    async analyzeCandidateBatchFn() {
      throw new Error("should not run");
    },
    async sendPromptForJsonFn() {
      throw new Error("should not run");
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.analyzedCount, 0);
});
