import path from "path";

import { loadConfig } from "./config.js";
import { replaceReplyDrafts, withDb } from "./db.js";
import { readJsonIfExists, readText, writeJson } from "./fs.js";
import { createStructuredResponse } from "./openai.js";
import { getRunDir, PROMPTS_DIR, resolveRunId } from "./paths.js";

const DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL || "gpt-4o-mini";

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          post_id: { type: "string" },
          reply: { type: "string" },
          quote_post: { type: "string" },
        },
        required: ["post_id", "reply", "quote_post"],
        additionalProperties: false,
      },
    },
  },
  required: ["drafts"],
  additionalProperties: false,
};

function limitLength(text, max = 220) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function inferReply(post, config) {
  const lower = post.text.toLowerCase();
  const angle = post.score?.suggested_angle ?? "add useful permanence context";
  const category = post.score?.category ?? "other";
  const promo = config.mode.active_campaign.promo_subject;

  let reply;
  if (category === "permanence" && /(art|artist|generative|media)/.test(lower)) {
    reply = "That durability angle is the important part. Onchain art only really feels finished when the media itself can outlast the app layer around it.";
  } else if (category === "permanence" && /(sbtc|bitcoin-native apps|apps)/.test(lower)) {
    reply = "That feels right. Durable onchain data really does look like a missing primitive for Bitcoin-native apps.";
  } else if (category === "permanence") {
    reply = "That durability point matters more than people admit. If the media or metadata can vanish, the work is still fragile.";
  } else if (category === "art") {
    reply = "That hits harder when the media itself is durable. Onchain art gets much more interesting when the work can actually outlast the app layer around it.";
  } else if (category === "stacks") {
    reply = "That feels directionally right. Bitcoin-native apps get more compelling when permanent data is treated as infrastructure rather than an afterthought.";
  } else {
    reply = `The useful angle here is probably to ${angle}.`;
  }

  if (promo && category !== "other" && !/xtrata/i.test(reply)) {
    reply += " That's why Xtrata's angle on Stacks is interesting.";
  }

  return limitLength(reply.replace(/\s+/g, " ").trim());
}

function inferQuotePost(post) {
  const category = post.score?.category ?? "other";
  if (category === "permanence") {
    return "Durability is still the underrated part of onchain media.";
  }
  if (category === "art") {
    return "Onchain art gets much more interesting when the media is actually durable.";
  }
  if (category === "stacks") {
    return "Permanent data feels like a missing primitive for Bitcoin-native apps.";
  }
  return "";
}

async function draftWithOpenAI(posts, config) {
  const promptTemplate = await readText(path.join(PROMPTS_DIR, "draft-replies.txt"));
  const promoSubject = config.mode.active_campaign.promo_subject;
  const tone = JSON.stringify(config.tone);
  const compact = posts.map((post) => ({
    post_id: post.post_id,
    author: post.author_handle,
    text: post.text,
    suggested_angle: post.score?.suggested_angle ?? "",
    category: post.score?.category ?? "",
  }));

  const user = [
    promoSubject ? `Active campaign: ${promoSubject}` : null,
    `Tone config: ${tone}`,
    `Posts: ${JSON.stringify(compact)}`,
  ].filter(Boolean).join("\n\n");

  const response = await createStructuredResponse({
    model: DRAFT_MODEL,
    system: promptTemplate,
    user,
    schemaName: "xtrata_reply_drafts",
    schema: DRAFT_SCHEMA,
  });

  return {
    drafts: response.data.drafts.map((draft) => ({
      post_id: draft.post_id,
      reply: limitLength(draft.reply),
      quote_post: limitLength(draft.quote_post, 220),
    })),
    model: response.model,
    usage: response.usage,
  };
}

export async function runDraftStage({ runId = null, dryRun = false, topPosts: topPostsOverride = null } = {}) {
  const resolvedRunId = await resolveRunId(runId);
  if (!resolvedRunId) {
    throw new Error("No run directory exists yet. Run collect or run first.");
  }

  const config = await loadConfig();
  const runDir = getRunDir(resolvedRunId);
  const topPostsInput = topPostsOverride ?? await readJsonIfExists(path.join(runDir, "top-posts.json"), []);
  const safeTopPosts = Array.isArray(topPostsInput) ? topPostsInput : [];

  let drafts = [];
  let model = "heuristic-dry-run";
  let usage = null;

  if (safeTopPosts.length > 0) {
    if (dryRun) {
      drafts = safeTopPosts.map((post) => ({
        post_id: post.post_id,
        reply: inferReply(post, config),
        quote_post: inferQuotePost(post),
      }));
    } else {
      const response = await draftWithOpenAI(safeTopPosts, config);
      drafts = response.drafts;
      model = response.model;
      usage = response.usage;
    }
  }

  const summary = {
    run_id: resolvedRunId,
    created_at: new Date().toISOString(),
    model,
    dry_run: dryRun,
    input_top_posts: safeTopPosts.length,
    drafts_created: drafts.length,
    usage,
  };

  if (!dryRun) {
    await Promise.all([
      writeJson(path.join(runDir, "drafts.json"), drafts),
      writeJson(path.join(runDir, "draft-summary.json"), summary),
    ]);

    withDb((db) => {
      replaceReplyDrafts(db, resolvedRunId, drafts, model);
    });
  }

  return {
    run_id: resolvedRunId,
    run_dir: runDir,
    summary,
    drafts,
  };
}
