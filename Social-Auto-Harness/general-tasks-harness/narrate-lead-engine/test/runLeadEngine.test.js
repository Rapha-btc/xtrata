import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJson, readText } from "../src/lib/fs.js";
import { runLeadEngine } from "../src/runLeadEngine.js";

async function createTempJobFile() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "narrate-run-lead-engine-"));
  const jobFilePath = path.join(tempDir, "job.json");

  await fs.writeFile(
    jobFilePath,
    `${JSON.stringify(
      {
        name: "Test Job",
        objective: "Test the artifact contract.",
        queryFamilies: ["cost-pain"],
        maxResultsPerQuery: 5,
        maxTotalQueries: 4,
        maxCollectedItems: 10,
        maxEnrichmentTasks: 4,
        maxDraftTasks: 4,
        queryPauseMs: 1,
        stagePauseMs: 1,
        sources: [
          {
            type: "gpt-web-search",
            label: "Test Web Search",
            families: ["cost-pain"],
            maxQueries: 1,
          },
        ],
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { tempDir, jobFilePath };
}

test("runLeadEngine honors runsDir and writes a complete debug log", async () => {
  const { tempDir, jobFilePath } = await createTempJobFile();
  const runsDir = path.join(tempDir, "runs");
  let capturedReplyReuse = null;

  const result = await runLeadEngine({
    jobFilePath,
    runId: "success-run",
    runsDir,
    writeFiles: true,
    persistToDb: false,
    progressToConsole: false,
    adapter: {
      async wait() {},
    },
    resolveBrowserPersonaFn: async () => null,
    collectLeadSourcesFn: async ({ reuseReplyThreadForRepairs }) => {
      capturedReplyReuse = reuseReplyThreadForRepairs;
      return {
        collections: [],
        collectedCount: 0,
      };
    },
    now: new Date("2026-04-13T12:15:00.000Z"),
  });

  assert.equal(result.runDir, path.join(runsDir, "success-run"));
  assert.equal(capturedReplyReuse, true);

  const debugLog = await readText(path.join(result.runDir, "debug-log.md"));
  const manifest = await readJson(path.join(result.runDir, "manifest.json"));

  assert.match(debugLog, /\[progress\] lead-engine:complete/);
  assert.equal(manifest.artifacts.debugEvents, path.join(result.runDir, "debug-events.jsonl"));
  assert.equal(manifest.artifacts.invalidRepliesDir, path.join(result.runDir, "invalid-replies"));
});

test("runLeadEngine persists rich failure context to error.json", async () => {
  const { tempDir, jobFilePath } = await createTempJobFile();
  const runsDir = path.join(tempDir, "runs");

  await assert.rejects(
    () =>
      runLeadEngine({
        jobFilePath,
        runId: "failure-run",
        runsDir,
        writeFiles: true,
        persistToDb: false,
        progressToConsole: false,
        adapter: {
          async wait() {},
        },
        resolveBrowserPersonaFn: async () => null,
        collectLeadSourcesFn: async ({ onInvalidReply }) => {
          await onInvalidReply({
            kind: "invalid-json",
            label: "test-search",
            attempt: 2,
            rawReplyText: "not-json",
            dispatchedPrompt: "repair-prompt",
            replyUrl: "https://chatgpt.com/c/test-run",
          });

          const error = new Error("ChatGPT reply did not contain valid JSON. after 2 attempts.");
          error.rawReplyText = "not-json";
          error.dispatchedPrompt = "repair-prompt";
          error.replyState = { url: "https://chatgpt.com/c/test-run" };
          error.session = { action: "opened-new-tab" };
          throw error;
        },
        now: new Date("2026-04-13T12:20:00.000Z"),
      }),
    /did not contain valid JSON/
  );

  const errorPayload = await readJson(path.join(runsDir, "failure-run", "error.json"));

  assert.equal(errorPayload.error.context.replyUrl, "https://chatgpt.com/c/test-run");
  assert.equal(errorPayload.error.context.sessionAction, "opened-new-tab");
  assert.equal(errorPayload.error.context.rawReplyText, "not-json");
  assert.equal(errorPayload.error.context.dispatchedPrompt, "repair-prompt");
  assert.match(errorPayload.error.context.invalidReplyArtifact.metaFile, /001-invalid-json\.meta\.json$/);
});
