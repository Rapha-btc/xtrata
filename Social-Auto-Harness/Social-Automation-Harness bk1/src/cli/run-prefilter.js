#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";

import { loadConfig } from "../lib/config.js";
import { withDb } from "../lib/db.js";
import { prefilterAccounts, prefilterPosts } from "../lib/filters.js";
import { readJsonIfExists, writeJson } from "../lib/fs.js";
import { normalizeAccounts, normalizePosts } from "../lib/normalization.js";
import { getRunDir, resolveRunId } from "../lib/paths.js";
import { buildStateSets, createEmptyStateSets } from "../lib/state-store.js";

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

export async function runPrefilter({
  runId = null,
  dryRun = false,
  rawPosts: rawPostsOverride = null,
  rawAccounts: rawAccountsOverride = null,
} = {}) {
  const resolvedRunId = await resolveRunId(runId);
  if (!resolvedRunId) {
    throw new Error("No run directory exists yet. Run collect or start the pipeline first.");
  }

  const config = await loadConfig();
  const runDir = getRunDir(resolvedRunId);
  const [rawPostsInput, rawAccountsInput] = await Promise.all([
    rawPostsOverride ?? readJsonIfExists(path.join(runDir, "raw-posts.json"), []),
    rawAccountsOverride ?? readJsonIfExists(path.join(runDir, "raw-accounts.json"), []),
  ]);

  const rawPosts = normalizePosts(Array.isArray(rawPostsInput) ? rawPostsInput : []);
  const rawAccounts = normalizeAccounts(Array.isArray(rawAccountsInput) ? rawAccountsInput : []);

  const priorityAccounts = new Set(
    config.accounts.priority_accounts.map((handle) => handle.toLowerCase())
  );
  const disabledAccounts = new Set(
    config.accounts.disabled_accounts.map((handle) => handle.toLowerCase())
  );
  const stateSets = withDb(
    (db) => buildStateSets(db, config.filters),
    { readOnly: dryRun, fallback: createEmptyStateSets() }
  );

  const postResult = prefilterPosts(rawPosts, {
    filters: config.filters,
    priorityAccounts,
    disabledAccounts,
    stateSets,
    themes: config.keywords.themes,
  });

  const accountResult = prefilterAccounts(rawAccounts, {
    filters: config.filters,
    disabledAccounts,
    stateSets,
  });

  const summary = {
    run_id: resolvedRunId,
    created_at: new Date().toISOString(),
    post_summary: postResult.summary,
    account_summary: accountResult.summary,
    state_snapshot: {
      cooldown_authors: stateSets.cooldownAuthors.size,
      replied_post_urls: stateSets.repliedPostUrls.size,
      followed_handles: stateSets.followedHandles.size,
    },
  };

  if (!dryRun) {
    await Promise.all([
      writeJson(path.join(runDir, "filtered-posts.json"), postResult.filtered),
      writeJson(path.join(runDir, "filtered-accounts.json"), accountResult.filtered),
      writeJson(path.join(runDir, "prefilter-summary.json"), summary),
    ]);
  }

  return {
    run_id: resolvedRunId,
    run_dir: runDir,
    filtered_posts: postResult.filtered,
    filtered_accounts: accountResult.filtered,
    ...summary,
  };
}

async function main() {
  const result = await runPrefilter({ runId: parseRunId(), dryRun: isDryRun() });

  console.log(`Prefilter complete for ${result.run_id}`);
  console.log(`Posts kept: ${result.post_summary.kept_count}/${result.post_summary.input_count}`);
  console.log(`Accounts kept: ${result.account_summary.kept_count}/${result.account_summary.input_count}`);
  console.log(`Dry run: ${isDryRun() ? "yes" : "no"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Prefilter stage failed:", error);
    process.exit(1);
  });
}
