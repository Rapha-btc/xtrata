// dashboard/markdown.js
const fs = require('fs');
const path = require('path');
const {
  WORKDIR,
  OUTREACH_DRAFT_FILE,
  OUTREACH_HISTORY_FILE,
  OUTREACH_AGENT_MEMORY_FILE,
  OUTREACH_REPLY_QUEUE_FILE,
  OUTREACH_AMBASSADOR_BRIEF_FILE,
  LEGACY_OUTREACH_DRAFT_FILE,
  LEGACY_OUTREACH_HISTORY_FILE
} = require('./config');

function parseMarkdownTable(markdown, sectionHeader) {
  try {
    const sectionIdx = markdown.indexOf(`## ${sectionHeader}`);
    if (sectionIdx === -1) return [];

    const tableSlice = markdown.slice(sectionIdx);
    // Use a simple string split, which is safer than a complex regex for this tool.
    const lines = tableSlice.split('\n').map((l) => l.trim()).filter(Boolean);

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|') && lines[i].endsWith('|') && !lines[i].includes('---')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) return [];

    const headers = lines[headerIndex].split('|').slice(1, -1).map(h => h.trim().toLowerCase());
    const separatorIndex = headerIndex + 1;

    if (!lines[separatorIndex] || !lines[separatorIndex].includes('---')) {
        return [];
    }

    const rows = [];
    for (let i = separatorIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        if (cells.length === headers.length) {
          const row = {};
          headers.forEach((h, j) => {
            row[h] = cells[j];
          });
          rows.push(row);
        }
      } else {
        break;
      }
    }
    return rows;
  } catch (e) {
    console.error(`Error parsing table "${sectionHeader}":`, e);
    return [];
  }
}

function parseResearchBuffer() {
  try {
    const raw = fs.readFileSync(path.join(WORKDIR, 'research-buffer.md'), 'utf8');
    const pulses = [];
    const sections = raw.split('## Pulse');
    
    for (let i = 1; i < sections.length; i++) {
      const content = sections[i];
      const headerMatch = content.match(/^\s*(\d+)\s+[—-]\s+(.*)$/m);
      if (!headerMatch) continue;

      pulses.push({
        pulseNumber: Number(headerMatch[1]),
        timestamp: headerMatch[2].trim(),
        content: content.trim()
      });
    }

    pulses.sort((a, b) => b.pulseNumber - a.pulseNumber);
    return { pulses, raw }; // Newest first
  } catch (e) {
    if (e.code === 'ENOENT') return { pulses: [], raw: 'research-buffer.md not found.' };
    return { pulses: [], raw: `Error reading research-buffer.md: ${e.message}` };
  }
}

function parseLedger() {
  try {
    const raw = fs.readFileSync(path.join(WORKDIR, 'ledger.md'), 'utf8');
    return {
      onChainCosts: parseMarkdownTable(raw, 'On-Chain Costs (STX)'),
      computeCosts: parseMarkdownTable(raw, 'Compute Costs (Claude Pro Allocation)'),
      runningTotals: parseMarkdownTable(raw, 'Running Totals'),
      raw
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { onChainCosts: [], computeCosts: [], runningTotals: [], raw: 'ledger.md not found.' };
    return { onChainCosts: [], computeCosts: [], runningTotals: [], raw: `Error reading ledger.md: ${e.message}` };
  }
}

function parseIdeas() {
    try {
        const raw = fs.readFileSync(path.join(WORKDIR, 'future-inscription-ideas.md'), 'utf8');
        return { raw };
    } catch (e) {
        if (e.code === 'ENOENT') return { raw: 'future-inscription-ideas.md not found.'};
        return { raw: `Error reading future-inscription-ideas.md: ${e.message}`};
    }
}

function parseAgents() {
    try {
        const raw = fs.readFileSync(path.join(WORKDIR, 'AGENTs.md'), 'utf8');
        return {
            journalLog: parseMarkdownTable(raw, 'Journal Log'),
            raw
        };
    } catch(e) {
        if (e.code === 'ENOENT') return { journalLog: [], raw: 'AGENTs.md not found.' };
        return { journalLog: [], raw: `Error reading AGENTs.md: ${e.message}` };
    }
}

function parseEvolution() {
    try {
        const raw = fs.readFileSync(path.join(WORKDIR, 'EVOLUTION.md'), 'utf8');
        return { raw };
    } catch (e) {
        if (e.code === 'ENOENT') return { raw: 'EVOLUTION.md not found.' };
        return { raw: `Error reading EVOLUTION.md: ${e.message}` };
    }
}

const DOC_ID_MAP = {
  agents: 'AGENTs.md',
  evolution: 'EVOLUTION.md',
  research: 'research-buffer.md',
  ideas: 'future-inscription-ideas.md',
  ledger: 'ledger.md'
};

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

  try {
    const raw = fs.readFileSync(OUTREACH_DRAFT_FILE, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      return defaults;
    }
    try {
      const raw = fs.readFileSync(LEGACY_OUTREACH_DRAFT_FILE, 'utf8');
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      // ignore legacy fallback failure
    }
    return defaults;
  }
}

function saveOutreachDraft(draft) {
  const filePath = OUTREACH_DRAFT_FILE;
  const filteredDraft = Object.fromEntries(
    Object.entries(draft || {}).filter(([, value]) => value !== undefined)
  );
  const nextDraft = { ...parseOutreachDraft(), ...filteredDraft, lastUpdated: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextDraft, null, 2), 'utf8');
  return { ok: true };
}

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
  const filePath = OUTREACH_HISTORY_FILE;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(history.slice(0, 100), null, 2), 'utf8');
  return { ok: true };
}

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

function parseOutreachAmbassadorBrief() {
  try {
    const raw = fs.readFileSync(OUTREACH_AMBASSADOR_BRIEF_FILE, 'utf8');
    return { raw };
  } catch (e) {
    if (e.code === 'ENOENT') return { raw: 'agent-27-ambassador-brief.md not found.' };
    return { raw: `Error reading agent-27-ambassador-brief.md: ${e.message}` };
  }
}

function saveDocument(docId, content) {
  const filename = DOC_ID_MAP[docId];
  if (!filename) return { ok: false, error: `Unknown docId: ${docId}` };
  const filePath = path.join(WORKDIR, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return { ok: true };
}

function parseReplyQueue() {
  try {
    return JSON.parse(fs.readFileSync(OUTREACH_REPLY_QUEUE_FILE, 'utf8'));
  } catch { return []; }
}

function appendReplyQueue(entry) {
  let queue = parseReplyQueue();
  // Replace any existing entry for the same agent (keep only latest draft per agent)
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

module.exports = {
    parseResearchBuffer,
    parseLedger,
    parseIdeas,
    parseAgents,
    parseEvolution,
    parseOutreachDraft,
    saveOutreachDraft,
    parseOutreachHistory,
    appendOutreachHistory,
    parseOutreachAgentMemory,
    saveOutreachAgentMemory,
    getOutreachAgentMemory,
    updateOutreachAgentMemory,
    parseOutreachAmbassadorBrief,
    parseReplyQueue,
    appendReplyQueue,
    removeFromReplyQueue,
    saveDocument
};
