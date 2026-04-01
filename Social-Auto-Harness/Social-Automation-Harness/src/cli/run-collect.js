#!/usr/bin/env node

import { fileURLToPath } from "url";

import { prepareCollectionArtifacts } from "../lib/extension-bridge.js";
import { ensureDir, ensureProjectDirs, getRunDir, getRunId } from "../lib/paths.js";

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

export async function runCollect({ runId = null, dryRun = false } = {}) {
  const resolvedRunId = runId ?? getRunId();

  if (!dryRun) {
    await ensureProjectDirs();
    await ensureDir(getRunDir(resolvedRunId));
  }

  return prepareCollectionArtifacts(resolvedRunId, { dryRun });
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

async function main() {
  const summary = await runCollect({ runId: parseRunId(), dryRun: isDryRun() });

  console.log(`Collection artifacts prepared for ${summary.run_id}`);
  console.log(`Run dir: ${summary.run_dir}`);
  console.log(`Searches: ${summary.collection_request.post_searches.length}`);
  console.log(`Follow sources: ${summary.collection_request.follow_sources.length}`);
  console.log(`Collected input: ${summary.collected_posts} posts, ${summary.collected_accounts} accounts`);
  console.log(`Collection source: ${summary.collection_source}`);
  console.log(`Dry run: ${isDryRun() ? "yes" : "no"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Collect stage failed:", error);
    process.exit(1);
  });
}
