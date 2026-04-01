import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplyDraftPrompt,
  buildReplyDraftSchemaDescription,
  draftReplyCandidates,
  normalizeReplyDraftValue,
  selectReplyDraftTargets,
} from "../src/drafting/draftReplyCandidates.js";

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
    pendingItems: [],
  },
  followedAccounts: {
    handles: ["alreadyfollowed"],
  },
};

const opportunityReport = {
  threadOpportunities: [
    {
      rank: 1,
      candidateIndex: 0,
      recommendation: "prioritize",
      relevanceScore: 91,
      safetyScore: 90,
      xtrataFit: "high",
      suggestedAction: "reply",
      reasoning: "Strong topical fit.",
      draftBrief: "Mention permanence naturally.",
      riskFlags: [],
      candidate: {
        url: "https://x.com/example/status/1",
        author: "@freshbuilder",
        text: "Bitcoin L2 builders need permanence.",
        postedAt: "2026-04-01T12:00:00.000Z",
      },
    },
    {
      rank: 2,
      candidateIndex: 1,
      recommendation: "consider",
      relevanceScore: 80,
      safetyScore: 72,
      xtrataFit: "medium",
      suggestedAction: "reply",
      reasoning: "Decent fit.",
      draftBrief: "Keep it light.",
      riskFlags: ["medium-fit"],
      candidate: {
        url: "https://x.com/example/status/2",
        author: "@secondbuilder",
        text: "Interesting take on Bitcoin app infra.",
        postedAt: "2026-04-01T12:05:00.000Z",
      },
    },
    {
      rank: 3,
      candidateIndex: 2,
      recommendation: "skip",
      relevanceScore: 25,
      safetyScore: 90,
      xtrataFit: "low",
      suggestedAction: "skip",
      reasoning: "Weak fit.",
      draftBrief: null,
      riskFlags: ["weak-fit"],
      candidate: {
        url: "https://x.com/example/status/3",
        author: "@weakfit",
        text: "Generic crypto chatter",
        postedAt: "2026-04-01T12:10:00.000Z",
      },
    },
  ],
};

test("selectReplyDraftTargets keeps the safest highest-value thread opportunities", () => {
  const targets = selectReplyDraftTargets({
    opportunityReport,
    maxDrafts: 2,
    minSafetyScore: 75,
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].author, "@freshbuilder");
  assert.equal(targets[0].draftIndex, 0);
});

test("buildReplyDraftPrompt includes governance context and reply rules", () => {
  const prompt = buildReplyDraftPrompt({
    governanceState,
    draftTargets: selectReplyDraftTargets({
      opportunityReport,
      maxDrafts: 2,
      minSafetyScore: 70,
    }),
  });

  assert.match(prompt, /promotional-specific/);
  assert.match(prompt, /No hashtags in replies/);
  assert.match(prompt, /@freshbuilder/);
});

test("buildReplyDraftSchemaDescription locks the expected JSON shape", () => {
  const schema = buildReplyDraftSchemaDescription(2);
  assert.match(schema, /candidateType: string, must equal "thread-reply-drafts"/);
  assert.match(schema, /drafts: array with 2 objects/);
});

test("normalizeReplyDraftValue computes ready state and flags unsafe drafts", () => {
  const draftTargets = selectReplyDraftTargets({
    opportunityReport,
    maxDrafts: 2,
    minSafetyScore: 70,
  });
  const normalized = normalizeReplyDraftValue(
    {
      candidateType: "thread-reply-drafts",
      summary: "One usable, one not.",
      drafts: [
        {
          draftIndex: 0,
          status: "draft",
          url: "https://x.com/example/status/1",
          replyText: "Interesting point.\n Permanent app data matters more once Bitcoin L2 apps get composable.",
          reasoning: "Natural fit.",
          safetyChecks: ["mode-fit"],
        },
        {
          draftIndex: 1,
          status: "draft",
          url: "https://x.com/example/status/2",
          replyText: "#Stacks xtrata.xyz makes this easier",
          reasoning: "Too promotional.",
          safetyChecks: [],
        },
      ],
    },
    { draftTargets }
  );

  assert.equal(normalized.drafts.length, 2);
  assert.equal(normalized.drafts[0].ready, true);
  assert.equal(
    normalized.drafts[0].replyText,
    "Interesting point. Permanent app data matters more once Bitcoin L2 apps get composable."
  );
  assert.equal(normalized.drafts[1].ready, false);
  assert.match(normalized.drafts[1].safetyChecks.join(","), /contains-hashtag/);
});

test("draftReplyCandidates skips GPT calls when there are no eligible thread opportunities", async () => {
  const result = await draftReplyCandidates({
    adapter: {},
    opportunityReport: {
      threadOpportunities: [
        {
          recommendation: "skip",
          safetyScore: 90,
          candidate: { url: "https://x.com/example/status/3", text: "weak" },
        },
      ],
    },
    governanceState,
    async sendPromptForJsonFn() {
      throw new Error("should not be called");
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.draftedCount, 0);
  assert.deepEqual(result.value.drafts, []);
});

test("draftReplyCandidates calls sendPromptForJson and returns enriched drafts", async () => {
  let captured = null;
  const result = await draftReplyCandidates({
    adapter: {},
    opportunityReport,
    governanceState,
    maxDrafts: 2,
    minSafetyScore: 70,
    async sendPromptForJsonFn(options) {
      captured = options;
      return {
        prompt: options.prompt,
        dispatchedPrompt: options.prompt,
        jsonText: "{}",
        value: {
          candidateType: "thread-reply-drafts",
          summary: "Two draft decisions returned.",
          drafts: [
            {
              draftIndex: 0,
              status: "draft",
              url: "https://x.com/example/status/1",
              replyText:
                "Interesting point. Permanent app data matters more once Bitcoin L2 builders start composing on shared state.",
              reasoning: "Good fit for the target thread.",
              safetyChecks: ["mode-fit"],
            },
            {
              draftIndex: 1,
              status: "skip",
              url: "https://x.com/example/status/2",
              replyText: null,
              reasoning: "Useful, but not strong enough for a reply.",
              safetyChecks: ["medium-fit"],
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
  assert.deepEqual(captured.requiredKeys, ["candidateType", "summary", "drafts"]);
  assert.equal(result.draftTargets.length, 2);
  assert.equal(result.enrichedDrafts[0].ready, true);
  assert.equal(result.enrichedDrafts[0].target.author, "@freshbuilder");
  assert.equal(result.enrichedDrafts[1].status, "skip");
});
