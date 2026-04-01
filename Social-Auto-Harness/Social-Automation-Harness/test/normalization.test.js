import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAccount,
  normalizeAccounts,
  normalizePost,
  normalizePosts,
} from "../src/lib/normalization.js";

test("normalizePost maps alternate raw fields into the canonical shape", () => {
  const result = normalizePost({
    tweet_url: "https://x.com/someone/status/12345?ref=home",
    username: "@NOXtoshi",
    full_text: "  Durable onchain media matters.  ",
    created_at: "2026-03-31T09:00:00Z",
    lang: "en",
    retweeted: 1,
    search_query: "\"bitcoin art\"",
    why_matched: "matched query",
    engagement_stats: {
      like_count: "12",
      reply_count: "3",
      repost_count: "2",
      view_count: "450",
    },
    followers: "1800",
    following: "600",
    post_count: "1200",
  });

  assert.deepEqual(result, {
    post_id: "12345",
    url: "https://x.com/someone/status/12345?ref=home",
    author_handle: "NOXtoshi",
    text: "Durable onchain media matters.",
    posted_at: "2026-03-31T09:00:00Z",
    language: "en",
    is_repost: true,
    source_type: "search",
    source_value: "\"bitcoin art\"",
    match_reason: "matched query",
    stats: {
      like_count: 12,
      reply_count: 3,
      repost_count: 2,
      view_count: 450,
      author_followers: 1800,
      author_following: 600,
      author_post_count: 1200,
    },
  });
});

test("normalizePost falls back to a generated id when no post id can be derived", () => {
  const result = normalizePost({
    author: "@builderbtc",
    text: "sBTC plus permanence is useful.",
  }, 2);

  assert.equal(result.post_id, "raw-post-3");
  assert.equal(result.author_handle, "builderbtc");
});

test("normalizePosts drops items without a usable author or text", () => {
  const result = normalizePosts([
    { username: "@valid", content: "Hello world" },
    { username: "@missingtext", content: "   " },
    { content: "Missing author" },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].author_handle, "valid");
  assert.equal(result[0].text, "Hello world");
});

test("normalizeAccount maps handles, numeric fields, and source metadata", () => {
  const result = normalizeAccount({
    id: 99,
    username: "@collector",
    description: "  Onchain art fan  ",
    followers: "250",
    following: "180",
    posts: "42",
    verified: 1,
    from: "@NOXtoshi",
    strategy: "followers-of-priority-account",
    lang: "en",
  });

  assert.deepEqual(result, {
    account_id: "99",
    handle: "collector",
    bio: "Onchain art fan",
    followers: 250,
    following: 180,
    post_count: 42,
    verified: true,
    source_handle: "NOXtoshi",
    source_strategy: "followers-of-priority-account",
    language: "en",
  });
});

test("normalizeAccounts drops entries without a usable handle", () => {
  const result = normalizeAccounts([
    { username: "@kept" },
    { bio: "missing handle" },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].handle, "kept");
});
