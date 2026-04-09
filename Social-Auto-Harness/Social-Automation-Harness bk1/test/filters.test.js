import assert from "node:assert/strict";
import test from "node:test";

import { prefilterPosts } from "../src/lib/filters.js";

test("prefilterPosts prioritizes priority accounts case-insensitively before the scoring cap", () => {
  const now = new Date().toISOString();
  const filters = {
    search_noise_handles: [],
    bot_handle_patterns: [],
    skip_reposts: true,
    min_post_length: 20,
    max_post_age_hours: 48,
    max_posts_per_author_per_run: 1,
    max_posts_for_scoring: 1,
  };

  const result = prefilterPosts([
    {
      post_id: "other-post",
      url: "https://x.com/example/status/2",
      author_handle: "otherbuilder",
      text: "Stacks builders keep talking about permanence as infrastructure for apps.",
      posted_at: now,
      language: "en",
      is_repost: false,
      stats: {
        like_count: 25,
        reply_count: 5,
        repost_count: 3,
        author_followers: 4000,
      },
    },
    {
      post_id: "priority-post",
      url: "https://x.com/example/status/1",
      author_handle: "NOXtoshi",
      text: "Stacks permanence matters for onchain art and long-lived media.",
      posted_at: now,
      language: "en",
      is_repost: false,
      stats: {
        like_count: 0,
        reply_count: 0,
        repost_count: 0,
        author_followers: 10,
      },
    },
  ], {
    filters,
    priorityAccounts: new Set(["noxtoshi"]),
    disabledAccounts: new Set(),
    stateSets: {
      cooldownAuthors: new Set(),
      repliedPostUrls: new Set(),
      followedHandles: new Set(),
    },
    themes: ["stacks permanence"],
  });

  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].post_id, "priority-post");
});
