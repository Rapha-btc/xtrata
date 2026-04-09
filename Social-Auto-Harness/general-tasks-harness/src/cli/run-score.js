#!/usr/bin/env node

import { fileURLToPath } from "url";

import { runScoreStage } from "../lib/scoring.js";

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const dryRun = isDryRun();
  const result = await runScoreStage({
    runId: parseRunId(),
    dryRun,
  });

  console.log(`Score stage complete for ${result.run_id}`);
  console.log(`Model: ${result.summary.model}`);
  console.log(`Scored posts: ${result.summary.scored_posts}/${result.summary.input_posts}`);
  console.log(`Top posts: ${result.summary.top_posts}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Score stage failed:", error);
    process.exit(1);
  });
}
