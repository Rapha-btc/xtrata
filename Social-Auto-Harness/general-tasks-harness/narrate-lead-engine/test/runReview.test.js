import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildRunReview, loadRunArtifacts } from "../src/runReview.js";

test("buildRunReview recommends a tighter smoke-scope after invalid JSON failures", () => {
  const review = buildRunReview({
    job: {
      maxResultsPerQuery: 5,
      maxTotalQueries: 8,
      maxEnrichmentTasks: 4,
      maxDraftTasks: 4,
      sources: [
        {
          type: "gpt-web-search",
          label: "Web Search",
          enabled: true,
        },
      ],
    },
    manifest: {
      status: "failed",
      counts: { queriesPlanned: 1 },
    },
    error: {
      error: {
        message: "ChatGPT reply did not contain valid JSON. after 2 attempts.",
        context: {
          replyUrl: "https://chatgpt.com/c/failure",
        },
      },
    },
    debugEvents: [
      {
        kind: "progress",
        stage: "chatgpt-json",
        action: "failed",
        details: {},
      },
      {
        kind: "progress",
        stage: "lead-engine",
        action: "failed",
        details: {},
      },
    ],
    invalidReplies: [
      {
        kind: "invalid-json",
        label: "test-search",
        attempt: 2,
        replyUrl: "https://chatgpt.com/c/failure",
        metaFile: "/tmp/meta.json",
      },
    ],
  });

  assert.equal(review.failureKind, "chatgpt-invalid-json");
  assert.equal(review.lastStage, "chatgpt-json");
  assert.equal(review.rerunDecision, "manual-review-required");
  assert.deepEqual(review.suggestedJobPatch, {
    maxResultsPerQuery: 3,
    maxTotalQueries: 2,
    maxEnrichmentTasks: 1,
    maxDraftTasks: 1,
  });
  assert.equal(review.latestReplyUrl, "https://chatgpt.com/c/failure");
});

test("buildRunReview disables google-search sources after unusual-traffic failures", () => {
  const review = buildRunReview({
    job: {
      sources: [
        {
          type: "google-search",
          label: "Open Web",
          enabled: true,
        },
        {
          type: "gpt-web-search",
          label: "GPT Search",
          enabled: true,
        },
      ],
    },
    manifest: {
      status: "failed",
    },
    error: {
      error: {
        message: "Google presented an unusual-traffic page for query \"test\".",
      },
    },
  });

  assert.equal(review.failureKind, "google-unusual-traffic");
  assert.equal(review.rerunDecision, "safe-to-prepare");
  assert.deepEqual(review.suggestedSourceUpdates, [
    {
      label: "Open Web",
      changes: { enabled: false },
    },
  ]);
  assert.equal(review.suggestedJob.sources[0].enabled, false);
  assert.equal(review.suggestedJob.sources[1].enabled, true);
});

test("buildRunReview disables reply-thread reuse after stale repair retries", () => {
  const review = buildRunReview({
    job: {
      maxResultsPerQuery: 5,
      maxTotalQueries: 4,
      maxEnrichmentTasks: 4,
      maxDraftTasks: 4,
      chatgptReuseReplyThreadForRepairs: true,
      sources: [
        {
          type: "gpt-web-search",
          label: "Web Search",
          enabled: true,
        },
      ],
    },
    manifest: {
      status: "failed",
    },
    error: {
      error: {
        message: "ChatGPT repair attempt returned the previous reply again. after 2 attempts.",
      },
    },
  });

  assert.equal(review.failureKind, "chatgpt-stale-retry");
  assert.deepEqual(review.suggestedJobPatch, {
    maxResultsPerQuery: 3,
    maxTotalQueries: 2,
    maxEnrichmentTasks: 1,
    maxDraftTasks: 1,
    chatgptReuseReplyThreadForRepairs: false,
  });
  assert.equal(review.suggestedJob.chatgptReuseReplyThreadForRepairs, false);
});

test("loadRunArtifacts reads debug events and invalid reply metadata from a run directory", async () => {
  const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "narrate-run-review-"));
  const runDir = path.join(runsDir, "review-run");
  const invalidRepliesDir = path.join(runDir, "invalid-replies");

  await fs.mkdir(invalidRepliesDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify({
      status: "failed",
      counts: { queriesPlanned: 1 },
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "job.json"),
    `${JSON.stringify({
      maxResultsPerQuery: 5,
      maxTotalQueries: 4,
      maxEnrichmentTasks: 2,
      maxDraftTasks: 2,
      sources: [],
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "error.json"),
    `${JSON.stringify({
      error: {
        message: "ChatGPT reply did not contain valid JSON. after 2 attempts.",
      },
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "debug-events.jsonl"),
    `${JSON.stringify({
      kind: "progress",
      stage: "chatgpt-json",
      action: "failed",
      details: { attempt: 2 },
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(invalidRepliesDir, "001-invalid-json.meta.json"),
    `${JSON.stringify({
      kind: "invalid-json",
      attempt: 2,
      replyUrl: "https://chatgpt.com/c/review-run",
      metaFile: path.join(invalidRepliesDir, "001-invalid-json.meta.json"),
    })}\n`,
    "utf8"
  );

  const artifacts = await loadRunArtifacts({
    runId: "review-run",
    runsDir,
  });

  assert.equal(artifacts.debugEvents.length, 1);
  assert.equal(artifacts.invalidReplies.length, 1);
  assert.equal(artifacts.review.failureKind, "chatgpt-invalid-json");
  assert.equal(artifacts.review.latestReplyUrl, "https://chatgpt.com/c/review-run");
});
