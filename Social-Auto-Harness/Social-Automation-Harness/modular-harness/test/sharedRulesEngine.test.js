import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadGovernanceState } from "../src/governance/loadGovernanceState.js";
import {
  evaluateBotCandidate,
  evaluateFollowCandidates,
  evaluateThreadCandidates,
} from "../src/policy/sharedRulesEngine.js";

const fixtureDir = path.resolve("modular-harness/test/fixtures/governance");

test("evaluateBotCandidate flags the expected bot heuristics", () => {
  const evaluation = evaluateBotCandidate({
    handle: "@AlphaBeta.org",
    bio: "Best airdrop promo",
    bioObserved: true,
    followers: 12,
    following: 7000,
    postCount: 3,
  });

  assert.equal(evaluation.blocked, true);
  assert.deepEqual(evaluation.reasons, [
    "bot-handle-pattern",
    "low-post-count",
    "spam-bio",
    "high-following-low-follower",
  ]);
});

test("evaluateBotCandidate does not assume an unknown bio is an empty bio", () => {
  const evaluation = evaluateBotCandidate({
    handle: "@Alpha123",
    bio: null,
    bioObserved: false,
    followers: null,
    following: null,
    postCount: null,
  });

  assert.equal(evaluation.blocked, false);
  assert.deepEqual(evaluation.reasons, []);
});

test("evaluateThreadCandidates rejects replied threads, cooldown authors, and noise accounts", async () => {
  const governanceState = await loadGovernanceState({ baseDir: fixtureDir });
  const report = evaluateThreadCandidates({
    governanceState,
    now: new Date("2026-04-01T12:00:00Z"),
    candidates: [
      {
        url: "https://x.com/example/status/1234567890",
        author: "@cooldownuser",
        text: "already replied thread",
      },
      {
        url: "https://x.com/example/status/222",
        author: "@cooldownuser",
        text: "same author again",
      },
      {
        url: "https://x.com/example/status/333",
        author: "@NoiseBot",
        text: "noise result",
      },
      {
        url: "https://x.com/example/status/444",
        author: "@freshbuilder",
        text: "fresh result",
      },
    ],
  });

  assert.equal(report.acceptedCandidates.length, 1);
  assert.equal(report.rejectedCandidates.length, 3);
  assert.equal(report.cooldownHits, 2);
  assert.equal(report.diversityGateTriggered, true);
  assert.deepEqual(report.acceptedCandidates[0], {
    url: "https://x.com/example/status/444",
    author: "@freshbuilder",
    text: "fresh result",
  });
});

test("evaluateThreadCandidates ignores expired cooldown entries", async () => {
  const governanceState = await loadGovernanceState({ baseDir: fixtureDir });
  const report = evaluateThreadCandidates({
    governanceState,
    now: new Date("2026-04-01T12:00:00Z"),
    candidates: [
      {
        url: "https://x.com/example/status/555",
        author: "@expireduser",
        text: "old author",
      },
    ],
  });

  assert.equal(report.acceptedCandidates.length, 1);
  assert.equal(report.rejectedCandidates.length, 0);
});

test("evaluateFollowCandidates rejects already-followed and bot-like accounts", async () => {
  const governanceState = await loadGovernanceState({ baseDir: fixtureDir });
  const report = evaluateFollowCandidates({
    governanceState,
    candidates: [
      {
        handle: "@alreadyfollowed",
        bio: "builder",
        followers: 100,
        following: 200,
        postCount: 40,
      },
      {
        handle: "@CleanAccount",
        bio: "Stacks builder",
        followers: 120,
        following: 180,
        postCount: 24,
      },
      {
        handle: "@AlphaBeta.org",
        bio: "",
        followers: 12,
        following: 7000,
        postCount: 3,
      },
    ],
  });

  assert.equal(report.acceptedCandidates.length, 1);
  assert.equal(report.acceptedCandidates[0].handle, "@CleanAccount");
  assert.equal(report.rejectedCandidates.length, 2);
});
