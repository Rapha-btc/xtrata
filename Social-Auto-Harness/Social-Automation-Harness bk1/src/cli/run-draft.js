#!/usr/bin/env node

import { fileURLToPath } from "url";

import { runDraftStage } from "../lib/drafting.js";

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const dryRun = isDryRun();
  const result = await runDraftStage({
    runId: parseRunId(),
    dryRun,
  });

  console.log(`Draft stage complete for ${result.run_id}`);
  console.log(`Model: ${result.summary.model}`);
  console.log(`Drafts: ${result.summary.drafts_created}/${result.summary.input_top_posts}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Draft stage failed:", error);
    process.exit(1);
  });
}
