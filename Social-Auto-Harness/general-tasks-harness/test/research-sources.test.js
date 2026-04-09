import assert from "node:assert/strict";
import test from "node:test";

import { normalizeResearchCollections } from "../src/research/normalize.js";
import {
  buildGptWebSearchPrompt,
  collectGptWebSearchSource,
} from "../src/research/sources/gptWebSearch.js";
import { collectResearchSources } from "../src/research/sources/index.js";
import { collectXSearchSource } from "../src/research/sources/xSearch.js";

const personaProfile = {
  persona: "xtrata",
  browserName: "Google Chrome",
  profileDirectory: "Profile 2",
  xHandle: "@xtratalayers",
};

const researchJob = {
  topic: "Stacks builders",
  objective: "Find strong overnight signals.",
  timeWindowHours: 24,
  maxItemsPerSource: 100,
  analysisBatchSize: 25,
  finalSynthesisLimit: 25,
  outputFormat: "markdown",
  reportInstructions: "",
  persona: "xtrata",
  account: null,
  sources: [],
};

test("collectXSearchSource reuses the existing x-search harness module", async () => {
  let captured = null;
  const source = {
    type: "x-search",
    label: "Builders",
    query: "Stacks builder",
    mode: "latest",
  };

  const result = await collectXSearchSource({
    source,
    job: researchJob,
    adapter: {},
    personaProfile,
    async scrapeXSearchResultsFn(options) {
      captured = options;
      return {
        candidates: [
          {
            url: "https://x.com/example/status/1",
            author: "@builder",
            text: "Builder post",
            postedAt: "2026-04-01T12:00:00.000Z",
          },
        ],
      };
    },
  });

  assert.equal(captured.query, "Stacks builder");
  assert.equal(captured.mode, "latest");
  assert.equal(captured.maxResults, 100);
  assert.equal(captured.expectedHandle, "@xtratalayers");
  assert.equal(result.collectedCount, 1);
});

test("collectGptWebSearchSource requests structured web research through ChatGPT", async () => {
  let captured = null;
  const source = {
    type: "gpt-web-search",
    label: "Hackathon web search",
    query: "find web3 hackathons relevant to on-chain data protocols",
  };

  const prompt = buildGptWebSearchPrompt({
    job: researchJob,
    source,
  });
  assert.match(prompt, /Use web search before answering\./);
  assert.match(prompt, /find web3 hackathons relevant to on-chain data protocols/);

  const result = await collectGptWebSearchSource({
    source,
    job: researchJob,
    adapter: {},
    expectedAccountHint: "research@example.com",
    personaProfile,
    replyMaxChecks: 300,
    replyWaitMs: 1000,
    async sendPromptForJsonFn(options) {
      captured = options;
      return {
        value: {
          summary: "Found two leads.",
          items: [
            {
              title: "Hackathon One",
              url: "https://example.com/hackathon-1",
              sourceName: "Example",
              publishedAt: "2026-04-01",
              author: null,
              snippet: "A relevant hackathon.",
              bodyText: null,
              whyRelevant: "Good fit for on-chain data infra.",
              riskFlags: [],
            },
          ],
        },
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/collect" },
      };
    },
  });

  assert.equal(captured.expectedAccountHint, "research@example.com");
  assert.equal(captured.forceNewTab, true);
  assert.equal(captured.replyMaxChecks, 300);
  assert.equal(captured.replyWaitMs, 1000);
  assert.equal(result.collectedCount, 1);
  assert.equal(result.rawResult.value.items[0].title, "Hackathon One");
});

test("collectGptWebSearchSource rejects malformed structured items before normalization", async () => {
  await assert.rejects(
    () =>
      collectGptWebSearchSource({
        source: {
          type: "gpt-web-search",
          label: "Hackathon web search",
          query: "find web3 hackathons relevant to on-chain data protocols",
        },
        job: researchJob,
        adapter: {},
        async sendPromptForJsonFn(options) {
          const value = {
            summary: "Found one broken lead.",
            items: [
              {
                title: "Broken item",
                url: { href: "https://example.com" },
                sourceName: "Example",
                publishedAt: null,
                author: null,
                snippet: "Broken shape",
                bodyText: null,
                whyRelevant: "Should fail validation.",
                riskFlags: [],
              },
            ],
          };
          const validationResult = options.validate(value);
          if (validationResult !== true) {
            throw new Error(validationResult);
          }

          return {
            value,
            session: { action: "opened-new-tab" },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/collect" },
          };
        },
      }),
    /GPT web search item 0 must include a string or null "url"\./
  );
});

test("collectResearchSources supports mixed x-search and gpt-web-search sources and normalization dedupes repeated URLs", async () => {
  const result = await collectResearchSources({
    job: {
      ...researchJob,
      sources: [
        {
          type: "x-search",
          label: "Builders",
          query: "Stacks builder",
          mode: "live",
        },
        {
          type: "gpt-web-search",
          label: "Hackathon web search",
          query: "hackathons for on-chain data protocols",
        },
      ],
    },
    adapter: {},
    personaProfile,
    async scrapeXSearchResultsFn() {
      return {
        candidates: [
          {
            url: "https://example.com/hackathon-1",
            author: "@builder",
            text: "Duplicate result from X",
            postedAt: "2026-04-01T12:00:00.000Z",
          },
          {
            url: "https://x.com/example/status/2",
            author: "@researcher",
            text: "Fresh result",
            postedAt: "2026-04-01T12:10:00.000Z",
          },
        ],
      };
    },
    async sendPromptForJsonFn() {
      return {
        value: {
          summary: "Found web results.",
          items: [
            {
              title: "Hackathon One",
              url: "https://example.com/hackathon-1",
              sourceName: "Example",
              publishedAt: "2026-04-02",
              author: null,
              snippet: "Duplicate result from web search",
              bodyText: null,
              whyRelevant: "Good fit.",
              riskFlags: [],
            },
            {
              title: "Hackathon Two",
              url: "https://example.com/hackathon-2",
              sourceName: "Example",
              publishedAt: "2026-04-03",
              author: null,
              snippet: "Fresh web result",
              bodyText: null,
              whyRelevant: "Also good.",
              riskFlags: [],
            },
          ],
        },
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/collect" },
      };
    },
  });

  assert.equal(result.sourceCollections.length, 2);
  assert.equal(result.collectedCount, 4);

  const normalized = normalizeResearchCollections({
    sourceCollections: result.sourceCollections,
    collectedAt: "2026-04-05T00:00:00.000Z",
  });

  assert.equal(normalized.normalizedCount, 4);
  assert.equal(normalized.dedupedCount, 3);
  assert.equal(normalized.duplicateCount, 1);
  assert.deepEqual(
    normalized.items.map((item) => item.url),
    [
      "https://example.com/hackathon-1",
      "https://x.com/example/status/2",
      "https://example.com/hackathon-2",
    ]
  );
});

test("collectResearchSources preserves empty x-search result sets", async () => {
  const result = await collectResearchSources({
    job: {
      ...researchJob,
      sources: [
        {
          type: "x-search",
          label: "Empty",
          query: "nothing",
          mode: "live",
        },
      ],
    },
    adapter: {},
    personaProfile,
    async scrapeXSearchResultsFn() {
      return {
        candidates: [],
      };
    },
  });

  assert.equal(result.collectedCount, 0);
  assert.deepEqual(result.sourceCollections[0].rawResult.candidates, []);
});
