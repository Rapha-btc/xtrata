export function createEmptyStateSets() {
  return {
    cooldownAuthors: new Set(),
    repliedPostUrls: new Set(),
    followedHandles: new Set(),
  };
}

export function getReplyCooldownAuthorSet(db, cooldownDays) {
  const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT DISTINCT LOWER(author_handle) AS handle
    FROM engagement_history
    WHERE action_type = 'reply'
      AND author_handle IS NOT NULL
      AND executed_at IS NOT NULL
      AND executed_at >= ?
  `).all(since);

  return new Set(rows.map((row) => row.handle));
}

export function getRepliedPostUrlSet(db) {
  const rows = db.prepare(`
    SELECT DISTINCT post_url
    FROM engagement_history
    WHERE action_type = 'reply'
      AND post_url IS NOT NULL
  `).all();

  return new Set(rows.map((row) => row.post_url));
}

export function getFollowedHandleSet(db) {
  const rows = db.prepare(`
    SELECT LOWER(handle) AS handle
    FROM followed_accounts
    WHERE handle IS NOT NULL
  `).all();

  return new Set(rows.map((row) => row.handle));
}

export function buildStateSets(db, filters) {
  return {
    cooldownAuthors: getReplyCooldownAuthorSet(db, filters.reply_cooldown_days),
    repliedPostUrls: getRepliedPostUrlSet(db),
    followedHandles: getFollowedHandleSet(db),
  };
}
