import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runExecuteApproved } from "../src/cli/run-execute-approved.js";
import { getRunDir } from "../src/lib/paths.js";
import { uniqueRunId } from "../testing/helpers.js";

async function writeApprovals(runId, approvals) {
  const runDir = getRunDir(runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "approved-actions.json"),
    JSON.stringify(approvals, null, 2),
    "utf8"
  );
  return runDir;
}

test("runExecuteApproved dry-run builds counts without writing execution-request.json", async (t) => {
  const runId = uniqueRunId("execute-dry");
  const runDir = await writeApprovals(runId, {
    manual_approval_required: false,
    actions: {
      likes: [{ post_url: "https://x.com/example/status/1" }],
      replies: [{ post_id: "demo-1", reply: "Useful context" }],
    },
  });

  t.after(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  const result = await runExecuteApproved({ runId, dryRun: true });

  assert.equal(result.execution_request.manual_approval_required, false);
  assert.deepEqual(result.execution_request.counts, {
    likes: 1,
    follows: 0,
    replies: 1,
    quote_posts: 0,
    tweets: 0,
  });

  await assert.rejects(
    () => fs.access(path.join(runDir, "execution-request.json")),
    /ENOENT/
  );
});

test("runExecuteApproved writes execution-request.json in normal mode", async (t) => {
  const runId = uniqueRunId("execute-write");
  const runDir = await writeApprovals(runId, {
    actions: {
      follows: [{ handle: "builderbtc" }],
      tweets: [{ text: "Durable media matters." }],
    },
  });

  t.after(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  const result = await runExecuteApproved({ runId, dryRun: false });
  const written = JSON.parse(
    await fs.readFile(path.join(runDir, "execution-request.json"), "utf8")
  );

  assert.equal(result.execution_request.manual_approval_required, true);
  assert.deepEqual(result.execution_request.counts, {
    likes: 0,
    follows: 1,
    replies: 0,
    quote_posts: 0,
    tweets: 1,
  });
  assert.deepEqual(written.actions, result.execution_request.actions);
  assert.deepEqual(written.counts, result.execution_request.counts);
});

test("runExecuteApproved fails fast on malformed approved-actions.json", async (t) => {
  const runId = uniqueRunId("execute-invalid");
  const runDir = getRunDir(runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "approved-actions.json"), "{", "utf8");
  t.after(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  await assert.rejects(() => runExecuteApproved({ runId, dryRun: true }), SyntaxError);
});
