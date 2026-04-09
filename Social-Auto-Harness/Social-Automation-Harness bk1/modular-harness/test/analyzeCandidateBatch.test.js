import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeCandidateBatch,
  buildCandidateAnalysisPrompt,
  buildCandidateAnalysisSchemaDescription,
  normalizeCandidateAnalysisValue,
  summarizeGovernanceForAnalysis,
} from "../src/analysis/analyzeCandidateBatch.js";

const governanceState = {
  mode: {
    currentMode: "promotional-specific",
    currentConfig: {
      PROMO_SUBJECT: "DYLE0415",
      PROMO_ANGLE: "Second chance mint",
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

test("summarizeGovernanceForAnalysis returns the compact planning context", () => {
  assert.deepEqual(summarizeGovernanceForAnalysis(governanceState), {
    currentMode: "promotional-specific",
    currentConfig: {
      PROMO_SUBJECT: "DYLE0415",
      PROMO_ANGLE: "Second chance mint",
    },
    lastStrategyUsed: "Strategy 4: NFT artist community",
    lastStandaloneAngle: "Collection promo — scarcity/sequel",
    cooldownDays: 14,
    pendingImprovementsCount: 1,
    pendingImprovementTitles: ["Verify follower source quality"],
    followedAccountsCount: 1,
  });
});

test("buildCandidateAnalysisPrompt includes governance context and candidate JSON", () => {
  const prompt = buildCandidateAnalysisPrompt({
    candidateType: "thread",
    governanceState,
    candidates: [
      {
        candidateIndex: 0,
        author: "@freshbuilder",
        url: "https://x.com/example/status/1",
        text: "Bitcoin L2 builder thread",
      },
    ],
    maxCandidates: 1,
  });

  assert.match(prompt, /promotional-specific/);
  assert.match(prompt, /@freshbuilder/);
  assert.match(prompt, /Return one analysis object for every candidateIndex provided/);
  assert.match(prompt, /Use prioritize sparingly/);
  assert.match(prompt, /Prefer breadth across different authors and angles/);
});

test("buildCandidateAnalysisSchemaDescription locks the expected JSON shape", () => {
  const schema = buildCandidateAnalysisSchemaDescription("thread", 3);
  assert.match(schema, /candidateType: string, must equal "thread"/);
  assert.match(schema, /analyses: array with 3 objects/);
});

test("normalizeCandidateAnalysisValue coerces invalid or missing entries into safe defaults", () => {
  const normalized = normalizeCandidateAnalysisValue(
    {
      candidateType: "thread",
      summary: "Result summary",
      searchRefinementSuggestions: ["Refine query", "Refine query"],
      analyses: [
        {
          candidateIndex: 0,
          recommendation: "prioritize",
          relevanceScore: 88.2,
          safetyScore: 91,
          xtrataFit: "high",
          suggestedAction: "reply",
          reasoning: "Strong fit",
          draftBrief: "Mention permanence naturally",
          riskFlags: ["low-risk"],
        },
      ],
    },
    { candidateType: "thread", candidateCount: 2 }
  );

  assert.equal(normalized.analyses.length, 2);
  assert.equal(normalized.analyses[0].recommendation, "prioritize");
  assert.equal(normalized.analyses[1].recommendation, "skip");
  assert.deepEqual(normalized.searchRefinementSuggestions, ["Refine query"]);
});

test("analyzeCandidateBatch skips GPT calls when the candidate list is empty", async () => {
  const result = await analyzeCandidateBatch({
    adapter: {},
    candidateType: "thread",
    candidates: [],
    governanceState,
    async sendPromptForJsonFn() {
      throw new Error("should not be called");
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.analyzedCount, 0);
  assert.deepEqual(result.value.analyses, []);
});

test("analyzeCandidateBatch calls sendPromptForJson and returns enriched analyses", async () => {
  let captured = null;
  const result = await analyzeCandidateBatch({
    adapter: {},
    candidateType: "thread",
    candidates: [
      {
        author: "@freshbuilder",
        url: "https://x.com/example/status/1",
        text: "Bitcoin L2 builder thread",
        postedAt: "2026-04-01T12:00:00.000Z",
      },
      {
        author: "@secondbuilder",
        url: "https://x.com/example/status/2",
        text: "Another thread",
        postedAt: "2026-04-01T12:05:00.000Z",
      },
    ],
    governanceState,
    async sendPromptForJsonFn(options) {
      captured = options;
      return {
        prompt: options.prompt,
        dispatchedPrompt: options.prompt,
        jsonText: "{}",
        value: {
          candidateType: "thread",
          summary: "One strong, one weak.",
          searchRefinementSuggestions: ["Search more Stacks-native builders"],
          analyses: [
            {
              candidateIndex: 0,
              recommendation: "prioritize",
              relevanceScore: 84,
              safetyScore: 92,
              xtrataFit: "high",
              suggestedAction: "reply",
              reasoning: "Strong fit for promotional-specific mode.",
              draftBrief: "Mention Bitcoin L2 permanence naturally.",
              riskFlags: [],
            },
            {
              candidateIndex: 1,
              recommendation: "skip",
              relevanceScore: 20,
              safetyScore: 80,
              xtrataFit: "low",
              suggestedAction: "skip",
              reasoning: "Weak fit.",
              draftBrief: null,
              riskFlags: ["low-signal"],
            },
          ],
        },
        rawReplyText: "{}",
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/1" },
      };
    },
  });

  assert.equal(captured.expectedType, "object");
  assert.deepEqual(captured.requiredKeys, [
    "candidateType",
    "summary",
    "searchRefinementSuggestions",
    "analyses",
  ]);
  assert.equal(result.enrichedAnalyses.length, 2);
  assert.equal(result.enrichedAnalyses[0].candidate.author, "@freshbuilder");
  assert.equal(result.enrichedAnalyses[0].recommendation, "prioritize");
  assert.equal(result.enrichedAnalyses[1].riskFlags[0], "low-signal");
});

test("analyzeCandidateBatch defaults to a broader candidate limit", async () => {
  let captured = null;
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    author: `@builder${index}`,
    url: `https://x.com/example/status/${index}`,
    text: `Candidate ${index}`,
    postedAt: "2026-04-01T12:00:00.000Z",
  }));

  await analyzeCandidateBatch({
    adapter: {},
    candidateType: "thread",
    candidates,
    governanceState,
    async sendPromptForJsonFn(options) {
      captured = options;
      return {
        value: {
          candidateType: "thread",
          summary: "ok",
          searchRefinementSuggestions: [],
          analyses: Array.from({ length: 20 }, (_, index) => ({
            candidateIndex: index,
            recommendation: "skip",
            relevanceScore: 0,
            safetyScore: 50,
            xtrataFit: "low",
            suggestedAction: "skip",
            reasoning: "skip",
            draftBrief: null,
            riskFlags: [],
          })),
        },
      };
    },
  });

  assert.match(captured.prompt, /analyzing 20 thread candidates/);
});
