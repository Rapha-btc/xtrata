import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReplyLedgerEntry,
  recordManualReplyOutcome,
} from "../src/audit/replyHistory.js";

const draft = {
  draftIndex: 0,
  url: "https://x.com/example/status/123",
  replyText: "Interesting point. Permanent app data matters here.",
  target: {
    author: "@freshbuilder",
    recommendation: "prioritize",
    riskFlags: ["mode-fit"],
    text: "Source thread text.",
    draftBrief: "Mention permanence naturally.",
    searchQuery: "Bitcoin L2",
  },
  safetyChecks: ["under-280-chars"],
};

test("buildReplyLedgerEntry marks sent manual replies as operator-approved posts", () => {
  const entry = buildReplyLedgerEntry({
    persona: "xtrata",
    draft,
    status: "sent",
    observedState: {
      matchingReplyUrl: "https://x.com/XtrataLayers/status/999",
    },
    timestamp: "2026-04-02T12:00:00.000Z",
  });

  assert.equal(entry.actionType, "reply-posted");
  assert.equal(entry.status, "posted");
  assert.equal(entry.operatorApproved, true);
  assert.equal(entry.sourceQuery, "Bitcoin L2");
  assert.match(entry.riskFlags.join(","), /mode-fit/);
});

test("buildReplyLedgerEntry marks operator-declined drafts as skipped replies", () => {
  const entry = buildReplyLedgerEntry({
    persona: "xtrata",
    draft,
    status: "declined-by-operator",
    observedState: {
      matchingReplyUrl: null,
    },
    timestamp: "2026-04-02T12:00:00.000Z",
  });

  assert.equal(entry.actionType, "reply-skipped");
  assert.equal(entry.status, "skipped");
  assert.equal(entry.operatorApproved, false);
  assert.match(entry.reason, /closed the prepared reply without sending/i);
});

test("recordManualReplyOutcome writes sent replies to the ledger and posted thread log", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xtrata-reply-history-"));

  try {
    await writeFile(
      path.join(tempDir, "posted-threads-log.json"),
      JSON.stringify({ description: "test", threads: [] }, null, 2),
      "utf8"
    );

    const result = await recordManualReplyOutcome({
      baseDir: tempDir,
      persona: "xtrata",
      draft,
      status: "sent",
      observedState: {
        matchingReplyUrl: "https://x.com/XtrataLayers/status/999",
      },
      timestamp: "2026-04-02T12:00:00.000Z",
    });

    const ledgerText = await readFile(
      path.join(tempDir, "modular-harness", "state", "interaction-ledger.jsonl"),
      "utf8"
    );
    const postedThreads = JSON.parse(
      await readFile(path.join(tempDir, "posted-threads-log.json"), "utf8")
    );

    assert.match(result.ledgerPath, /interaction-ledger\.jsonl$/);
    assert.match(result.postedThreadsPath, /posted-threads-log\.json$/);
    assert.equal(ledgerText.trim().split("\n").length, 1);
    assert.equal(postedThreads.threads.length, 1);
    assert.equal(postedThreads.threads[0].our_reply_url, "https://x.com/XtrataLayers/status/999");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("recordManualReplyOutcome logs unconfirmed prepared drafts without mutating posted threads", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xtrata-reply-history-"));

  try {
    await writeFile(
      path.join(tempDir, "posted-threads-log.json"),
      JSON.stringify({ description: "test", threads: [] }, null, 2),
      "utf8"
    );

    const result = await recordManualReplyOutcome({
      baseDir: tempDir,
      persona: "xtrata",
      draft,
      status: "manual-action-not-confirmed",
      observedState: {
        matchingReplyUrl: null,
      },
      timestamp: "2026-04-02T12:00:00.000Z",
    });

    const ledgerText = await readFile(
      path.join(tempDir, "modular-harness", "state", "interaction-ledger.jsonl"),
      "utf8"
    );
    const postedThreads = JSON.parse(
      await readFile(path.join(tempDir, "posted-threads-log.json"), "utf8")
    );

    assert.equal(result.postedThreadsPath, null);
    assert.match(ledgerText, /reply-prepared/);
    assert.equal(postedThreads.threads.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
