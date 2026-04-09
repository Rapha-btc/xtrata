import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeResearchCollection,
  buildResearchAnalysisPrompt,
  buildResearchAnalysisSchemaDescription,
  buildResearchSynthesisPrompt,
  normalizeResearchAnalysisValue,
} from "../src/research/analyze.js";

const researchJob = {
  topic: "Bitcoin data permanence",
  objective: "Summarize the most relevant overnight discussions.",
  timeWindowHours: 24,
  maxItemsPerSource: 100,
  analysisBatchSize: 2,
  finalSynthesisLimit: 2,
  outputFormat: "markdown",
  reportInstructions: "End with a short operator-facing takeaway.",
  persona: "xtrata",
  account: "research@example.com",
  sources: [
    {
      type: "x-search",
      label: "Builders",
      query: "bitcoin permanence",
      mode: "live",
    },
  ],
};

const researchItems = [
  {
    itemId: "research-1",
    sourceType: "x-search",
    sourceLabel: "Builders",
    query: "bitcoin permanence",
    url: "https://x.com/example/status/1",
    author: "@builder",
    publishedAt: "2026-04-01T12:00:00.000Z",
    title: null,
    snippet: "Durability matters.",
    bodyText: "Durability matters.",
    collectedAt: "2026-04-05T00:00:00.000Z",
    dedupeKey: "url:https://x.com/example/status/1",
    metadata: {},
    raw: {},
  },
  {
    itemId: "research-2",
    sourceType: "x-search",
    sourceLabel: "Builders",
    query: "bitcoin permanence",
    url: "https://x.com/example/status/2",
    author: "@artist",
    publishedAt: "2026-04-01T12:10:00.000Z",
    title: null,
    snippet: "Art post",
    bodyText: "Art post",
    collectedAt: "2026-04-05T00:00:00.000Z",
    dedupeKey: "url:https://x.com/example/status/2",
    metadata: {},
    raw: {},
  },
  {
    itemId: "research-3",
    sourceType: "x-search",
    sourceLabel: "Builders",
    query: "bitcoin permanence",
    url: "https://x.com/example/status/3",
    author: "@speculator",
    publishedAt: "2026-04-01T12:20:00.000Z",
    title: null,
    snippet: "Speculative post",
    bodyText: "Speculative post",
    collectedAt: "2026-04-05T00:00:00.000Z",
    dedupeKey: "url:https://x.com/example/status/3",
    metadata: {},
    raw: {},
  },
];

test("buildResearchAnalysisPrompt and schema describe the generic research contract", () => {
  const prompt = buildResearchAnalysisPrompt({
    job: researchJob,
    items: [{ itemIndex: 0, url: "https://x.com/example/status/1", snippet: "Durability matters." }],
  });
  const schema = buildResearchAnalysisSchemaDescription(2);

  assert.match(prompt, /Bitcoin data permanence/);
  assert.match(prompt, /overnight topic report/);
  assert.match(prompt, /itemIndex/);
  assert.match(schema, /credibilityScore/);
  assert.match(schema, /suggestedUse/);
});

test("normalizeResearchAnalysisValue fills safe defaults when model output is incomplete", () => {
  const value = normalizeResearchAnalysisValue(
    {
      summary: "One useful item.",
      searchRefinementSuggestions: ["broaden sources", "broaden sources"],
      analyses: [
        {
          itemIndex: 0,
          recommendation: "prioritize",
          relevanceScore: 91,
          credibilityScore: 88,
          noveltyScore: 70,
          suggestedUse: "lead",
          reasoning: "High quality signal.",
          keyTakeaway: "Durability is a repeated operator concern.",
          riskFlags: ["needs-verification"],
        },
      ],
    },
    { itemCount: 2 }
  );

  assert.equal(value.analyses.length, 2);
  assert.equal(value.analyses[0].recommendation, "prioritize");
  assert.equal(value.analyses[1].recommendation, "skip");
  assert.deepEqual(value.searchRefinementSuggestions, ["broaden sources"]);
});

test("buildResearchSynthesisPrompt passes reportInstructions through verbatim", () => {
  const prompt = buildResearchSynthesisPrompt({
    job: researchJob,
    shortlistedEntries: [
      {
        shortlistIndex: 0,
        itemIndex: 0,
        url: "https://x.com/example/status/1",
      },
    ],
  });

  assert.match(prompt, /Additional report instructions:/);
  assert.match(prompt, /End with a short operator-facing takeaway\./);
});

test("analyzeResearchCollection batches items, synthesizes a shortlist, and returns call metadata", async () => {
  let callCount = 0;
  let capturedSynthesisPrompt = null;
  const capturedReplyOptions = [];

  const result = await analyzeResearchCollection({
    adapter: {},
    job: researchJob,
    items: researchItems,
    replyMaxChecks: 300,
    replyWaitMs: 1000,
    async sendPromptForJsonFn(options) {
      callCount += 1;
      capturedReplyOptions.push({
        replyMaxChecks: options.replyMaxChecks,
        replyWaitMs: options.replyWaitMs,
      });

      if (callCount <= 2) {
        const batchOffset = callCount === 1 ? 0 : 2;
        return {
          value: {
            summary: `batch ${batchOffset}`,
            searchRefinementSuggestions: [`refine ${batchOffset}`],
            analyses: options.prompt.includes("Speculative post")
              ? [
                  {
                    itemIndex: 0,
                    recommendation: "skip",
                    relevanceScore: 20,
                    credibilityScore: 35,
                    noveltyScore: 15,
                    suggestedUse: "discard",
                    reasoning: "Weak signal.",
                    keyTakeaway: null,
                    riskFlags: ["low-credibility"],
                  },
                ]
              : [
                  {
                    itemIndex: 0,
                    recommendation: "prioritize",
                    relevanceScore: 92,
                    credibilityScore: 88,
                    noveltyScore: 75,
                    suggestedUse: "lead",
                    reasoning: "Strong fit.",
                    keyTakeaway: "Durability is central.",
                    riskFlags: [],
                  },
                  {
                    itemIndex: 1,
                    recommendation: "consider",
                    relevanceScore: 75,
                    credibilityScore: 80,
                    noveltyScore: 70,
                    suggestedUse: "supporting",
                    reasoning: "Useful support.",
                    keyTakeaway: "Artists frame durability as infrastructure.",
                    riskFlags: [],
                  },
                ],
          },
          session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: callCount } },
          submit: { ok: true },
          replyState: { url: `https://chatgpt.com/c/${callCount}` },
        };
      }

      capturedSynthesisPrompt = options.prompt;
      return {
        value: {
          summary: "final shortlist",
          searchRefinementSuggestions: ["search more builder-native phrases"],
          analyses: [
            {
              shortlistIndex: 0,
              itemIndex: 0,
              recommendation: "prioritize",
              relevanceScore: 95,
              credibilityScore: 90,
              noveltyScore: 80,
              suggestedUse: "lead",
              reasoning: "Best lead.",
              keyTakeaway: "Durability is the main overnight theme.",
              riskFlags: [],
            },
            {
              shortlistIndex: 1,
              itemIndex: 1,
              recommendation: "consider",
              relevanceScore: 82,
              credibilityScore: 84,
              noveltyScore: 72,
              suggestedUse: "supporting",
              reasoning: "Good support.",
              keyTakeaway: "Creative accounts echoed the same infrastructure concern.",
              riskFlags: [],
            },
          ],
        },
        session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 9 } },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/final" },
      };
    },
  });

  assert.equal(result.analyzedCount, 3);
  assert.equal(result.batchSummaries.length, 2);
  assert.equal(result.synthesisResult.shortlistedCount, 2);
  assert.equal(result.callMetadata.length, 3);
  assert.deepEqual(capturedReplyOptions, [
    { replyMaxChecks: 300, replyWaitMs: 1000 },
    { replyMaxChecks: 300, replyWaitMs: 1000 },
    { replyMaxChecks: 300, replyWaitMs: 1000 },
  ]);
  assert.match(capturedSynthesisPrompt, /End with a short operator-facing takeaway\./);
  assert.equal(result.enrichedAnalyses[0].recommendation, "prioritize");
  assert.deepEqual(result.value.searchRefinementSuggestions, [
    "refine 0",
    "refine 2",
    "search more builder-native phrases",
  ]);
});

test("analyzeResearchCollection skips GPT work when no items are provided", async () => {
  const result = await analyzeResearchCollection({
    adapter: {},
    job: researchJob,
    items: [],
    async sendPromptForJsonFn() {
      throw new Error("should not run");
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.analyzedCount, 0);
  assert.deepEqual(result.value.analyses, []);
});

test("analyzeResearchCollection splits oversized analysis batches before submission", async () => {
  const prompts = [];
  const progressEvents = [];
  const oversizedItems = researchItems.map((item, index) => ({
    ...item,
    bodyText: `Long body ${index} ${"detail ".repeat(300)}`,
  }));

  const result = await analyzeResearchCollection({
    adapter: {},
    job: {
      ...researchJob,
      analysisBatchSize: 10,
    },
    items: oversizedItems,
    analysisPromptCharLimit: 1800,
    async onProgress(event) {
      progressEvents.push(event);
    },
    async sendPromptForJsonFn(options) {
      if (options.prompt.includes("Shortlist:")) {
        return {
          value: {
            summary: "final shortlist",
            searchRefinementSuggestions: [],
            analyses: [
              {
                shortlistIndex: 0,
                itemIndex: 0,
                recommendation: "prioritize",
                relevanceScore: 90,
                credibilityScore: 85,
                noveltyScore: 70,
                suggestedUse: "lead",
                reasoning: "Best lead.",
                keyTakeaway: "Lead takeaway.",
                riskFlags: [],
              },
              {
                shortlistIndex: 1,
                itemIndex: 1,
                recommendation: "consider",
                relevanceScore: 80,
                credibilityScore: 82,
                noveltyScore: 68,
                suggestedUse: "supporting",
                reasoning: "Useful support.",
                keyTakeaway: "Support takeaway.",
                riskFlags: [],
              },
            ],
          },
          session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 9 } },
          submit: { ok: true },
          replyState: { url: "https://chatgpt.com/c/final-oversized" },
        };
      }

      const payload = JSON.parse(options.prompt.split("Item batch:\n")[1]);
      prompts.push(payload.length);
      return {
        value: {
          summary: `batch size ${payload.length}`,
          searchRefinementSuggestions: [],
          analyses: payload.map((entry, itemIndex) => ({
            itemIndex,
            recommendation: "consider",
            relevanceScore: 70,
            credibilityScore: 75,
            noveltyScore: 65,
            suggestedUse: "supporting",
            reasoning: `Processed ${entry.url}`,
            keyTakeaway: entry.url,
            riskFlags: [],
          })),
        },
        session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: prompts.length } },
        submit: { ok: true },
        replyState: { url: `https://chatgpt.com/c/oversized-${prompts.length}` },
      };
    },
  });

  assert.deepEqual(prompts, [1, 1, 1]);
  assert.equal(result.analyzedCount, 3);
  assert.equal(result.batchSummaries.length, 3);
  assert.ok(
    progressEvents.some(
      (event) =>
        event.stage === "research-analysis-batch" &&
        event.action === "split" &&
        event.details.reason === "prompt-too-large"
    )
  );
});

test("analyzeResearchCollection splits failed analysis batches into smaller retries", async () => {
  const progressEvents = [];
  const attemptedBatchSizes = [];

  const result = await analyzeResearchCollection({
    adapter: {},
    job: {
      ...researchJob,
      analysisBatchSize: 10,
    },
    items: researchItems,
    analysisPromptCharLimit: 50000,
    async onProgress(event) {
      progressEvents.push(event);
    },
    async sendPromptForJsonFn(options) {
      if (options.prompt.includes("Shortlist:")) {
        return {
          value: {
            summary: "final shortlist",
            searchRefinementSuggestions: [],
            analyses: [
              {
                shortlistIndex: 0,
                itemIndex: 0,
                recommendation: "prioritize",
                relevanceScore: 90,
                credibilityScore: 85,
                noveltyScore: 70,
                suggestedUse: "lead",
                reasoning: "Best lead.",
                keyTakeaway: "Lead takeaway.",
                riskFlags: [],
              },
              {
                shortlistIndex: 1,
                itemIndex: 1,
                recommendation: "consider",
                relevanceScore: 80,
                credibilityScore: 82,
                noveltyScore: 68,
                suggestedUse: "supporting",
                reasoning: "Useful support.",
                keyTakeaway: "Support takeaway.",
                riskFlags: [],
              },
            ],
          },
          session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 9 } },
          submit: { ok: true },
          replyState: { url: "https://chatgpt.com/c/final-split" },
        };
      }

      const payload = JSON.parse(options.prompt.split("Item batch:\n")[1]);
      attemptedBatchSizes.push(payload.length);

      if (payload.length > 1) {
        const error = new Error("ChatGPT reply did not contain valid JSON. after 2 attempts.");
        error.rawReplyText = "Not valid JSON.";
        error.dispatchedPrompt = options.prompt;
        error.session = { action: "opened-new-tab", tab: { windowId: 1, tabIndex: attemptedBatchSizes.length } };
        throw error;
      }

      return {
        value: {
          summary: "single item batch",
          searchRefinementSuggestions: [],
          analyses: [
            {
              itemIndex: 0,
              recommendation: "consider",
              relevanceScore: 70,
              credibilityScore: 75,
              noveltyScore: 65,
              suggestedUse: "supporting",
              reasoning: `Processed ${payload[0].url}`,
              keyTakeaway: payload[0].url,
              riskFlags: [],
            },
          ],
        },
        session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: attemptedBatchSizes.length } },
        submit: { ok: true },
        replyState: { url: `https://chatgpt.com/c/split-${attemptedBatchSizes.length}` },
      };
    },
  });

  assert.deepEqual(attemptedBatchSizes, [3, 2, 1, 1, 1]);
  assert.equal(result.analyzedCount, 3);
  assert.equal(result.batchSummaries.length, 3);
  assert.ok(
    progressEvents.some(
      (event) =>
        event.stage === "research-analysis-batch" &&
        event.action === "split" &&
        event.details.reason === "json-contract-failed"
    )
  );
});
