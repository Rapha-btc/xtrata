// dashboard/outreach/store.js — All outreach JSON persistence
const fs = require('fs');
const path = require('path');
const {
  OUTREACH_DIR,
  OUTREACH_DRAFT_FILE,
  OUTREACH_HISTORY_FILE,
  OUTREACH_AGENT_MEMORY_FILE,
  OUTREACH_REPLY_QUEUE_FILE,
  OUTREACH_AMBASSADOR_BRIEF_FILE,
  LEGACY_OUTREACH_DRAFT_FILE,
  LEGACY_OUTREACH_HISTORY_FILE
} = require('../config');

// --- Drafts (keyed by agentId) ---

const OUTREACH_DRAFTS_FILE = path.join(OUTREACH_DIR, 'drafts.json');

const DRAFT_DEFAULTS = {
  mode: 'intro',
  message: '',
  incomingMessage: '',
  thought: '',
  strategy: '',
  relationship: '',
  next: '',
  lastUpdated: null
};

let _draftsMigrated = false;

function _loadDraftsRaw() {
  try {
    return JSON.parse(fs.readFileSync(OUTREACH_DRAFTS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function _migrateSingletonDraft() {
  if (_draftsMigrated) return;
  _draftsMigrated = true;

  // If drafts.json already exists, nothing to migrate
  if (_loadDraftsRaw()) return;

  // Try reading old singleton draft.json
  let old = null;
  for (const filePath of [OUTREACH_DRAFT_FILE, LEGACY_OUTREACH_DRAFT_FILE]) {
    try {
      old = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      break;
    } catch { /* ignore */ }
  }

  if (old && old.agentId) {
    const drafts = {};
    const agentId = String(old.agentId);
    const { agentId: _id, ...rest } = old;
    drafts[agentId] = { ...DRAFT_DEFAULTS, ...rest, lastUpdated: rest.lastUpdated || new Date().toISOString() };
    _saveDraftsRaw(drafts);
  }
}

function _saveDraftsRaw(drafts) {
  fs.mkdirSync(path.dirname(OUTREACH_DRAFTS_FILE), { recursive: true });
  fs.writeFileSync(OUTREACH_DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
}

function _loadDrafts() {
  _migrateSingletonDraft();
  return _loadDraftsRaw() || {};
}

function getDraft(agentId) {
  const key = String(agentId || '').trim();
  if (!key) return null;
  const drafts = _loadDrafts();
  return drafts[key] ? { agentId: key, ...DRAFT_DEFAULTS, ...drafts[key] } : null;
}

function saveDraft(agentId, patch) {
  const key = String(agentId || '').trim();
  if (!key) return { ok: false, error: 'agentId required' };
  const drafts = _loadDrafts();
  const existing = drafts[key] || { ...DRAFT_DEFAULTS };
  const filteredPatch = Object.fromEntries(
    Object.entries(patch || {}).filter(([, v]) => v !== undefined)
  );
  drafts[key] = { ...existing, ...filteredPatch, lastUpdated: new Date().toISOString() };
  _saveDraftsRaw(drafts);
  return { ok: true };
}

function deleteDraft(agentId) {
  const key = String(agentId || '').trim();
  if (!key) return { ok: false };
  const drafts = _loadDrafts();
  if (!(key in drafts)) return { ok: true };
  delete drafts[key];
  _saveDraftsRaw(drafts);
  return { ok: true };
}

function listDrafts() {
  const drafts = _loadDrafts();
  return Object.entries(drafts).map(([agentId, d]) => ({ agentId, ...d }));
}

// --- Singleton draft compat (used by old callers during transition) ---

function parseOutreachDraft() {
  const defaults = {
    agentId: null,
    mode: 'intro',
    message: '',
    incomingMessage: '',
    thought: '',
    strategy: '',
    relationship: '',
    next: '',
    lastUpdated: null
  };
  // Return the most recently updated draft, or defaults
  const drafts = _loadDrafts();
  const entries = Object.entries(drafts);
  if (entries.length === 0) return defaults;
  entries.sort((a, b) => {
    const ta = Date.parse(a[1].lastUpdated || '') || 0;
    const tb = Date.parse(b[1].lastUpdated || '') || 0;
    return tb - ta;
  });
  const [agentId, draft] = entries[0];
  return { ...defaults, ...draft, agentId };
}

function saveOutreachDraft(draft) {
  const agentId = String(draft?.agentId || '').trim();
  if (!agentId) {
    // Legacy: no agentId means write to first/only draft slot
    const drafts = _loadDrafts();
    const keys = Object.keys(drafts);
    if (keys.length === 1) {
      return saveDraft(keys[0], draft);
    }
    return { ok: false, error: 'agentId required for keyed drafts' };
  }
  const { agentId: _id, ...rest } = draft;
  return saveDraft(agentId, rest);
}

// --- History ---

function parseOutreachHistory() {
  try {
    const raw = fs.readFileSync(OUTREACH_HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') return [];
    try {
      const raw = fs.readFileSync(LEGACY_OUTREACH_HISTORY_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      // ignore legacy fallback failure
    }
    return [];
  }
}

function appendOutreachHistory(entry) {
  const history = parseOutreachHistory();
  history.unshift({ ...entry, timestamp: new Date().toISOString() });
  fs.mkdirSync(path.dirname(OUTREACH_HISTORY_FILE), { recursive: true });
  fs.writeFileSync(OUTREACH_HISTORY_FILE, JSON.stringify(history.slice(0, 200), null, 2), 'utf8');
  return { ok: true };
}

/**
 * Update the status of a history entry matching the given filter.
 * filter: { agentId, message, type } — all optional, matched with AND
 * patch: fields to merge (e.g. { status: 'confirmed', paymentTxid: '...' })
 * Updates the FIRST matching entry (newest first).
 */
function updateHistoryEntry(filter, patch) {
  const history = parseOutreachHistory();
  const idx = history.findIndex(h => {
    if (filter.agentId && String(h.agentId) !== String(filter.agentId)) return false;
    if (filter.message && h.message !== filter.message) return false;
    if (filter.type && h.type !== filter.type) return false;
    if (filter.status && h.status !== filter.status) return false;
    return true;
  });
  if (idx === -1) return { ok: false, error: 'No matching history entry' };
  history[idx] = { ...history[idx], ...patch };
  fs.writeFileSync(OUTREACH_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  return { ok: true };
}

/**
 * Check if we've already successfully replied to a specific inbound message.
 * Prevents duplicate replies to the same incoming message.
 */
function hasSuccessfulReplyTo(agentId, incomingMessage) {
  if (!incomingMessage) return false;
  const history = parseOutreachHistory();
  const incomingTrimmed = String(incomingMessage).trim().substring(0, 100);
  return history.some(h =>
    h.type === 'sent' &&
    h.status !== 'failed' &&
    String(h.agentId) === String(agentId) &&
    h.incomingMessage &&
    String(h.incomingMessage).trim().substring(0, 100) === incomingTrimmed
  );
}

/**
 * Check if a send is currently pending (not yet confirmed or failed) for this agent.
 */
function hasPendingSendTo(agentId) {
  const history = parseOutreachHistory();
  return history.some(h =>
    h.type === 'sent' &&
    h.status === 'pending' &&
    String(h.agentId) === String(agentId)
  );
}

// --- Agent memory ---

function isStacksAddress(value) {
  return /^(SP|ST)[A-Z0-9]{8,}$/i.test(String(value || '').trim());
}

function compareIsoDates(a, b) {
  const aTime = Date.parse(a || '') || 0;
  const bTime = Date.parse(b || '') || 0;
  return aTime - bTime;
}

function mergeOutreachMemoryRecords(records) {
  const merged = {};
  const ordered = [...records].sort((a, b) => compareIsoDates(a.lastUpdated, b.lastUpdated));
  for (const record of ordered) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined && value !== '') {
        merged[key] = value;
      } else if (!(key in merged) && value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function chooseOutreachMemoryCanonicalKey(fallbackKey, record) {
  const agentId = String(record.agentId || '').trim();
  const stxAddress = String(record.stxAddress || '').trim();
  if (agentId && !isStacksAddress(agentId)) return agentId;
  if (stxAddress) return stxAddress;
  if (agentId) return agentId;
  return String(fallbackKey || '').trim();
}

function normalizeOutreachAgentMemory(rawMemory) {
  const memory = rawMemory && typeof rawMemory === 'object' ? rawMemory : {};
  const groups = new Map();

  for (const [key, value] of Object.entries(memory)) {
    if (!value || typeof value !== 'object') continue;
    const record = { ...value };
    if (!record.agentId) record.agentId = key;
    const groupKey = record.stxAddress
      ? `stx:${record.stxAddress}`
      : record.agentId
        ? `id:${record.agentId}`
        : `key:${key}`;
    const group = groups.get(groupKey) || [];
    group.push({ key, record });
    groups.set(groupKey, group);
  }

  const normalized = {};
  for (const entries of groups.values()) {
    const merged = mergeOutreachMemoryRecords(entries.map(({ record }) => record));
    const preferredAgentId = entries
      .map(({ key, record }) => String(record.agentId || key || '').trim())
      .find((value) => value && !isStacksAddress(value));
    const canonicalKey = chooseOutreachMemoryCanonicalKey(entries[0]?.key, {
      ...merged,
      agentId: preferredAgentId || merged.agentId
    });
    normalized[canonicalKey] = {
      ...merged,
      agentId: preferredAgentId || merged.agentId || canonicalKey
    };
  }

  return normalized;
}

function parseOutreachAgentMemory() {
  try {
    const raw = fs.readFileSync(OUTREACH_AGENT_MEMORY_FILE, 'utf8');
    return normalizeOutreachAgentMemory(JSON.parse(raw));
  } catch {
    return {};
  }
}

function saveOutreachAgentMemory(memory) {
  const normalized = normalizeOutreachAgentMemory(memory);
  fs.mkdirSync(path.dirname(OUTREACH_AGENT_MEMORY_FILE), { recursive: true });
  fs.writeFileSync(OUTREACH_AGENT_MEMORY_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return { ok: true };
}

function getOutreachAgentMemory(agentId) {
  const memory = parseOutreachAgentMemory();
  const key = String(agentId || '').trim();
  if (!key) return null;
  if (memory[key]) return memory[key];
  return Object.values(memory).find((entry) =>
    String(entry.agentId || '').trim() === key ||
    String(entry.stxAddress || '').trim() === key
  ) || null;
}

function updateOutreachAgentMemory(agentId, patch) {
  const key = String(agentId || '').trim();
  const memory = parseOutreachAgentMemory();
  const filteredPatch = Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== undefined)
  );
  const aliasMatches = Object.entries(memory)
    .filter(([entryKey, entry]) => {
      if (entryKey === key) return true;
      const agentIdValue = String(entry.agentId || '').trim();
      const stxValue = String(entry.stxAddress || '').trim();
      const patchAgentId = String(filteredPatch.agentId || '').trim();
      const patchStx = String(filteredPatch.stxAddress || '').trim();
      return (
        agentIdValue === key ||
        stxValue === key ||
        (patchAgentId && agentIdValue === patchAgentId) ||
        (patchStx && stxValue === patchStx) ||
        (patchStx && entryKey === patchStx)
      );
    })
    .map(([, entry]) => entry);
  const existing = mergeOutreachMemoryRecords(aliasMatches);
  const preferredAgentId = String(
    filteredPatch.agentId
    || (!isStacksAddress(key) ? key : '')
    || existing.agentId
    || key
  ).trim();
  const canonicalKey = chooseOutreachMemoryCanonicalKey(key, {
    ...filteredPatch,
    ...existing,
    agentId: preferredAgentId
  });
  memory[canonicalKey] = {
    ...existing,
    ...filteredPatch,
    agentId: preferredAgentId || canonicalKey,
    stxAddress: filteredPatch.stxAddress || existing.stxAddress || '',
    lastUpdated: new Date().toISOString()
  };
  saveOutreachAgentMemory(memory);
  return getOutreachAgentMemory(canonicalKey);
}

// --- Reply queue (legacy compat — new callers use drafts with source:'auto-converse') ---

function parseReplyQueue() {
  try {
    return JSON.parse(fs.readFileSync(OUTREACH_REPLY_QUEUE_FILE, 'utf8'));
  } catch { return []; }
}

function appendReplyQueue(entry) {
  let queue = parseReplyQueue();
  queue = queue.filter(q => String(q.agentId) !== String(entry.agentId));
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(OUTREACH_REPLY_QUEUE_FILE), { recursive: true });
  fs.writeFileSync(OUTREACH_REPLY_QUEUE_FILE, JSON.stringify(queue, null, 2));
  return { ok: true };
}

function removeFromReplyQueue(agentId, message) {
  const queue = parseReplyQueue().filter(q =>
    !(String(q.agentId) === String(agentId) && q.message === message)
  );
  fs.writeFileSync(OUTREACH_REPLY_QUEUE_FILE, JSON.stringify(queue, null, 2));
  return { ok: true };
}

// --- Ambassador brief ---

function parseOutreachAmbassadorBrief() {
  try {
    const raw = fs.readFileSync(OUTREACH_AMBASSADOR_BRIEF_FILE, 'utf8');
    return { raw };
  } catch (e) {
    if (e.code === 'ENOENT') return { raw: 'agent-27-ambassador-brief.md not found.' };
    return { raw: `Error reading agent-27-ambassador-brief.md: ${e.message}` };
  }
}

module.exports = {
  // Keyed drafts
  getDraft,
  saveDraft,
  deleteDraft,
  listDrafts,
  // Singleton compat
  parseOutreachDraft,
  saveOutreachDraft,
  // History
  parseOutreachHistory,
  appendOutreachHistory,
  updateHistoryEntry,
  hasSuccessfulReplyTo,
  hasPendingSendTo,
  // Agent memory
  parseOutreachAgentMemory,
  saveOutreachAgentMemory,
  getOutreachAgentMemory,
  updateOutreachAgentMemory,
  normalizeOutreachAgentMemory,
  // Reply queue
  parseReplyQueue,
  appendReplyQueue,
  removeFromReplyQueue,
  // Ambassador brief
  parseOutreachAmbassadorBrief
};
