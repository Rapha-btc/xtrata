#!/usr/bin/env node

import path from "path";

import { writeJson } from "../lib/fs.js";
import { loadConfig } from "../lib/config.js";
import { getStateSummary, recordRun, withDb } from "../lib/db.js";
import { runDraftStage } from "../lib/drafting.js";
import { runScoreStage } from "../lib/scoring.js";
import { runCollect } from "./run-collect.js";
import { runPrefilter } from "./run-prefilter.js";
import { getRunDir, getRunId, repoPath } from "../lib/paths.js";

const DRY_RUN = process.argv.includes("--dry-run");
const EMPTY_STATE_SUMMARY = {
  runs: 0,
  posts: 0,
  replies: 0,
  followed_accounts: 0,
};

function parseRunId() {
  const arg = process.argv.find((value) => value.startsWith("--run-id="));
  return arg ? arg.slice("--run-id=".length) : null;
}

async function main() {
  const runId = parseRunId() ?? getRunId();
  const runDir = getRunDir(runId);

  const collectSummary = await runCollect({ runId, dryRun: DRY_RUN });
  const prefilterSummary = await runPrefilter({
    runId,
    dryRun: DRY_RUN,
    rawPosts: collectSummary.raw_posts,
    rawAccounts: collectSummary.raw_accounts,
  });
  const scoreSummary = await runScoreStage({
    runId,
    dryRun: DRY_RUN,
    posts: prefilterSummary.filtered_posts,
  });
  const draftSummary = await runDraftStage({
    runId,
    dryRun: DRY_RUN,
    topPosts: scoreSummary.top_posts,
  });

  const config = await loadConfig();
  const nowIso = new Date().toISOString();
  const stateSummary = DRY_RUN
    ? withDb((db) => getStateSummary(db), { readOnly: true, fallback: EMPTY_STATE_SUMMARY })
    : withDb((db) => {
      recordRun(db, {
        id: runId,
        started_at: nowIso,
        finished_at: nowIso,
        mode: config.mode.current_mode,
        status: "completed",
        notes: "Completed OpenAI pipeline run.",
      });

      return getStateSummary(db);
    });

  const manifest = {
    run_id: runId,
    created_at: nowIso,
    dry_run: DRY_RUN,
    current_mode: config.mode.current_mode,
    manual_approval_required: config.mode.manual_approval_required,
    scoring_batch_limit: config.filters.max_posts_for_scoring,
    state_summary: stateSummary,
    collection_summary: {
      searches: collectSummary.collection_request.post_searches.length,
      follow_sources: collectSummary.collection_request.follow_sources.length,
      collected_posts: collectSummary.collected_posts,
      collected_accounts: collectSummary.collected_accounts,
      collection_source: collectSummary.collection_source,
    },
    prefilter_summary: {
      posts_kept: prefilterSummary.post_summary.kept_count,
      accounts_kept: prefilterSummary.account_summary.kept_count,
    },
    score_summary: {
      model: scoreSummary.summary.model,
      scored_posts: scoreSummary.summary.scored_posts,
      top_posts: scoreSummary.summary.top_posts,
    },
    draft_summary: {
      model: draftSummary.summary.model,
      drafts_created: draftSummary.summary.drafts_created,
    },
    prompt_files: [
      path.basename(repoPath("prompts", "score-posts.txt")),
      path.basename(repoPath("prompts", "draft-replies.txt")),
    ],
    next_steps: [
      "review drafts and populate approved-actions.json",
      "run execute once actions are approved",
    ],
  };

  if (!DRY_RUN) {
    await writeJson(path.join(runDir, "manifest.json"), manifest);
  }

  console.log(`OpenAI pipeline ready.`);
  console.log(`Run dir: ${runDir}`);
  console.log(`Mode: ${config.mode.current_mode}`);
  console.log(`Collection: ${collectSummary.collected_posts} posts, ${collectSummary.collected_accounts} accounts (${collectSummary.collection_source})`);
  console.log(`State: ${stateSummary.posts} posts, ${stateSummary.followed_accounts} followed accounts`);
  console.log(`Prefilter: ${prefilterSummary.post_summary.kept_count} posts, ${prefilterSummary.account_summary.kept_count} accounts`);
  console.log(`Score: ${scoreSummary.summary.scored_posts} scored, ${scoreSummary.summary.top_posts} top posts`);
  console.log(`Draft: ${draftSummary.summary.drafts_created} drafts`);
  console.log(`Dry run: ${DRY_RUN ? "yes (no files written)" : "no"}`);
}

main().catch((error) => {
  console.error("Pipeline run failed:", error);
  process.exit(1);
});
