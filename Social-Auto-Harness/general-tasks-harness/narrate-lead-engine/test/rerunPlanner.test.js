import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJson } from "../src/lib/fs.js";
import { buildPreparedRerunPlan, prepareRerun } from "../src/rerunPlanner.js";

async function createFailedRunFixture() {
  const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "narrate-rerun-plan-"));
  const runDir = path.join(runsDir, "failed-run");
  const invalidRepliesDir = path.join(runDir, "invalid-replies");

  await fs.mkdir(invalidRepliesDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify({
      runId: "failed-run",
      status: "failed",
      counts: { queriesPlanned: 1, collected: 0, normalized: 0, leads: 0, drafted: 0 },
      artifacts: {
        job: path.join(runDir, "job.json"),
        error: path.join(runDir, "error.json"),
        debugLog: path.join(runDir, "debug-log.md"),
        debugEvents: path.join(runDir, "debug-events.jsonl"),
        invalidRepliesDir,
      },
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "job.json"),
    `${JSON.stringify({
      name: "Narrate Safe Smoke Test",
      objective: "Recover from a failed smoke run.",
      maxResultsPerQuery: 5,
      maxTotalQueries: 4,
      maxCollectedItems: 10,
      maxEnrichmentTasks: 4,
      maxDraftTasks: 4,
      sources: [
        {
          type: "gpt-web-search",
          label: "Web Search",
          families: ["cost-pain"],
          maxQueries: 1,
          enabled: true,
        },
      ],
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "error.json"),
    `${JSON.stringify({
      error: {
        message: "ChatGPT reply did not contain valid JSON. after 2 attempts.",
        context: {
          replyUrl: "https://chatgpt.com/c/fixture",
        },
      },
    })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "debug-log.md"),
    "# Debug Log\n",
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
      label: "fixture-search",
      attempt: 2,
      replyUrl: "https://chatgpt.com/c/fixture",
      rawReplyFile: path.join(invalidRepliesDir, "001-invalid-json.raw.txt"),
      promptFile: path.join(invalidRepliesDir, "001-invalid-json.prompt.txt"),
      metaFile: path.join(invalidRepliesDir, "001-invalid-json.meta.json"),
    })}\n`,
    "utf8"
  );

  return { runsDir, runDir };
}

test("buildPreparedRerunPlan blocks successful runs", () => {
  assert.throws(
    () =>
      buildPreparedRerunPlan({
        artifacts: {
          runId: "completed-run",
          runDir: "/tmp/completed-run",
          job: { name: "Done" },
          review: { rerunDecision: "not-needed" },
          manifest: { status: "completed" },
        },
        preparedJobPath: "/tmp/job.json",
        preparedPlanPath: "/tmp/plan.json",
      }),
    /No rerun plan is needed/
  );
});

test("prepareRerun writes a prepared job and plan without executing the run", async () => {
  const { runsDir, runDir } = await createFailedRunFixture();

  const result = await prepareRerun({
    runId: "failed-run",
    runsDir,
  });

  const preparedJob = await readJson(result.preparedJobPath);
  const preparedPlan = await readJson(result.preparedPlanPath);

  assert.equal(result.runDir, runDir);
  assert.match(preparedJob.name, /\(Prepared rerun from failed-run\)$/);
  assert.equal(preparedJob.maxResultsPerQuery, 3);
  assert.equal(preparedJob.maxTotalQueries, 2);
  assert.equal(preparedJob.maxEnrichmentTasks, 1);
  assert.equal(preparedPlan.executionStatus, "prepared-not-run");
  assert.equal(preparedPlan.approvalRequired, true);
  assert.equal(preparedPlan.requiresArtifactReview, true);
  assert.match(preparedPlan.recommendedCommand, /npm run run-job/);
  assert.equal(preparedPlan.outputs.preparedJobPath, path.join(runDir, "prepared-rerun-job.json"));
});

test("prepareRerun refuses to overwrite an existing prepared job unless requested", async () => {
  const { runsDir, runDir } = await createFailedRunFixture();
  const outputJobPath = path.join(runDir, "custom-rerun-job.json");
  const outputPlanPath = path.join(runDir, "custom-rerun-plan.json");

  await fs.writeFile(outputJobPath, "{}\n", "utf8");

  await assert.rejects(
    () =>
      prepareRerun({
        runId: "failed-run",
        runsDir,
        outputJobPath,
        outputPlanPath,
      }),
    /Refusing to overwrite existing file/
  );

  const result = await prepareRerun({
    runId: "failed-run",
    runsDir,
    outputJobPath,
    outputPlanPath,
    overwrite: true,
  });

  assert.equal(result.preparedJobPath, outputJobPath);
  assert.equal(result.preparedPlanPath, outputPlanPath);
});
