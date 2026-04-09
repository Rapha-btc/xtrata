import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

import { STATE_DIR } from "./paths.js";

export const DB_PATH = path.join(STATE_DIR, "twitter.db");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at TEXT,
  finished_at TEXT,
  mode TEXT,
  status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  post_id TEXT PRIMARY KEY,
  url TEXT UNIQUE,
  author_handle TEXT,
  text TEXT,
  topic TEXT,
  posted_at TEXT,
  source_type TEXT,
  source_value TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS post_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  post_id TEXT,
  relevance INTEGER,
  engagement_opportunity INTEGER,
  reply_confidence INTEGER,
  category TEXT,
  suggested_angle TEXT,
  action TEXT,
  model TEXT,
  scored_at TEXT
);

CREATE TABLE IF NOT EXISTS reply_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  post_id TEXT,
  reply_text TEXT,
  quote_post_text TEXT,
  draft_model TEXT,
  status TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS engagement_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_handle TEXT,
  post_url TEXT,
  action_type TEXT NOT NULL,
  action_value TEXT,
  executed_at TEXT,
  topic TEXT,
  source TEXT,
  metadata TEXT,
  UNIQUE(action_type, post_url, action_value, executed_at)
);

CREATE TABLE IF NOT EXISTS followed_accounts (
  handle TEXT PRIMARY KEY,
  first_followed_at TEXT,
  last_seen_at TEXT,
  source_handle TEXT,
  source_strategy TEXT
);

CREATE INDEX IF NOT EXISTS idx_engagement_author_action
  ON engagement_history(author_handle, action_type, executed_at);

CREATE INDEX IF NOT EXISTS idx_engagement_post_url
  ON engagement_history(post_url);
`;

export function dbExists() {
  return fs.existsSync(DB_PATH);
}

export function openDb({ readOnly = false } = {}) {
  const db = new DatabaseSync(DB_PATH, { readOnly });
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function initDb(db) {
  db.exec(SCHEMA);
}

export function withDb(fn, { readOnly = false, fallback = null } = {}) {
  if (readOnly && !dbExists()) return fallback;

  const db = openDb({ readOnly });
  if (!readOnly) initDb(db);

  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function getStateSummary(db) {
  return {
    runs: db.prepare("SELECT COUNT(*) AS count FROM runs").get().count,
    posts: db.prepare("SELECT COUNT(*) AS count FROM posts").get().count,
    replies: db.prepare("SELECT COUNT(*) AS count FROM engagement_history WHERE action_type = 'reply'").get().count,
    followed_accounts: db.prepare("SELECT COUNT(*) AS count FROM followed_accounts").get().count,
  };
}

export function recordRun(db, run) {
  db.prepare(`
    INSERT OR REPLACE INTO runs (id, started_at, finished_at, mode, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.started_at ?? null,
    run.finished_at ?? null,
    run.mode ?? null,
    run.status ?? null,
    run.notes ?? null,
  );
}

export function upsertPosts(db, posts, { sourceType = "pipeline", sourceValue = null } = {}) {
  const stmt = db.prepare(`
    INSERT INTO posts (
      post_id, url, author_handle, text, topic, posted_at,
      source_type, source_value, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      url = COALESCE(excluded.url, posts.url),
      author_handle = COALESCE(excluded.author_handle, posts.author_handle),
      text = COALESCE(excluded.text, posts.text),
      topic = COALESCE(excluded.topic, posts.topic),
      posted_at = COALESCE(excluded.posted_at, posts.posted_at),
      source_type = COALESCE(excluded.source_type, posts.source_type),
      source_value = COALESCE(excluded.source_value, posts.source_value),
      last_seen_at = COALESCE(excluded.last_seen_at, posts.last_seen_at)
  `);

  const now = new Date().toISOString();
  for (const post of posts) {
    stmt.run(
      post.post_id,
      post.url ?? null,
      post.author_handle ?? null,
      post.text ?? null,
      post.topic ?? post.match_reason ?? null,
      post.posted_at ?? null,
      post.source_type ?? sourceType,
      post.source_value ?? sourceValue,
      now,
      now,
    );
  }
}

export function replacePostScores(db, runId, scoredPosts, model) {
  db.prepare("DELETE FROM post_scores WHERE run_id = ?").run(runId);

  const stmt = db.prepare(`
    INSERT INTO post_scores (
      run_id, post_id, relevance, engagement_opportunity, reply_confidence,
      category, suggested_angle, action, model, scored_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const scoredAt = new Date().toISOString();
  for (const post of scoredPosts) {
    stmt.run(
      runId,
      post.post_id,
      post.relevance,
      post.engagement_opportunity,
      post.reply_confidence,
      post.category,
      post.suggested_angle,
      post.action,
      model,
      scoredAt,
    );
  }
}

export function replaceReplyDrafts(db, runId, drafts, model) {
  db.prepare("DELETE FROM reply_drafts WHERE run_id = ?").run(runId);

  const stmt = db.prepare(`
    INSERT INTO reply_drafts (
      run_id, post_id, reply_text, quote_post_text, draft_model, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const createdAt = new Date().toISOString();
  for (const draft of drafts) {
    stmt.run(
      runId,
      draft.post_id,
      draft.reply,
      draft.quote_post ?? null,
      model,
      "generated",
      createdAt,
    );
  }
}
