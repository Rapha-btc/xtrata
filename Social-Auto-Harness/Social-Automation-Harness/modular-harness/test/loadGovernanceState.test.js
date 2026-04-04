import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BLANK_PENDING_IMPROVEMENTS_MARKDOWN,
  loadGovernanceState,
  parseDiversityRulesMarkdown,
  parseInteractionLedgerJsonl,
  parsePendingImprovementsMarkdown,
} from "../src/governance/loadGovernanceState.js";

const fixtureDir = path.resolve("modular-harness/test/fixtures/governance");

test("parsePendingImprovementsMarkdown extracts pending and done items", () => {
  const parsed = parsePendingImprovementsMarkdown(`# Pending\n\n### [PENDING] Example pending\n**Auto-executable:** Yes\n\n### [DONE - 2026-03-31] Example done\n`);

  assert.equal(parsed.pendingItems.length, 1);
  assert.equal(parsed.doneItems.length, 1);
  assert.equal(parsed.pendingItems[0].autoExecutable, true);
  assert.equal(parsed.doneItems[0].doneAt, "2026-03-31");
});

test("parseDiversityRulesMarkdown extracts cooldown and strategy metadata", async () => {
  const markdown = await readFile(path.join(fixtureDir, "twitter-diversity-rules.md"), "utf8");
  const parsed = parseDiversityRulesMarkdown(markdown);

  assert.equal(parsed.cooldownDays, 14);
  assert.equal(parsed.lastStrategyUsed, "Strategy 4: NFT artist community");
  assert.equal(parsed.lastStandaloneAngle, "Collection promo — scarcity/sequel");
  assert.equal(parsed.cooldownAuthors[0].normalizedAuthor, "cooldownuser");
});

test("parseInteractionLedgerJsonl extracts reviewed thread URLs", () => {
  const parsed = parseInteractionLedgerJsonl(
    '{"actionType":"reply-skipped","status":"skipped","threadUrl":"https://x.com/example/status/666","targetHandle":"@ReviewedUser"}\n'
  );

  assert.deepEqual(parsed.threadUrls, ["https://x.com/example/status/666"]);
  assert.deepEqual(parsed.skippedThreadUrls, ["https://x.com/example/status/666"]);
  assert.equal(parsed.reviewedThreads[0].normalizedTargetHandle, "revieweduser");
});

test("loadGovernanceState loads and normalizes the governance fixture set", async () => {
  const state = await loadGovernanceState({ baseDir: fixtureDir });

  assert.equal(state.mode.currentMode, "engagement-specific");
  assert.deepEqual(state.mode.currentConfig, {
    ENGAGEMENT_TOPIC: "sBTC launch",
    ENGAGEMENT_GOAL: "Explain why permanent data matters",
    ENGAGEMENT_COMMUNITY: "New Stacks builders",
  });
  assert.equal(state.diversity.lastStrategyUsed, "Strategy 4: NFT artist community");
  assert.equal(state.postedThreads.urls[0], "https://x.com/example/status/1234567890");
  assert.deepEqual(state.interactionLedger.threadUrls, ["https://x.com/example/status/666"]);
  assert.equal(state.pendingImprovements.pendingItems.length, 2);
  assert.deepEqual(state.followedAccounts.handles, ["alreadyfollowed", "friendaccount"]);
  assert.deepEqual(state.warnings, []);
});

test("loadGovernanceState warns when optional governance files are missing", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xtrata-governance-"));

  try {
    for (const fileName of [
      "twitter-mode.md",
      "twitter-diversity-rules.md",
      "posted-threads-log.json",
      "follow_run_log.txt",
    ]) {
      await writeFile(
        path.join(tempDir, fileName),
        await readFile(path.join(fixtureDir, fileName), "utf8"),
        "utf8"
      );
    }

    const state = await loadGovernanceState({ baseDir: tempDir });

    assert.equal(state.pendingImprovements.items.length, 0);
    assert.deepEqual(state.followedAccounts.handles, []);
    assert.deepEqual(state.warnings, [
      "Optional governance file pending-improvements.md is missing.",
      "Optional governance file followed_accounts_log.txt is missing.",
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadGovernanceState can create a blank pending improvements file on demand", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xtrata-governance-"));

  try {
    for (const fileName of [
      "twitter-mode.md",
      "twitter-diversity-rules.md",
      "posted-threads-log.json",
      "follow_run_log.txt",
      "followed_accounts_log.txt",
    ]) {
      await writeFile(
        path.join(tempDir, fileName),
        await readFile(path.join(fixtureDir, fileName), "utf8"),
        "utf8"
      );
    }

    const state = await loadGovernanceState({
      baseDir: tempDir,
      createMissingPendingImprovements: true,
    });
    const created = await readFile(path.join(tempDir, "pending-improvements.md"), "utf8");

    assert.equal(state.pendingImprovements.items.length, 0);
    assert.equal(created, BLANK_PENDING_IMPROVEMENTS_MARKDOWN);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
