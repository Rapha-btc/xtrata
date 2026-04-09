import assert from "node:assert/strict";
import test from "node:test";

import {
  filterReplyQueueDraftsByGovernance,
  isReadyReplyDraft,
  runManualReplyQueue,
  selectReplyQueueDrafts,
} from "../src/execution/manualReplyQueue.js";

const draftResult = {
  enrichedDrafts: [
    {
      draftIndex: 0,
      url: "https://x.com/example/status/1",
      replyText: "Interesting point.",
      ready: true,
      target: {
        url: "https://x.com/example/status/1",
        author: "@freshbuilder",
      },
    },
    {
      draftIndex: 1,
      url: "https://x.com/example/status/2",
      replyText: "",
      ready: false,
      target: {
        url: "https://x.com/example/status/2",
        author: "@skipped",
      },
    },
    {
      draftIndex: 2,
      url: "https://x.com/example/status/3",
      replyText: "Another reply.",
      ready: true,
      target: {
        url: "https://x.com/example/status/3",
        author: "@secondbuilder",
      },
    },
  ],
};

test("isReadyReplyDraft requires a url, text, and a ready draft", () => {
  assert.equal(isReadyReplyDraft(draftResult.enrichedDrafts[0]), true);
  assert.equal(isReadyReplyDraft(draftResult.enrichedDrafts[1]), false);
});

test("selectReplyQueueDrafts filters to ready drafts and preserves source positions", () => {
  const selected = selectReplyQueueDrafts(draftResult, {
    startIndex: 0,
    maxReplies: 5,
  });

  assert.equal(selected.length, 2);
  assert.equal(selected[0].sourceIndex, 0);
  assert.equal(selected[0].queueIndex, 0);
  assert.equal(selected[1].sourceIndex, 2);
  assert.equal(selected[1].queueIndex, 1);
});

test("filterReplyQueueDraftsByGovernance blocks drafts whose threads were already reviewed", () => {
  const selected = selectReplyQueueDrafts(draftResult, {
    startIndex: 0,
    maxReplies: 5,
  });
  const governanceState = {
    postedThreads: {
      threads: [],
    },
    interactionLedger: {
      reviewedThreads: [
        {
          normalizedThreadUrl: "https://x.com/example/status/1",
        },
      ],
    },
    diversity: {
      cooldownAuthors: [],
      excludedAccounts: [],
    },
    followedAccounts: {
      handles: [],
    },
  };

  const result = filterReplyQueueDraftsByGovernance(selected, { governanceState });

  assert.equal(result.acceptedDrafts.length, 1);
  assert.equal(result.acceptedDrafts[0].url, "https://x.com/example/status/3");
  assert.equal(result.blockedDrafts.length, 1);
  assert.deepEqual(result.blockedDrafts[0].rejectedReasons, ["already-reviewed-thread"]);
});

test("runManualReplyQueue continues after an operator decline and logs the later sent draft", async () => {
  const preparedCalls = [];
  const waitedCalls = [];
  const recordedCalls = [];
  const preparedCallbacks = [];
  const outcomeCallbacks = [];

  const result = await runManualReplyQueue({
    adapter: {},
    draftResult,
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      xHandle: "@xtratalayers",
    },
    maxReplies: 2,
    sendTimeoutMs: 2000,
    pollIntervalMs: 500,
    async prepareReplyComposerFn(options) {
      preparedCalls.push(options);
      return {
        tweetUrl: options.tweetUrl,
        navigation: { action: "activated-existing-matching-tab" },
        opened: { action: "clicked-reply" },
        textMatches: true,
        state: { canSubmit: true },
      };
    },
    async waitForManualReplySendFn(options) {
      waitedCalls.push(options);
      return waitedCalls.length === 1
        ? {
            ok: true,
            status: "declined-by-operator",
            state: {
              matchingReplyUrl: null,
            },
          }
        : {
            ok: true,
            status: "sent",
            state: {
              matchingReplyUrl: "https://x.com/XtrataLayers/status/99",
            },
          };
    },
    async recordManualReplyOutcomeFn(options) {
      recordedCalls.push(options);
      return {
        ledgerPath: "/tmp/interaction-ledger.jsonl",
        postedThreadsPath: options.status === "sent" ? "/tmp/posted-threads-log.json" : null,
      };
    },
    async onDraftPrepared(payload) {
      preparedCallbacks.push(payload);
    },
    async onDraftOutcome(payload) {
      outcomeCallbacks.push(payload);
    },
  });

  assert.equal(result.processedCount, 2);
  assert.equal(result.sentCount, 1);
  assert.equal(result.declinedCount, 1);
  assert.equal(result.ok, true);
  assert.equal(preparedCalls.length, 2);
  assert.equal(waitedCalls.length, 2);
  assert.equal(recordedCalls.length, 2);
  assert.equal(preparedCallbacks.length, 2);
  assert.equal(outcomeCallbacks.length, 2);
  assert.equal(recordedCalls[0].status, "declined-by-operator");
  assert.equal(recordedCalls[1].status, "sent");
});

test("runManualReplyQueue still stops after the first unconfirmed manual action", async () => {
  const recordedCalls = [];

  const result = await runManualReplyQueue({
    adapter: {},
    draftResult,
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      xHandle: "@xtratalayers",
    },
    maxReplies: 2,
    sendTimeoutMs: 2000,
    pollIntervalMs: 500,
    async prepareReplyComposerFn(options) {
      return {
        tweetUrl: options.tweetUrl,
        navigation: { action: "activated-existing-matching-tab" },
        opened: { action: "clicked-reply" },
        textMatches: true,
        state: { canSubmit: true },
      };
    },
    async waitForManualReplySendFn() {
      return {
        ok: false,
        status: "manual-action-not-confirmed",
        state: {
          matchingReplyUrl: null,
        },
      };
    },
    async recordManualReplyOutcomeFn(options) {
      recordedCalls.push(options);
      return {
        ledgerPath: "/tmp/interaction-ledger.jsonl",
        postedThreadsPath: null,
      };
    },
  });

  assert.equal(result.processedCount, 1);
  assert.equal(result.sentCount, 0);
  assert.equal(result.declinedCount, 0);
  assert.equal(result.ok, false);
  assert.equal(result.stoppedEarly, true);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].status, "manual-action-not-confirmed");
});

test("runManualReplyQueue does not open drafts that are already blocked by governance", async () => {
  const preparedCalls = [];
  const blockedCallbacks = [];

  const result = await runManualReplyQueue({
    adapter: {},
    draftResult,
    governanceState: {
      postedThreads: {
        threads: [
          {
            normalizedUrl: "https://x.com/example/status/1",
          },
        ],
      },
      interactionLedger: {
        reviewedThreads: [],
      },
      diversity: {
        cooldownAuthors: [],
        excludedAccounts: [],
      },
      followedAccounts: {
        handles: [],
      },
    },
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      xHandle: "@xtratalayers",
    },
    maxReplies: 2,
    sendTimeoutMs: 2000,
    pollIntervalMs: 500,
    async prepareReplyComposerFn(options) {
      preparedCalls.push(options);
      return {
        tweetUrl: options.tweetUrl,
        navigation: { action: "activated-existing-matching-tab" },
        opened: { action: "clicked-reply" },
        textMatches: true,
        state: { canSubmit: true },
      };
    },
    async waitForManualReplySendFn() {
      return {
        ok: true,
        status: "declined-by-operator",
        state: {
          matchingReplyUrl: null,
        },
      };
    },
    async recordManualReplyOutcomeFn() {
      return {
        ledgerPath: "/tmp/interaction-ledger.jsonl",
        postedThreadsPath: null,
      };
    },
    async onDraftBlocked(payload) {
      blockedCallbacks.push(payload);
    },
  });

  assert.equal(result.blockedCount, 1);
  assert.equal(result.requestedDraftCount, 1);
  assert.equal(result.processedCount, 1);
  assert.equal(preparedCalls.length, 1);
  assert.equal(preparedCalls[0].tweetUrl, "https://x.com/example/status/3");
  assert.equal(blockedCallbacks.length, 1);
  assert.deepEqual(blockedCallbacks[0].rejectedReasons, ["already-replied-thread"]);
});
