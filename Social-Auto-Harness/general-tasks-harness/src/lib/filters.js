function compilePatterns(patterns = []) {
  return patterns.map((pattern) => new RegExp(pattern));
}

function isEnglish(language) {
  if (!language) return true;
  return /^en(?:[-_].+)?$/i.test(language) || /^english$/i.test(language);
}

function hoursSince(timestamp) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return (Date.now() - parsed.getTime()) / 36e5;
}

function getEngagementTotal(post) {
  const stats = post.stats ?? {};
  return (stats.like_count ?? 0) + (stats.reply_count ?? 0) + (stats.repost_count ?? 0);
}

function cleanTheme(theme) {
  return theme.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasTopicSignal(text, themes) {
  const lower = text.toLowerCase();
  return themes.some((theme) => {
    const cleaned = cleanTheme(theme);
    return cleaned && lower.includes(cleaned);
  });
}

function postPriority(post, priorityAccounts) {
  const stats = post.stats ?? {};
  const author = post.author_handle?.toLowerCase() ?? "";
  const priorityBoost = priorityAccounts.has(author) ? 1_000_000 : 0;
  const recencyBoost = 10_000 - Math.max(Math.floor(hoursSince(post.posted_at) ?? 9999), 0);
  const engagementBoost = getEngagementTotal(post) * 100;
  const followerBoost = Math.min(stats.author_followers ?? 0, 10_000);

  return priorityBoost + recencyBoost + engagementBoost + followerBoost;
}

export function prefilterPosts(rawPosts, options) {
  const {
    filters,
    priorityAccounts,
    stateSets,
    disabledAccounts,
    themes,
  } = options;

  const noiseHandles = new Set(filters.search_noise_handles);
  const botPatterns = compilePatterns(filters.bot_handle_patterns);
  const kept = [];
  const reasons = {};
  const seenPosts = new Set();
  const authorCounts = new Map();

  const sorted = [...rawPosts].sort((a, b) => postPriority(b, priorityAccounts) - postPriority(a, priorityAccounts));

  for (const post of sorted) {
    const author = post.author_handle?.toLowerCase();
    const postKey = post.url ?? post.post_id;
    const reason = (() => {
      if (!author) return "missing_author";
      if (!postKey) return "missing_post_key";
      if (seenPosts.has(postKey)) return "duplicate_post";
      if (disabledAccounts.has(author)) return "disabled_account";
      if (noiseHandles.has(author)) return "noise_handle";
      if (botPatterns.some((pattern) => pattern.test(post.author_handle))) return "bot_pattern";
      if (filters.skip_reposts && post.is_repost && !priorityAccounts.has(author)) return "repost";
      if (post.text.length < filters.min_post_length) return "too_short";
      if (!isEnglish(post.language)) return "non_english";

      const ageHours = hoursSince(post.posted_at);
      if (ageHours !== null && ageHours > filters.max_post_age_hours) return "too_old";
      if (stateSets.repliedPostUrls.has(post.url)) return "already_replied_url";
      if (stateSets.cooldownAuthors.has(author)) return "author_cooldown";
      if ((authorCounts.get(author) ?? 0) >= filters.max_posts_per_author_per_run) return "duplicate_author";

      const stats = post.stats ?? {};
      const lowSignalAuthor = (stats.author_followers ?? 0) > 0 && (stats.author_followers ?? 0) < 20;
      const lowSignalPost = getEngagementTotal(post) === 0;
      if (!priorityAccounts.has(author) && lowSignalAuthor && lowSignalPost) return "low_signal";
      if (!priorityAccounts.has(author) && !hasTopicSignal(post.text, themes) && lowSignalPost) return "off_topic";

      return null;
    })();

    if (reason) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    seenPosts.add(postKey);
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    kept.push(post);
  }

  const capped = kept.slice(0, filters.max_posts_for_scoring);
  if (kept.length > capped.length) {
    reasons.batch_cap = kept.length - capped.length;
  }

  return {
    filtered: capped,
    summary: {
      input_count: rawPosts.length,
      kept_count: capped.length,
      skipped_count: rawPosts.length - capped.length,
      skipped_by_reason: reasons,
    },
  };
}

export function prefilterAccounts(rawAccounts, options) {
  const {
    filters,
    stateSets,
    disabledAccounts,
  } = options;

  const noiseHandles = new Set(filters.search_noise_handles);
  const botPatterns = compilePatterns(filters.bot_handle_patterns);
  const kept = [];
  const reasons = {};
  const seen = new Set();

  for (const account of rawAccounts) {
    const handle = account.handle?.toLowerCase();
    const reason = (() => {
      if (!handle) return "missing_handle";
      if (seen.has(handle)) return "duplicate_handle";
      if (disabledAccounts.has(handle)) return "disabled_account";
      if (noiseHandles.has(handle)) return "noise_handle";
      if (stateSets.followedHandles.has(handle)) return "already_followed";
      if (botPatterns.some((pattern) => pattern.test(account.handle))) return "bot_pattern";

      const likelyBot = (account.following ?? 0) > 5000 && (account.followers ?? 0) < 50;
      if (likelyBot) return "likely_bot";

      const weakProfile =
        !account.bio &&
        (account.post_count ?? 0) < 5 &&
        (account.followers ?? 0) < 20;
      if (weakProfile) return "weak_profile";

      return null;
    })();

    if (reason) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    seen.add(handle);
    kept.push(account);
  }

  return {
    filtered: kept,
    summary: {
      input_count: rawAccounts.length,
      kept_count: kept.length,
      skipped_count: rawAccounts.length - kept.length,
      skipped_by_reason: reasons,
    },
  };
}
