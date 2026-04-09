import path from "path";

import { loadConfig } from "./config.js";
import { readJsonIfExists, writeJson } from "./fs.js";
import { normalizeAccounts, normalizePosts } from "./normalization.js";
import { getRunDir } from "./paths.js";

function pickStrategyIds(mode) {
  switch (mode) {
    case "promotional-specific":
      return [4, 5, 1, 6, 7];
    case "engagement-general":
    case "engagement-specific":
      return [1, 5, 6, 7, 4];
    case "discovery":
      return [1, 2, 3, 4, 5, 6, 7, 8];
    case "collection-launch":
      return [4, 1, 5, 6];
    default:
      return [1, 4, 5, 6, 7];
  }
}

function rankSourceQuality(quality = "") {
  if (/^HIGH/i.test(quality)) return 0;
  if (/^MEDIUM/i.test(quality)) return 1;
  return 2;
}

function buildCollectionRequest(config, runId) {
  const mode = config.mode.current_mode;
  const profile = config.mode.mode_profiles[mode] ?? config.mode.mode_profiles["general-promotional"];
  const preferred = new Map(
    config.filters.preferred_source_order.map((handle, index) => [handle.toLowerCase(), index])
  );
  const enabledSources = config.sources.follow_sources
    .filter((source) => source.enabled)
    .sort((a, b) => {
      const preferredA = preferred.get(a.handle.toLowerCase());
      const preferredB = preferred.get(b.handle.toLowerCase());

      if (preferredA !== undefined || preferredB !== undefined) {
        return (preferredA ?? Number.MAX_SAFE_INTEGER) - (preferredB ?? Number.MAX_SAFE_INTEGER);
      }

      return rankSourceQuality(a.quality) - rankSourceQuality(b.quality);
    });

  const selectedStrategyIds = new Set(pickStrategyIds(mode));
  const postSearches = config.sources.search_strategies
    .filter((strategy) => selectedStrategyIds.has(strategy.id))
    .map((strategy) => strategy.query)
    .slice(0, 5);

  return {
    run_id: runId,
    requested_at: new Date().toISOString(),
    mode,
    post_searches: postSearches,
    follow_sources: enabledSources.slice(0, 5).map((source) => source.handle),
    limits: {
      max_posts_total: 100,
      max_accounts_total: Math.max((profile.follow_target ?? 15) * 4, 40),
      max_posts_per_search: 20,
    },
    desired_outputs: {
      collection_results_file: "collection-results.json",
      execution_results_file: "execution-results.json",
    },
  };
}

function buildApprovedActionsTemplate(runId, config) {
  return {
    run_id: runId,
    created_at: new Date().toISOString(),
    manual_approval_required: config.mode.manual_approval_required,
    actions: {
      likes: [],
      follows: [],
      replies: [],
      quote_posts: [],
      tweets: [],
    },
  };
}

async function loadRunInputs(runDir) {
  const collectionResults = await readJsonIfExists(path.join(runDir, "collection-results.json"), null);
  if (collectionResults) {
    const posts = Array.isArray(collectionResults)
      ? collectionResults
      : (collectionResults.posts ?? collectionResults.raw_posts ?? []);
    const accounts = Array.isArray(collectionResults)
      ? []
      : (collectionResults.accounts ?? collectionResults.raw_accounts ?? []);

    return {
      rawPosts: normalizePosts(posts),
      rawAccounts: normalizeAccounts(accounts),
      collection_source: "collection-results.json",
    };
  }

  const [rawPostsInput, rawAccountsInput] = await Promise.all([
    readJsonIfExists(path.join(runDir, "raw-posts.json"), []),
    readJsonIfExists(path.join(runDir, "raw-accounts.json"), []),
  ]);

  const rawPosts = normalizePosts(Array.isArray(rawPostsInput) ? rawPostsInput : []);
  const rawAccounts = normalizeAccounts(Array.isArray(rawAccountsInput) ? rawAccountsInput : []);

  return {
    rawPosts,
    rawAccounts,
    collection_source: rawPosts.length > 0 || rawAccounts.length > 0 ? "run-artifacts" : "none",
  };
}

export async function prepareCollectionArtifacts(runId, { dryRun = false } = {}) {
  const config = await loadConfig();
  const runDir = getRunDir(runId);
  const collectionRequest = buildCollectionRequest(config, runId);
  const approvedActions = buildApprovedActionsTemplate(runId, config);
  const { rawPosts, rawAccounts, collection_source } = await loadRunInputs(runDir);

  if (!dryRun) {
    await Promise.all([
      writeJson(path.join(runDir, "collection-request.json"), collectionRequest),
      writeJson(path.join(runDir, "approved-actions.json"), approvedActions),
      writeJson(path.join(runDir, "raw-posts.json"), rawPosts),
      writeJson(path.join(runDir, "raw-accounts.json"), rawAccounts),
    ]);
  }

  return {
    run_id: runId,
    run_dir: runDir,
    collection_request: collectionRequest,
    approved_actions_template: approvedActions,
    raw_posts: rawPosts,
    raw_accounts: rawAccounts,
    collected_posts: rawPosts.length,
    collected_accounts: rawAccounts.length,
    collection_source,
  };
}
