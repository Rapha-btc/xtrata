import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileManualReplyOutcomes,
  selectReplyDraftsForReconciliation,
} from "../src/audit/reconcileManualReplyOutcomes.js";

const draftResult = {
  enrichedDrafts: [
    {
      draftIndex: 0,
      url: "https://x.com/example/status/1",
      replyText: "Interesting point.",
      ready: true,
      target: {
        author: "@freshbuilder",
        recommendation: "prioritize",
        searchQuery: "Ordinals",
        riskFlags: [],
      },
      safetyChecks: [],
    },
    {
      draftIndex: 1,
      url: "https://x.com/example/status/2",
      replyText: "Another point.",
      ready: true,
      target: {
        author: "@secondbuilder",
        recommendation: "consider",
        searchQuery: "Ordinals",
        riskFlags: [],
      },
      safetyChecks: [],
    },
  ],
};

test("selectReplyDraftsForReconciliation prefers unsent queue outcomes when a queue file is present", () => {
  const selected = selectReplyDraftsForReconciliation({
    draftResult,
    queueResult: {
      outcomes: [
        { draftIndex: 0, status: "declined-by-operator" },
        { draftIndex: 1, status: "sent" },
      ],
    },
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].draftIndex, 0);
});

test("reconcileManualReplyOutcomes records matching replies as sent and skips already-posted threads", async () => {
  const openedUrls = [];
  const recordedCalls = [];

  const result = await reconcileManualReplyOutcomes({
    adapter: {},
    draftResult,
    queueResult: {
      outcomes: [
        { draftIndex: 0, status: "declined-by-operator" },
        { draftIndex: 1, status: "manual-action-not-confirmed" },
      ],
    },
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      xHandle: "@xtratalayers",
    },
    async loadGovernanceStateFn() {
      return {
        postedThreads: {
          urls: ["https://x.com/example/status/2"],
        },
      };
    },
    async openVerifiedXTabFn(options) {
      openedUrls.push(options.targetUrl);
      return { ok: true, action: "opened-new-tab" };
    },
    async readReplySendObservationStateFn() {
      return {
        matchingReplyVisible: true,
        matchingReplyUrl: "https://x.com/XtrataLayers/status/999",
      };
    },
    async recordManualReplyOutcomeFn(options) {
      recordedCalls.push(options);
      return {
        ledgerPath: "/tmp/interaction-ledger.jsonl",
        postedThreadsPath: "/tmp/posted-threads-log.json",
      };
    },
  });

  assert.equal(result.inspectedCount, 2);
  assert.equal(result.reconciledCount, 1);
  assert.equal(result.alreadyPostedCount, 1);
  assert.equal(result.unresolvedCount, 0);
  assert.deepEqual(openedUrls, ["https://x.com/example/status/1"]);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].status, "sent");
  assert.equal(recordedCalls[0].draft.draftIndex, 0);
});

test("reconcileManualReplyOutcomes leaves unmatched replies unresolved", async () => {
  const result = await reconcileManualReplyOutcomes({
    adapter: {},
    draftResult,
    queueResult: {
      outcomes: [{ draftIndex: 0, status: "manual-action-not-confirmed" }],
    },
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      xHandle: "@xtratalayers",
    },
    async loadGovernanceStateFn() {
      return {
        postedThreads: {
          urls: [],
        },
      };
    },
    async openVerifiedXTabFn() {
      return { ok: true, action: "opened-new-tab" };
    },
    async readReplySendObservationStateFn() {
      return {
        matchingReplyVisible: false,
        matchingReplyUrl: null,
      };
    },
    async recordManualReplyOutcomeFn() {
      throw new Error("should not record unmatched replies");
    },
  });

  assert.equal(result.reconciledCount, 0);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.outcomes[0].status, "reply-not-found");
});
