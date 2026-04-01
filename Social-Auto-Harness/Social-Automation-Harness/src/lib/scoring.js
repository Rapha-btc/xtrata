import path from "path";

import { loadConfig } from "./config.js";
import { replacePostScores, upsertPosts, withDb } from "./db.js";
import { readJsonIfExists, readText, writeJson } from "./fs.js";
import { createStructuredResponse } from "./openai.js";
import { getRunDir, PROMPTS_DIR, resolveRunId } from "./paths.js";

const SCORE_MODEL = process.env.OPENAI_SCORE_MODEL || "gpt-4o-mini";

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          post_id: { type: "string" },
          relevance: { type: "integer", minimum: 0, maximum: 5 },
          engagement_opportunity: { type: "integer", minimum: 0, maximum: 5 },
          reply_confidence: { type: "integer", minimum: 0, maximum: 5 },
          category: {
            type: "string",
            enum: ["art", "infrastructure", "nft", "permanence", "ordinals", "stacks", "creator-economy", "other"],
          },
          suggested_angle: { type: "string" },
          action: {
            type: "string",
            enum: ["ignore", "monitor", "like", "draft"],
          },
        },
        required: [
          "post_id",
          "relevance",
          "engagement_opportunity",
          "reply_confidence",
          "category",
          "suggested_angle",
          "action",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
};

function compactPosts(posts) {
  return posts.map((post) => ({
    post_id: post.post_id,
    author: post.author_handle,
    text: post.text,
    timestamp: post.posted_at,
    stats: post.stats,
    why_matched: post.match_reason ?? post.source_value ?? post.source_type,
  }));
}

function inferCategory(text) {
  const lower = text.toLowerCase();
  if (/(ordinals|brc-20|bitcoin nft)/.test(lower)) return "ordinals";
  if (/(permanence|permanent|link rot|ipfs|metadata)/.test(lower)) return "permanence";
  if (/(artist|art|generative|music|audio)/.test(lower)) return "art";
  if (/(creator|royalties|ownership|collectors)/.test(lower)) return "creator-economy";
  if (/(nft|mint|minting|collection)/.test(lower)) return "nft";
  if (/(stacks|stx|sbtc)/.test(lower)) return "stacks";
  if (/(infra|indexer|api|builder|tool|composable)/.test(lower)) return "infrastructure";
  return "other";
}

function heuristicScore(post, config) {
  const lower = post.text.toLowerCase();
  const themeHits = config.keywords.themes.filter((theme) => lower.includes(theme.toLowerCase())).length;
  const stats = post.stats ?? {};
  const engagement = (stats.like_count ?? 0) + (stats.reply_count ?? 0) + (stats.repost_count ?? 0);
  const author = post.author_handle?.toLowerCase() ?? "";
  const priority = config.accounts.priority_accounts.some((handle) => handle.toLowerCase() === author);
  const category = inferCategory(post.text);

  let relevance = Math.min(5, themeHits + (priority ? 2 : 0) + (category !== "other" ? 1 : 0));
  if (!relevance && /(bitcoin|stacks|onchain|on-chain)/.test(lower)) relevance = 2;

  let engagementOpportunity = 1;
  if (engagement > 20) engagementOpportunity = 4;
  else if (engagement > 5) engagementOpportunity = 3;
  else if (engagement > 0) engagementOpportunity = 2;
  if (priority && engagementOpportunity < 3) engagementOpportunity = 3;

  let replyConfidence = Math.min(
    5,
    relevance +
    (engagement > 5 ? 1 : 0) +
    (category !== "other" ? 1 : 0) +
    (priority ? 1 : 0)
  );
  if (/(gm|gn|great project|giveaway|airdrop|price prediction)/.test(lower)) {
    replyConfidence = Math.max(0, replyConfidence - 2);
  }
  if (post.text.length < 80) {
    replyConfidence = Math.max(0, replyConfidence - 1);
  }

  const total = relevance * 3 + engagementOpportunity * 2 + replyConfidence * 3;
  let action = "ignore";
  if (total >= 20) action = "draft";
  else if (total >= 16) action = "like";
  else if (total >= 10) action = "monitor";

  const suggestedAngle = (() => {
    switch (category) {
      case "permanence": return "contrast permanence with link rot";
      case "art": return "connect art to durable onchain media";
      case "nft": return "tie minting to permanence and ownership";
      case "ordinals": return "bridge ordinals and Stacks permanence";
      case "stacks": return "add Xtrata as useful Stacks infrastructure";
      case "creator-economy": return "speak to creator ownership and durability";
      case "infrastructure": return "position permanent data as builder primitive";
      default: return "add useful permanence context";
    }
  })();

  return {
    post_id: post.post_id,
    relevance,
    engagement_opportunity: engagementOpportunity,
    reply_confidence: replyConfidence,
    category,
    suggested_angle: suggestedAngle,
    action,
  };
}

function rankScore(item) {
  return item.relevance * 3 + item.engagement_opportunity * 2 + item.reply_confidence * 3;
}

function buildTopPosts(posts, scores, replyTarget) {
  const scoreById = new Map(scores.map((score) => [score.post_id, score]));

  return posts
    .map((post) => ({ ...post, score: scoreById.get(post.post_id) }))
    .filter((post) => post.score)
    .sort((a, b) => rankScore(b.score) - rankScore(a.score))
    .filter((post) => post.score.action === "draft" || post.score.reply_confidence >= 3)
    .slice(0, replyTarget);
}

function summarizeScores(scores) {
  const byAction = {};
  const byCategory = {};

  for (const score of scores) {
    byAction[score.action] = (byAction[score.action] ?? 0) + 1;
    byCategory[score.category] = (byCategory[score.category] ?? 0) + 1;
  }

  return { by_action: byAction, by_category: byCategory };
}

async function scoreWithOpenAI(posts, config) {
  const promptTemplate = await readText(path.join(PROMPTS_DIR, "score-posts.txt"));
  const mode = config.mode.current_mode;
  const promoSubject = config.mode.active_campaign.promo_subject;
  const user = [
    `Mode: ${mode}`,
    promoSubject ? `Active campaign: ${promoSubject}` : null,
    `Priority themes: ${config.keywords.themes.join(", ")}`,
    `Posts: ${JSON.stringify(compactPosts(posts))}`,
  ].filter(Boolean).join("\n\n");

  const response = await createStructuredResponse({
    model: SCORE_MODEL,
    system: promptTemplate,
    user,
    schemaName: "xtrata_post_scores",
    schema: SCORE_SCHEMA,
  });

  return {
    scores: response.data.scores,
    model: response.model,
    usage: response.usage,
  };
}

export async function runScoreStage({ runId = null, dryRun = false, posts: postsOverride = null } = {}) {
  const resolvedRunId = await resolveRunId(runId);
  if (!resolvedRunId) {
    throw new Error("No run directory exists yet. Run collect or run first.");
  }

  const config = await loadConfig();
  const runDir = getRunDir(resolvedRunId);
  const postsInput = postsOverride ?? await readJsonIfExists(path.join(runDir, "filtered-posts.json"), []);
  const safePosts = Array.isArray(postsInput) ? postsInput : [];
  const modeProfile = config.mode.mode_profiles[config.mode.current_mode] ?? config.mode.mode_profiles["general-promotional"];

  let scores = [];
  let model = "heuristic-dry-run";
  let usage = null;

  if (safePosts.length > 0) {
    if (dryRun) {
      scores = safePosts.map((post) => heuristicScore(post, config));
    } else {
      const response = await scoreWithOpenAI(safePosts, config);
      scores = response.scores;
      model = response.model;
      usage = response.usage;
    }
  }

  const topPosts = buildTopPosts(safePosts, scores, modeProfile.reply_target ?? 3);
  const summary = {
    run_id: resolvedRunId,
    created_at: new Date().toISOString(),
    model,
    dry_run: dryRun,
    input_posts: safePosts.length,
    scored_posts: scores.length,
    top_posts: topPosts.length,
    usage,
    ...summarizeScores(scores),
  };

  if (!dryRun) {
    await Promise.all([
      writeJson(path.join(runDir, "scored-posts.json"), scores),
      writeJson(path.join(runDir, "top-posts.json"), topPosts),
      writeJson(path.join(runDir, "score-summary.json"), summary),
    ]);

    withDb((db) => {
      upsertPosts(db, safePosts, { sourceType: "filtered-posts", sourceValue: resolvedRunId });
      replacePostScores(db, resolvedRunId, scores, model);
    });
  }

  return {
    run_id: resolvedRunId,
    run_dir: runDir,
    summary,
    scores,
    top_posts: topPosts,
  };
}
