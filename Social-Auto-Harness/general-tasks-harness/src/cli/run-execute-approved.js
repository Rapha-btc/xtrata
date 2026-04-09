#!/usr/bin/env node

import { fileURLToPath } from "url";
import path from "path";

import { readJson, writeJson } from "../lib/fs.js";
import { getRunDir, resolveRunId } from "../lib/paths.js";

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

export async function runExecuteApproved({ runId = null, dryRun = false } = {}) {
  const resolvedRunId = await resolveRunId(runId);
  if (!resolvedRunId) {
    throw new Error("No run directory exists yet. Run collect or run first.");
  }

  const runDir = getRunDir(resolvedRunId);
  const approvals = await readJson(path.join(runDir, "approved-actions.json"));
  const defaultActions = {
    likes: [],
    follows: [],
    replies: [],
    quote_posts: [],
    tweets: [],
  };
  const actions = {
    ...defaultActions,
    ...(approvals.actions ?? {}),
  };

  const executionRequest = {
    run_id: resolvedRunId,
    created_at: new Date().toISOString(),
    manual_approval_required: approvals.manual_approval_required ?? true,
    actions,
    counts: Object.fromEntries(
      Object.entries(actions).map(([key, values]) => [key, Array.isArray(values) ? values.length : 0])
    ),
  };

  if (!dryRun) {
    await writeJson(path.join(runDir, "execution-request.json"), executionRequest);
  }

  return {
    run_id: resolvedRunId,
    run_dir: runDir,
    execution_request: executionRequest,
  };
}

async function main() {
  const result = await runExecuteApproved({ runId: parseRunId(), dryRun: isDryRun() });
  const totalActions = Object.values(result.execution_request.counts).reduce((sum, count) => sum + count, 0);

  console.log(`Execution request prepared for ${result.run_id}`);
  console.log(`Run dir: ${result.run_dir}`);
  console.log(`Approved actions: ${totalActions}`);
  console.log(`Dry run: ${isDryRun() ? "yes" : "no"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Execute stage failed:", error);
    process.exit(1);
  });
}
