function normalizeHandle(handle) {
  return handle?.replace(/^@/, "").trim() || null;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function derivePostId(url, fallback) {
  const match = url?.match(/status\/([^/?]+)/);
  if (match?.[1]) return match[1];
  return fallback;
}

export function normalizePost(raw, index = 0) {
  const url = raw.url ?? raw.link ?? raw.thread_url ?? raw.tweet_url ?? null;
  const postId = String(
    raw.post_id ??
    raw.id ??
    raw.tweet_id ??
    derivePostId(url, `raw-post-${index + 1}`)
  );

  const engagement = raw.engagement_stats ?? {};

  return {
    post_id: postId,
    url,
    author_handle: normalizeHandle(raw.author ?? raw.author_handle ?? raw.handle ?? raw.username),
    text: String(raw.text ?? raw.post_text ?? raw.full_text ?? raw.content ?? "").trim(),
    posted_at: raw.posted_at ?? raw.timestamp ?? raw.created_at ?? null,
    language: raw.language ?? raw.lang ?? null,
    is_repost: Boolean(raw.is_repost ?? raw.repost ?? raw.is_retweet ?? raw.retweeted ?? false),
    source_type: raw.source_type ?? (raw.search_query ? "search" : raw.source_handle ? "source-handle" : "unknown"),
    source_value: raw.source_value ?? raw.search_query ?? raw.source_handle ?? null,
    match_reason: raw.match_reason ?? raw.why_matched ?? raw.source_reason ?? null,
    stats: {
      like_count: numeric(engagement.like_count ?? raw.like_count ?? raw.likes),
      reply_count: numeric(engagement.reply_count ?? raw.reply_count ?? raw.replies),
      repost_count: numeric(engagement.repost_count ?? raw.repost_count ?? raw.retweets),
      view_count: numeric(engagement.view_count ?? raw.view_count ?? raw.views),
      author_followers: numeric(raw.author_followers ?? raw.followers),
      author_following: numeric(raw.author_following ?? raw.following),
      author_post_count: numeric(raw.author_post_count ?? raw.post_count),
    },
  };
}

export function normalizeAccount(raw, index = 0) {
  return {
    account_id: String(raw.account_id ?? raw.id ?? `raw-account-${index + 1}`),
    handle: normalizeHandle(raw.handle ?? raw.author ?? raw.username),
    bio: String(raw.bio ?? raw.description ?? "").trim(),
    followers: numeric(raw.followers),
    following: numeric(raw.following),
    post_count: numeric(raw.post_count ?? raw.posts),
    verified: Boolean(raw.verified ?? false),
    source_handle: normalizeHandle(raw.source_handle ?? raw.source ?? raw.from),
    source_strategy: raw.source_strategy ?? raw.strategy ?? null,
    language: raw.language ?? raw.lang ?? null,
  };
}

export function normalizePosts(rawPosts = []) {
  return rawPosts.map((raw, index) => normalizePost(raw, index)).filter((post) => post.author_handle && post.text);
}

export function normalizeAccounts(rawAccounts = []) {
  return rawAccounts.map((raw, index) => normalizeAccount(raw, index)).filter((account) => account.handle);
}
