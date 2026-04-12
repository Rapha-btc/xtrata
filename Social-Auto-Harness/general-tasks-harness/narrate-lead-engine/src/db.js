import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { DB_PATH } from "./lib/paths.js";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  status TEXT,
  counts_json TEXT
);

CREATE TABLE IF NOT EXISTS source_items (
  item_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_type TEXT,
  source_label TEXT,
  family TEXT,
  query_text TEXT,
  platform TEXT,
  url TEXT,
  title TEXT,
  excerpt TEXT,
  author_name TEXT,
  published_at TEXT,
  raw_text TEXT,
  detected_signals_json TEXT,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  lead_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_item_id TEXT,
  person_or_company TEXT,
  lead_type TEXT,
  website TEXT,
  email TEXT,
  contact_path TEXT,
  social_handle TEXT,
  fit_score INTEGER,
  pain_score INTEGER,
  ai_openness_score INTEGER,
  reachability_score INTEGER,
  freshness_score INTEGER,
  buyer_likelihood_score INTEGER,
  risk_score INTEGER,
  total_score INTEGER,
  status TEXT,
  qualification TEXT,
  detected_signals_json TEXT,
  risk_flags_json TEXT,
  evidence_json TEXT,
  enrichment_json TEXT
);

CREATE TABLE IF NOT EXISTS outreach (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  channel TEXT,
  message_version TEXT,
  subject TEXT,
  body TEXT,
  dm_variant TEXT,
  status TEXT,
  personalization_reason TEXT,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS learning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  query_text TEXT,
  source_label TEXT,
  results_found INTEGER,
  qualified_found INTEGER,
  drafted_found INTEGER,
  replies INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  revenue INTEGER DEFAULT 0
);
`;

function jsonText(value) {
  return JSON.stringify(value ?? null);
}

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

export function replaceRunState(db, { run, sourceItems = [], leads = [], outreach = [], learning = [] } = {}) {
  db.prepare(
    `INSERT OR REPLACE INTO runs (id, name, objective, started_at, finished_at, status, counts_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    run.id,
    run.name,
    run.objective,
    run.startedAt ?? null,
    run.finishedAt ?? null,
    run.status ?? null,
    jsonText(run.counts ?? {})
  );

  db.prepare("DELETE FROM source_items WHERE run_id = ?").run(run.id);
  db.prepare("DELETE FROM leads WHERE run_id = ?").run(run.id);
  db.prepare("DELETE FROM outreach WHERE run_id = ?").run(run.id);
  db.prepare("DELETE FROM learning WHERE run_id = ?").run(run.id);

  const sourceStmt = db.prepare(`
    INSERT INTO source_items (
      item_id, run_id, source_type, source_label, family, query_text, platform,
      url, title, excerpt, author_name, published_at, raw_text, detected_signals_json, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of sourceItems) {
    sourceStmt.run(
      item.itemId,
      run.id,
      item.sourceType ?? null,
      item.sourceLabel ?? null,
      item.family ?? null,
      item.query ?? null,
      item.platform ?? null,
      item.url ?? null,
      item.title ?? null,
      item.excerpt ?? null,
      item.authorName ?? null,
      item.publishedAt ?? null,
      item.rawText ?? null,
      jsonText(item.detectedSignals ?? []),
      jsonText(item.raw ?? null)
    );
  }

  const leadStmt = db.prepare(`
    INSERT INTO leads (
      lead_id, run_id, source_item_id, person_or_company, lead_type, website, email, contact_path,
      social_handle, fit_score, pain_score, ai_openness_score, reachability_score, freshness_score,
      buyer_likelihood_score, risk_score, total_score, status, qualification, detected_signals_json,
      risk_flags_json, evidence_json, enrichment_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lead of leads) {
    leadStmt.run(
      lead.leadId,
      run.id,
      lead.sourceItemId ?? null,
      lead.personOrCompany ?? null,
      lead.leadType ?? null,
      lead.website ?? null,
      lead.email ?? null,
      lead.contactPath ?? null,
      lead.socialHandle ?? null,
      lead.fitScore ?? 0,
      lead.painScore ?? 0,
      lead.aiOpennessScore ?? 0,
      lead.reachabilityScore ?? 0,
      lead.freshnessScore ?? 0,
      lead.buyerLikelihoodScore ?? 0,
      lead.riskScore ?? 0,
      lead.totalScore ?? 0,
      lead.status ?? null,
      lead.qualification ?? null,
      jsonText(lead.detectedSignals ?? []),
      jsonText(lead.riskFlags ?? []),
      jsonText(lead.evidence ?? null),
      jsonText(lead.enrichment ?? null)
    );
  }

  const outreachStmt = db.prepare(`
    INSERT INTO outreach (
      run_id, lead_id, channel, message_version, subject, body, dm_variant, status,
      personalization_reason, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const draft of outreach) {
    outreachStmt.run(
      run.id,
      draft.leadId,
      draft.value?.channel ?? null,
      draft.messageVersion ?? null,
      draft.value?.subject ?? null,
      draft.value?.body ?? null,
      draft.value?.dmVariant ?? null,
      draft.status ?? null,
      draft.value?.personalizationReason ?? null,
      jsonText(draft.rawResult ?? null)
    );
  }

  const learningStmt = db.prepare(`
    INSERT INTO learning (
      run_id, query_text, source_label, results_found, qualified_found, drafted_found, replies, meetings, revenue
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of learning) {
    learningStmt.run(
      run.id,
      row.query ?? null,
      row.sourceLabel ?? null,
      row.resultsFound ?? 0,
      row.qualifiedFound ?? 0,
      row.draftedFound ?? 0,
      row.replies ?? 0,
      row.meetings ?? 0,
      row.revenue ?? 0
    );
  }
}

export function getOverview(db) {
  const runCount = db.prepare("SELECT COUNT(*) AS count FROM runs").get().count;
  const leadCount = db.prepare("SELECT COUNT(*) AS count FROM leads").get().count;
  const hotLeadCount = db.prepare("SELECT COUNT(*) AS count FROM leads WHERE status = 'hot'").get().count;
  const readyCount = db
    .prepare("SELECT COUNT(*) AS count FROM outreach WHERE status = 'drafted'")
    .get().count;

  return {
    runCount,
    leadCount,
    hotLeadCount,
    readyCount,
  };
}

export function listRuns(db, limit = 20) {
  return db
    .prepare(
      `SELECT id, name, objective, started_at AS startedAt, finished_at AS finishedAt, status, counts_json AS countsJson
       FROM runs
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      ...row,
      counts: JSON.parse(row.countsJson ?? "{}"),
    }));
}

export function listLeads(db, { runId = null, limit = 50 } = {}) {
  const rows = runId
    ? db
        .prepare(
          `SELECT * FROM leads
           WHERE run_id = ?
           ORDER BY total_score DESC
           LIMIT ?`
        )
        .all(runId, limit)
    : db
        .prepare(
          `SELECT * FROM leads
           ORDER BY total_score DESC
           LIMIT ?`
        )
        .all(limit);

  return rows.map((row) => ({
    leadId: row.lead_id,
    runId: row.run_id,
    sourceItemId: row.source_item_id,
    personOrCompany: row.person_or_company,
    leadType: row.lead_type,
    website: row.website,
    email: row.email,
    contactPath: row.contact_path,
    socialHandle: row.social_handle,
    fitScore: row.fit_score,
    painScore: row.pain_score,
    aiOpennessScore: row.ai_openness_score,
    reachabilityScore: row.reachability_score,
    freshnessScore: row.freshness_score,
    buyerLikelihoodScore: row.buyer_likelihood_score,
    riskScore: row.risk_score,
    totalScore: row.total_score,
    status: row.status,
    qualification: row.qualification,
    detectedSignals: JSON.parse(row.detected_signals_json ?? "[]"),
    riskFlags: JSON.parse(row.risk_flags_json ?? "[]"),
    evidence: JSON.parse(row.evidence_json ?? "null"),
    enrichment: JSON.parse(row.enrichment_json ?? "null"),
  }));
}
