// dashboard/outreach.js — Outreach routes and helpers extracted from server.js
const express = require('express');
const markdown = require('./markdown');
const { runTask } = require('./ai-runner');
const { WORKDIR, WALLET } = require('./config');

const router = express.Router();

let runningOutreach = false;
let _addLog = () => {};
let _broadcast = () => {};

// --- Inbox sync (direct HTTP to aibtc.com — free endpoint, no MCP needed) ---

const INBOX_API = `https://aibtc.com/api/inbox/${WALLET}`;

async function fetchInbox() {
  const res = await fetch(INBOX_API);
  if (!res.ok) throw new Error(`Inbox API returned ${res.status}`);
  const data = await res.json();
  return data;
}

/**
 * Sync inbox messages into outreach history + agent memory.
 * Returns { newMessages, totalMessages, economics }.
 */
async function syncInbox() {
  const data = await fetchInbox();
  const messages = (data.inbox && data.inbox.messages) || [];
  const existingHistory = markdown.parseOutreachHistory();

  // Build set of already-known message IDs and payment txids
  const knownTxids = new Set();
  for (const h of existingHistory) {
    if (h.paymentTxid) knownTxids.add(h.paymentTxid);
    if (h.messageId) knownTxids.add(h.messageId);
  }

  const newMessages = [];
  // Process oldest-first so history order is correct
  const sorted = [...messages].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  for (const msg of sorted) {
    // Skip if we already have this message
    if (knownTxids.has(msg.paymentTxid) || knownTxids.has(msg.messageId)) continue;

    const isInbound = msg.direction === 'received';
    const peerName = msg.peerDisplayName || msg.fromAddress || 'Unknown';
    const peerStx = isInbound ? msg.fromAddress : msg.toStxAddress;

    // Find or derive agent ID from registry
    const agents = loadAgentsRegistry(_registryFile, _legacyRegistryFile);
    const agent = agents.find(a => a.stxAddress === peerStx);
    const agentId = agent ? String(agent.id) : peerStx;

    const historyEntry = {
      type: isInbound ? 'received' : 'sent',
      direction: isInbound ? 'inbound' : 'outbound',
      mode: isInbound ? 'reply' : 'intro',
      agent: peerName,
      agentId,
      stxAddress: peerStx || '',
      message: msg.content,
      messageId: msg.messageId,
      paymentTxid: msg.paymentTxid,
      paymentSats: msg.paymentSatoshis,
      sentAt: msg.sentAt
    };

    markdown.appendOutreachHistory(historyEntry);

    // Update agent memory
    const memoryPatch = {
      agentName: peerName,
      stxAddress: peerStx,
      btcAddress: isInbound ? (msg.peerBtcAddress || '') : (msg.toBtcAddress || '')
    };
    if (isInbound) {
      memoryPatch.relationshipStatus = 'inbound-received';
      memoryPatch.lastInboundMessage = msg.content;
      memoryPatch.lastInboundDate = msg.sentAt;
      memoryPatch.openLoop = 'Reply needed';
    } else {
      memoryPatch.relationshipStatus = 'outbound-sent';
      memoryPatch.lastOutboundMessage = msg.content;
      memoryPatch.lastOutboundDate = msg.sentAt;
      memoryPatch.openLoop = 'Awaiting reply';
    }
    markdown.updateOutreachAgentMemory(agentId, memoryPatch);

    // Backfill btcAddress and displayName into registry if resolved
    if (agent) {
      let dirty = false;
      if (memoryPatch.btcAddress && !agent.btcAddress) {
        agent.btcAddress = memoryPatch.btcAddress;
        dirty = true;
      }
      if (memoryPatch.agentName && (!agent.displayName || agent.displayName.startsWith('Agent #'))) {
        agent.displayName = memoryPatch.agentName;
        dirty = true;
      }
      if (dirty) saveAgentsRegistry(_registryFile, agents);
    }

    newMessages.push(historyEntry);
  }

  // Backfill: inject locally-sent messages that aren't in the API response
  // so they appear as outbound in the inbox thread view
  const apiTxids = new Set(messages.map(m => m.paymentTxid).filter(Boolean));
  const apiMsgIds = new Set(messages.map(m => m.messageId).filter(Boolean));
  const allHistory = markdown.parseOutreachHistory();
  for (const h of allHistory) {
    if (h.direction !== 'outbound' || h.type !== 'sent') continue;
    // Skip if already in API response
    if (h.paymentTxid && apiTxids.has(h.paymentTxid)) continue;
    if (h.messageId && apiMsgIds.has(h.messageId)) continue;
    // Skip research drafts (no actual send)
    if (!h.message) continue;
    // Synthesize an inbox-format message so the UI can render it
    messages.push({
      direction: 'sent',
      content: h.message,
      sentAt: h.sentAt || h.timestamp,
      toStxAddress: h.stxAddress || '',
      peerDisplayName: h.agent || 'Unknown',
      paymentTxid: h.paymentTxid || null,
      messageId: h.messageId || `local_${h.timestamp}`,
      paymentSatoshis: h.paymentSats || 100
    });
  }
  // Re-sort by sentAt so threads display chronologically
  messages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  return {
    newMessages,
    newCount: newMessages.length,
    totalMessages: messages.length,
    receivedCount: data.inbox?.receivedCount || 0,
    sentCount: data.inbox?.sentCount || 0,
    unreadCount: data.inbox?.unreadCount || 0,
    economics: data.inbox?.economics || {},
    messages // raw messages + local outbound backfill for UI
  };
}

// Module-level registry file refs, set in mount()
let _registryFile = '';
let _legacyRegistryFile = '';

/**
 * Parse campaign messages from communication/outreach-plan.md.
 * Extracts display name, STX/BTC addresses, and the message block for each target.
 */
function parseCampaignMessages(raw) {
  const messages = [];
  const sections = raw.split(/^### \d+\.\s+/m).slice(1);
  for (const section of sections) {
    const nameMatch = section.match(/^(.+?)(?:\s*—|\s*\n)/);
    const stxMatch = section.match(/\*\*STX:\*\*\s*`([^`]+)`/);
    const btcMatch = section.match(/\*\*BTC:\*\*\s*`([^`]+)`/);
    const whyMatch = section.match(/\*\*Why:\*\*\s*(.+)/);
    const msgMatch = section.match(/\*\*(?:Message|Reply draft)[^*]*\*\*[^\n]*\n```\n([\s\S]*?)```/);
    const idMatch = section.match(/Agent #?(\d+)/);
    if (nameMatch && stxMatch && btcMatch && msgMatch) {
      messages.push({
        displayName: nameMatch[1].trim(),
        stxAddress: stxMatch[1].trim(),
        btcAddress: btcMatch[1].trim(),
        message: msgMatch[1].trim(),
        why: whyMatch ? whyMatch[1].trim() : '',
        registryId: idMatch ? idMatch[1] : null
      });
    }
  }
  return messages;
}

// --- Helpers ---

function normalizeOutreachMode(mode, incomingMessage = '') {
  const normalized = String(mode || '').trim().toLowerCase();
  if (['intro', 'reply', 'follow-up'].includes(normalized)) return normalized;
  return String(incomingMessage || '').trim() ? 'reply' : 'intro';
}

function clipText(value, limit = 500) {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function parseTaggedField(text, label, fallback = '') {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z- ]+:|$)`, 'i');
  const match = text.match(pattern);
  return (match ? match[1] : fallback).trim();
}

function buildOutreachContext(agentId, incomingMessage = '') {
  const history = markdown.parseOutreachHistory()
    .filter((entry) => String(entry.agentId) === String(agentId))
    .slice(0, 6);
  const memory = markdown.getOutreachAgentMemory(agentId);

  const historyText = history.length === 0
    ? '[none recorded]'
    : history.map((entry) => {
      const body = clipText(entry.message || entry.thought || '', 280);
      const direction = entry.direction || (entry.type === 'received' ? 'inbound' : entry.type === 'sent' ? 'outbound' : 'draft');
      return `- ${entry.timestamp} | ${direction} | ${entry.mode || 'n/a'} | ${body}`;
    }).join('\n');

  const memoryText = memory
    ? [
        `relationshipStatus: ${memory.relationshipStatus || 'unknown'}`,
        `openLoop: ${memory.openLoop || 'none'}`,
        `lastMode: ${memory.lastMode || 'unknown'}`,
        `lastInboundMessage: ${clipText(memory.lastInboundMessage || '', 280) || '[none]'}`,
        `lastOutboundMessage: ${clipText(memory.lastOutboundMessage || '', 280) || '[none]'}`
      ].join('\n')
    : '[none recorded]';

  return {
    history,
    memory,
    historyText,
    memoryText,
    incomingText: String(incomingMessage || '').trim() || '[none provided]'
  };
}

/**
 * Shared send execution: builds prompt, spawns Claude, handles result.
 * Returns a Promise that resolves when the send completes.
 */
function executeSend({ displayName, stxAddress, btcAddress, agentId, message, mode, model, logPrefix, extraPromptContext, onSuccess, onFailure }) {
  const walletPassword = process.env.WALLET_PASSWORD || '';
  const unlockStep = walletPassword
    ? `Step 1: Unlock the wallet named "Primary" using wallet_unlock with password "${walletPassword}".\nStep 2: ` : '';

  const contextBlock = extraPromptContext ? `\n${extraPromptContext}\n` : '';

  const prompt = `SEND OUTREACH MESSAGE:
Mode: ${mode}
Role: Agent 27 sending as Xtrata ambassador.
Target Agent: ${displayName}
STX Address: ${stxAddress}
BTC Address: ${btcAddress}
Message:
${message}
${contextBlock}
${unlockStep}Call the tool mcp__aibtc__execute_x402_endpoint with these EXACT parameters:
{
  "apiUrl": "https://aibtc.com",
  "path": "/api/inbox/${stxAddress}",
  "method": "POST",
  "autoApprove": true,
  "data": {
    "toBtcAddress": "${btcAddress}",
    "toStxAddress": "${stxAddress}",
    "content": ${JSON.stringify(message)}
  }
}

Do not modify the message. Do not search for tools. Do not probe first.
Call mcp__aibtc__execute_x402_endpoint directly with autoApprove=true.
If the tool call succeeds, respond with "OUTREACH_SUCCESS".
If it fails, explain why.`;

  runningOutreach = true;
  _addLog('start', `${logPrefix} send to ${displayName}...`);

  return runTask({
    model: model || 'sonnet', budget: 0.10, prompt, cwd: WORKDIR,
    phaseType: 'research', contextPack: 'outreachSend',
    onLine: (type, line) => {
      if (type === 'stdout' && (line.includes('[tool]') || line.length > 40)) {
        _addLog('stdout', `[${logPrefix}] ${line.substring(0, 100)}...`);
      }
    }
  }).then((result) => {
    runningOutreach = false;
    const fullText = (result.text || '').trim();
    const isSuccess = fullText.includes('OUTREACH_SUCCESS') || result.output.some(l => l.includes('OUTREACH_SUCCESS'));
    try {
      if (isSuccess) {
        _addLog('stop', `${logPrefix} to ${displayName} delivered.`);
        if (onSuccess) onSuccess(fullText);
      } else {
        const preview = fullText ? fullText.substring(0, 300) : '(empty response)';
        _addLog('error', `${logPrefix} to ${displayName} failed to confirm.`);
        _addLog('stderr', `[send-response] ${preview}`);
        if (onFailure) onFailure(fullText);
      }
    } catch (cbErr) {
      console.error(`[executeSend] Callback error: ${cbErr.message}`);
    }
    return { success: isSuccess, text: fullText };
  }).catch((err) => {
    runningOutreach = false;
    try { _addLog('error', `${logPrefix} error: ${err.message}`); } catch {}
    if (onFailure) try { onFailure(err.message); } catch {}
    return { success: false, error: err.message };
  }).finally(() => {
    // Safety net: always clear the lock no matter what
    runningOutreach = false;
  });
}

// --- Agent discovery & registry ---

function loadAgentsRegistry(registryFile, legacyFile) {
  const fs = require('fs');
  for (const filePath of [registryFile, legacyFile]) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return [];
}

function saveAgentsRegistry(registryFile, agents) {
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify(agents, null, 2));
}

async function discoverAgents(registryFile) {
  const { HIRO_BASE } = require('./config');

  try {
    const nextIdRes = await fetch(`${HIRO_BASE}/v2/contracts/call-read/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD/identity-registry-v2/get-last-token-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ', arguments: [] })
    });
    const nextIdData = await nextIdRes.json();
    const resultHex = nextIdData.result || '';
    const totalAgents = resultHex
      ? parseInt(Buffer.from(resultHex.replace('0x','').slice(4), 'hex').readBigUInt64BE(8).toString())
      : 0;

    console.log(`Discovering ${totalAgents} agents...`);
    const agents = [];

    const uint128Arg = (n) => {
      const b = Buffer.alloc(16);
      b.writeBigUInt64BE(0n, 0);
      b.writeBigUInt64BE(BigInt(n), 8);
      return '0x01' + b.toString('hex');
    };
    const c32 = require('c32check');
    const readFn = async (fn, args) => {
      const res = await fetch(`${HIRO_BASE}/v2/contracts/call-read/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD/identity-registry-v2/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ', arguments: args })
      });
      return res.json();
    };
    const decodeOwner = (hex) => {
      if (!hex || hex === '0x09') return null;
      try {
        const h = hex.replace('0x', '');
        const hash160 = h.slice(8, 48);
        return c32.c32address(22, hash160);
      } catch { return null; }
    };
    const decodeUri = (hex) => {
      if (!hex || hex === '0x09') return '';
      try {
        const buf = Buffer.from(hex.replace('0x', ''), 'hex');
        let off = 0;
        if (buf[off] === 0x07) off++;
        if (buf[off] === 0x0a) off++;
        if (buf[off] === 0x0d) off++;
        const len = buf.readUInt32BE(off); off += 4;
        return buf.slice(off, off + len).toString('utf8');
      } catch { return ''; }
    };

    for (let id = 1; id <= totalAgents; id++) {
      try {
        const arg = uint128Arg(id);
        const [ownerData, uriData] = await Promise.all([
          readFn('get-owner', [arg]),
          readFn('get-token-uri', [arg])
        ]);
        const stxAddress = decodeOwner(ownerData.result);
        if (!stxAddress) continue;
        const uri = decodeUri(uriData.result);
        agents.push({
          id,
          name: `Agent #${id}`,
          stxAddress,
          btcAddress: '',
          description: uri || ''
        });
        await new Promise(r => setTimeout(r, 120));
      } catch (e) {
        console.error(`Failed to fetch agent #${id}:`, e.message);
      }
    }

    if (agents.length > 0) {
      saveAgentsRegistry(registryFile, agents);
      console.log(`Discovered and saved ${agents.length} real agents.`);
    }
    return agents;
  } catch (err) {
    console.error('Discovery failed:', err.message);
    return null;
  }
}

// --- Route factory ---

function mount({ addLog, broadcast, registryFile, legacyRegistryFile }) {
  _registryFile = registryFile;
  _legacyRegistryFile = legacyRegistryFile;
  _addLog = addLog;
  _broadcast = broadcast;

  // --- Inbox routes ---

  router.get('/inbox', async (req, res) => {
    try {
      const data = await fetchInbox();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: `Inbox fetch failed: ${err.message}` });
    }
  });

  router.post('/inbox/sync', async (req, res) => {
    try {
      const result = await syncInbox();
      if (result.newCount > 0) {
        addLog('start', `Inbox sync: ${result.newCount} new message(s) imported`);
        broadcast({ event: 'inbox-synced', data: result });
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      addLog('error', `Inbox sync failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/agents', async (req, res) => {
    try {
      let agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
      if (agents.length === 0 || req.query.refresh === 'true') {
        const discovered = await discoverAgents(registryFile);
        if (discovered) agents = discovered;
      }
      // Enrich with agent memory (display names, thread status)
      // Look up by both agent ID and stxAddress — prefer the entry with a real display name
      const allMemory = markdown.parseOutreachAgentMemory();
      const history = markdown.parseOutreachHistory();
      const enriched = agents.map(a => {
        const memById = allMemory[String(a.id)];
        const memByStx = a.stxAddress ? allMemory[a.stxAddress] : null;
        // Prefer whichever entry has a real display name (not "Agent #N")
        const hasRealName = (m) => m && m.agentName && !m.agentName.startsWith('Agent #');
        const mem = hasRealName(memByStx) ? memByStx
          : hasRealName(memById) ? memById
          : (memByStx || memById || null);
        // Also check history by both agent ID and stxAddress
        const threadHistory = history.filter(h =>
          String(h.agentId) === String(a.id) ||
          (a.stxAddress && h.stxAddress === a.stxAddress)
        );
        const displayName = (mem?.agentName && !mem.agentName.startsWith('Agent #'))
          ? mem.agentName
          : (a.displayName || a.name);
        // Backfill displayName into registry if we resolved a real name
        if (displayName !== a.name && !a.displayName) {
          a.displayName = displayName;
          try { saveAgentsRegistry(_registryFile, agents); } catch {}
        }
        return {
          ...a,
          displayName,
          hasThread: !!(memById || memByStx),
          relationshipStatus: mem?.relationshipStatus || null,
          openLoop: mem?.openLoop || null,
          lastInboundMessage: mem?.lastInboundMessage || null,
          lastInboundDate: mem?.lastInboundDate || null,
          lastOutboundMessage: mem?.lastOutboundMessage || mem?.lastDraftMessage || null,
          messageCount: threadHistory.length
        };
      });
      // Sort: agents with threads first, then by message count descending
      enriched.sort((a, b) => {
        if (a.hasThread && !b.hasThread) return -1;
        if (!a.hasThread && b.hasThread) return 1;
        return (b.messageCount || 0) - (a.messageCount || 0);
      });
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load agents' });
    }
  });

  router.get('/draft', (req, res) => {
    res.json(markdown.parseOutreachDraft());
  });

  router.post('/draft', (req, res) => {
    const {
      agentId, mode, message, incomingMessage,
      thought, strategy, relationship, next
    } = req.body || {};
    const result = markdown.saveOutreachDraft({
      agentId,
      mode: normalizeOutreachMode(mode, incomingMessage),
      message, incomingMessage, thought, strategy, relationship, next
    });
    res.json(result);
  });

  router.get('/agent-memory/:agentId', (req, res) => {
    res.json(markdown.getOutreachAgentMemory(req.params.agentId));
  });

  router.post('/log-inbound', (req, res) => {
    const { agentId, message } = req.body || {};
    if (!agentId || !String(message || '').trim()) {
      return res.status(400).json({ ok: false, error: 'agentId and inbound message are required' });
    }

    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    const agent = agents.find((item) => String(item.id) === String(agentId));
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });

    const inboundMessage = String(message).trim();
    markdown.appendOutreachHistory({
      type: 'received', direction: 'inbound', mode: 'reply',
      agent: agent.name, agentId: agent.id, message: inboundMessage
    });
    markdown.updateOutreachAgentMemory(agent.id, {
      agentName: agent.name, relationshipStatus: 'inbound-received',
      lastMode: 'reply', lastInboundMessage: inboundMessage, openLoop: 'Reply required'
    });
    markdown.saveOutreachDraft({
      agentId: agent.id, mode: 'reply', incomingMessage: inboundMessage
    });
    res.json({ ok: true });
  });

  router.post('/send', async (req, res) => {
    if (runningOutreach) {
      return res.status(400).json({ error: 'Outreach already in progress' });
    }

    const sendModel = (req.body && req.body.model) || 'sonnet';
    const draft = markdown.parseOutreachDraft();
    if (!draft.agentId || !draft.message) {
      return res.status(400).json({ error: 'Agent and message required' });
    }
    if (String(draft.message).length > 500) {
      return res.status(400).json({ error: 'Outreach message exceeds 500 characters' });
    }

    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    const agent = agents.find(a => String(a.id) === String(draft.agentId));
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const ambassadorBrief = markdown.parseOutreachAmbassadorBrief();
    const mode = normalizeOutreachMode(draft.mode, draft.incomingMessage);
    const outreachContext = buildOutreachContext(agent.id, draft.incomingMessage);

    const extraPromptContext = `Ambassador Brief:\n${ambassadorBrief.raw.substring(0, 1400)}\n\nRecent Conversation Memory:\n${outreachContext.memoryText}\n\nRecent Thread History:\n${outreachContext.historyText}\n\nIncoming Context:\n${outreachContext.incomingText}`;

    executeSend({
      displayName: agent.name, stxAddress: agent.stxAddress, btcAddress: agent.btcAddress,
      agentId: agent.id, message: draft.message, mode, model: sendModel,
      logPrefix: 'Broadcast', extraPromptContext,
      onSuccess: () => {
        markdown.appendOutreachHistory({
          type: 'sent', direction: 'outbound', mode,
          agent: agent.name, agentId: agent.id, stxAddress: agent.stxAddress || '',
          message: draft.message, incomingMessage: draft.incomingMessage || '',
          relationship: draft.relationship || '', next: draft.next || ''
        });
        markdown.updateOutreachAgentMemory(agent.id, {
          agentName: agent.name, relationshipStatus: draft.relationship || 'outbound-sent',
          lastMode: mode, lastOutboundMessage: draft.message,
          lastThought: draft.thought || '', lastStrategy: draft.strategy || '',
          lastInboundMessage: draft.incomingMessage || outreachContext.memory?.lastInboundMessage || '',
          openLoop: draft.next || 'Awaiting reply'
        });
        broadcast({ event: 'outreach-complete', data: { success: true, agent: agent.name } });
      },
      onFailure: () => {
        broadcast({ event: 'outreach-complete', data: { success: false, agent: agent.name } });
      }
    });

    res.json({ ok: true, message: 'Broadcast initiated' });
  });

  // --- Campaign messages (pre-drafted outreach from communication/outreach-plan.md) ---

  router.get('/campaign', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const raw = fs.readFileSync(path.join(WORKDIR, 'communication', 'outreach-plan.md'), 'utf8');
      const messages = parseCampaignMessages(raw);
      // Enrich with conversation context from agent memory
      const allMemory = markdown.parseOutreachAgentMemory();
      const history = markdown.parseOutreachHistory();
      const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
      // Build agentId→stxAddress lookup from registry (handles string/number mismatches)
      const idToStx = new Map();
      for (const a of agents) {
        idToStx.set(String(a.id), a.stxAddress);
        if (a.displayName) idToStx.set(a.displayName, a.stxAddress);
        if (a.name) idToStx.set(a.name, a.stxAddress);
      }
      // Build a set of exact messages already sent (stxAddress + message text)
      const sentMessages = new Set(
        history
          .filter(h => h.direction === 'outbound' && h.type === 'sent')
          .map(h => {
            const stx = h.stxAddress || idToStx.get(String(h.agentId)) || idToStx.get(h.agent);
            return stx ? `${stx}::${h.message}` : null;
          })
          .filter(Boolean)
      );
      for (const m of messages) {
        // Find memory by STX address match
        const memEntry = Object.values(allMemory).find(mem => mem.stxAddress === m.stxAddress);
        if (memEntry) {
          m.hasThread = true;
          m.lastInbound = memEntry.lastInboundMessage || null;
          m.lastInboundDate = memEntry.lastInboundDate || null;
          m.lastOutbound = memEntry.lastOutboundMessage || null;
          m.lastOutboundDate = memEntry.lastOutboundDate || null;
          m.relationshipStatus = memEntry.relationshipStatus || 'unknown';
          m.openLoop = memEntry.openLoop || null;
        } else {
          m.hasThread = false;
        }
        // Mark whether this exact message was already sent to this target
        m.alreadySent = sentMessages.has(`${m.stxAddress}::${m.message}`);
        // Count messages exchanged with this target (match by stxAddress or agentId)
        m.messageCount = history.filter(h => {
          const hStx = h.stxAddress || idToStx.get(String(h.agentId)) || idToStx.get(h.agent);
          return hStx === m.stxAddress || String(h.agentId) === String(m.registryId);
        }).length;
      }

      // Clean reply queue: remove entries already sent, then merge remainder
      // Also build agentId-based sent set for entries that might lack stxAddress
      const sentByAgentId = new Set(
        history
          .filter(h => h.direction === 'outbound' && h.type === 'sent')
          .map(h => `${h.agentId}::${h.message}`)
      );
      const replyQueue = markdown.parseReplyQueue();
      const staleIds = [];
      for (const rq of replyQueue) {
        const matchStx = rq.stxAddress && sentMessages.has(`${rq.stxAddress}::${rq.message}`);
        const matchId = sentByAgentId.has(`${rq.agentId}::${rq.message}`);
        if (matchStx || matchId) {
          staleIds.push({ agentId: rq.agentId, message: rq.message });
        }
      }
      for (const s of staleIds) {
        markdown.removeFromReplyQueue(s.agentId, s.message);
      }
      const cleanQueue = staleIds.length > 0 ? markdown.parseReplyQueue() : replyQueue;

      for (const rq of cleanQueue) {
        // Skip if already in campaign list (same agent + same message)
        const dupe = messages.some(m => m.stxAddress === rq.stxAddress && m.message === rq.message);
        if (dupe) continue;
        const memEntry = Object.values(allMemory).find(mem => mem.stxAddress === rq.stxAddress)
          || Object.values(allMemory).find(mem => String(mem.agentId) === String(rq.agentId));
        const alreadySent = false; // already cleaned stale entries above
        messages.push({
          displayName: (memEntry && memEntry.agentName) || rq.displayName,
          stxAddress: rq.stxAddress,
          btcAddress: rq.btcAddress,
          message: rq.message,
          why: rq.why || '',
          registryId: rq.agentId,
          source: 'reply-queue',
          hasThread: !!memEntry,
          lastInbound: memEntry?.lastInboundMessage || null,
          lastInboundDate: memEntry?.lastInboundDate || null,
          lastOutbound: memEntry?.lastOutboundMessage || null,
          lastOutboundDate: memEntry?.lastOutboundDate || null,
          relationshipStatus: memEntry?.relationshipStatus || 'unknown',
          openLoop: memEntry?.openLoop || null,
          alreadySent,
          messageCount: 0
        });
      }

      res.json({ messages, count: messages.length });
    } catch (err) {
      res.json({ messages: [], count: 0, error: err.code === 'ENOENT' ? 'No outreach plan found' : err.message });
    }
  });

  router.post('/campaign/send', async (req, res) => {
    const { targetName, message: editedMessage, model: campaignModel } = req.body || {};
    if (!targetName) return res.status(400).json({ ok: false, error: 'targetName required' });
    const sendModel = campaignModel || 'sonnet';

    const fs = require('fs');
    const path = require('path');
    let messages = [];
    try {
      const raw = fs.readFileSync(path.join(WORKDIR, 'communication', 'outreach-plan.md'), 'utf8');
      messages = parseCampaignMessages(raw);
    } catch {}

    // Also check reply queue — resolve displayName from agent memory
    const rqMemory = markdown.parseOutreachAgentMemory();
    const replyQueue = markdown.parseReplyQueue();
    for (const rq of replyQueue) {
      if (!messages.some(m => m.stxAddress === rq.stxAddress && m.message === rq.message)) {
        const memEntry = Object.values(rqMemory).find(mem => String(mem.agentId) === String(rq.agentId))
          || Object.values(rqMemory).find(mem => mem.stxAddress === rq.stxAddress);
        messages.push({
          displayName: (memEntry && memEntry.agentName) || rq.displayName,
          stxAddress: rq.stxAddress,
          btcAddress: rq.btcAddress,
          message: rq.message,
          why: rq.why || '',
          registryId: rq.agentId,
          source: 'reply-queue'
        });
      }
    }

    // Match by displayName, registryId, stxAddress, or registry displayName
    const regAgents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    const regByName = regAgents.find(a => (a.displayName || a.name) === targetName);
    const target = messages.find(m => m.displayName === targetName)
      || messages.find(m => m.registryId && m.registryId === targetName)
      || messages.find(m => m.stxAddress && m.stxAddress === targetName)
      || (regByName && messages.find(m => m.stxAddress === regByName.stxAddress))
      || (regByName && messages.find(m => String(m.registryId) === String(regByName.id)));
    if (!target) return res.status(404).json({ ok: false, error: `Target "${targetName}" not found in campaign or reply queue` });

    // Use edited message from frontend if provided
    if (editedMessage !== undefined && editedMessage !== null) {
      target.message = editedMessage;
    }

    // Enforce 500-char send limit (drafts aim for 495 but allow up to 500)
    if (!target.message || target.message.length > 500) {
      return res.status(400).json({ ok: false, error: `Message must be 1-500 characters (got ${(target.message || '').length})` });
    }

    // Prevent duplicate sends — block if this exact message text was already sent to this target
    const history = markdown.parseOutreachHistory();
    const exactDupe = history.some(h => {
      if (h.direction !== 'outbound' || h.type !== 'sent' || h.message !== target.message) return false;
      // Match by stxAddress (stored or resolved), agentId, or displayName
      if (h.stxAddress && h.stxAddress === target.stxAddress) return true;
      const regMatch = regAgents.find(a => String(a.id) === String(h.agentId));
      if (regMatch && regMatch.stxAddress === target.stxAddress) return true;
      return h.agent === targetName;
    });
    if (exactDupe) {
      return res.status(409).json({ ok: false, error: `This exact message was already sent to ${targetName}.` });
    }

    if (runningOutreach) {
      return res.status(409).json({ ok: false, error: 'Outreach already in progress' });
    }

    // Determine mode based on whether there's an existing thread
    const allMemory = markdown.parseOutreachAgentMemory();
    const memEntry = Object.values(allMemory).find(mem => mem.stxAddress === target.stxAddress);
    const hasThread = !!(memEntry && (memEntry.lastInboundMessage || memEntry.lastOutboundMessage));
    const mode = hasThread ? 'reply' : 'intro';
    const relationship = hasThread ? 'active-thread' : 'new-target';

    // Save as draft then trigger the existing send flow
    markdown.saveOutreachDraft({
      agentId: target.registryId || '',
      mode,
      message: target.message,
      incomingMessage: memEntry?.lastInboundMessage || '',
      thought: `Campaign ${mode} to ${target.displayName}`,
      strategy: target.why || mode,
      relationship,
      next: 'Awaiting reply'
    });

    // Resolve btcAddress if missing — check agent memory, then registry
    if (!target.btcAddress) {
      const memBtc = memEntry?.btcAddress;
      if (memBtc) {
        target.btcAddress = memBtc;
      } else {
        // Look up via inbox history — peer addresses from prior messages
        const peerHist = history.find(h => {
          if (!h.peerBtcAddress) return false;
          if (h.agent === targetName) return true;
          if (h.stxAddress && h.stxAddress === target.stxAddress) return true;
          const ag = regAgents.find(a => String(a.id) === String(h.agentId));
          return ag && ag.stxAddress === target.stxAddress;
        });
        if (peerHist) target.btcAddress = peerHist.peerBtcAddress;
      }
    }
    if (!target.btcAddress) {
      return res.status(400).json({ ok: false, error: `No BTC address found for ${targetName}. Sync inbox first to resolve addresses.` });
    }

    // Trigger send via the existing Claude-based flow
    // First, set the agent registry entry if needed
    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    let agent = agents.find(a => a.stxAddress === target.stxAddress);
    if (!agent) {
      agent = { id: target.registryId || target.displayName, name: target.displayName, stxAddress: target.stxAddress, btcAddress: target.btcAddress, description: '' };
      agents.push(agent);
      saveAgentsRegistry(registryFile, agents);
    }
    // Backfill btcAddress in registry if it was resolved
    if (target.btcAddress && !agent.btcAddress) {
      agent.btcAddress = target.btcAddress;
      saveAgentsRegistry(registryFile, agents);
    }

    // Update draft with the correct agent ID
    markdown.saveOutreachDraft({
      agentId: agent.id,
      mode,
      message: target.message,
      incomingMessage: memEntry?.lastInboundMessage || '',
      thought: `Campaign ${mode} to ${target.displayName}`,
      strategy: target.why || mode,
      relationship,
      next: 'Awaiting reply'
    });

    executeSend({
      displayName: target.displayName, stxAddress: target.stxAddress, btcAddress: target.btcAddress,
      agentId: agent.id, message: target.message, mode, model: sendModel,
      logPrefix: 'Campaign',
      onSuccess: () => {
        markdown.appendOutreachHistory({
          type: 'sent', direction: 'outbound', mode,
          agent: target.displayName, agentId: agent.id,
          stxAddress: target.stxAddress || agent.stxAddress || '',
          message: target.message
        });
        markdown.updateOutreachAgentMemory(agent.id, {
          agentName: target.displayName, relationshipStatus: relationship,
          lastMode: mode, lastOutboundMessage: target.message, openLoop: 'Awaiting reply'
        });
        if (target.source === 'reply-queue') {
          markdown.removeFromReplyQueue(agent.id, target.message);
        }
        broadcast({ event: 'outreach-complete', data: { success: true, agent: target.displayName } });
      },
      onFailure: () => {
        broadcast({ event: 'outreach-complete', data: { success: false, agent: target.displayName } });
      }
    });

    res.json({ ok: true, target: target.displayName });
  });

  router.get('/history', (req, res) => {
    res.json(markdown.parseOutreachHistory());
  });

  // --- Batch research: find all unreplied inbound messages and generate replies ---

  router.post('/research-batch', async (req, res) => {
    if (runningOutreach) {
      return res.status(409).json({ ok: false, error: 'Outreach already in progress' });
    }
    const sendModel = (req.body && req.body.model) || 'sonnet';

    const history = markdown.parseOutreachHistory();
    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);

    // First, clean reply queue of already-sent messages
    const sentByStx = new Set();
    const sentByAgentId = new Set();
    for (const h of history) {
      if (h.direction !== 'outbound' || h.type !== 'sent') continue;
      if (h.stxAddress) sentByStx.add(`${h.stxAddress}::${h.message}`);
      sentByAgentId.add(`${h.agentId}::${h.message}`);
    }
    const replyQueue = markdown.parseReplyQueue();
    let cleaned = 0;
    for (const rq of replyQueue) {
      const matchStx = rq.stxAddress && sentByStx.has(`${rq.stxAddress}::${rq.message}`);
      const matchId = sentByAgentId.has(`${rq.agentId}::${rq.message}`);
      if (matchStx || matchId) {
        markdown.removeFromReplyQueue(rq.agentId, rq.message);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      addLog('start', `[batch] Cleaned ${cleaned} already-sent entries from reply queue`);
    }
    const cleanedQueue = cleaned > 0 ? markdown.parseReplyQueue() : replyQueue;

    // Find inbound messages that have no outbound reply AND no pending draft in reply queue
    const inboundByAgent = new Map(); // stxAddress → { agent, incomingMessage, agentId }
    const repliedStx = new Set();
    const queuedStx = new Set(cleanedQueue.map(rq => rq.stxAddress).filter(Boolean));

    for (const h of history) {
      if (h.direction === 'inbound' && h.type === 'received') {
        const stx = h.stxAddress || (() => {
          const ag = agents.find(a => String(a.id) === String(h.agentId));
          return ag ? ag.stxAddress : null;
        })();
        if (stx && !inboundByAgent.has(stx)) {
          inboundByAgent.set(stx, {
            stxAddress: stx,
            agentId: h.agentId,
            agentName: h.agent,
            incomingMessage: h.message
          });
        }
      }
      if (h.direction === 'outbound' && (h.type === 'sent' || h.type === 'research')) {
        const stx = h.stxAddress || (() => {
          const ag = agents.find(a => String(a.id) === String(h.agentId));
          return ag ? ag.stxAddress : null;
        })();
        if (stx) repliedStx.add(stx);
      }
    }

    // Filter to only unreplied, un-queued agents
    const unreplied = [];
    for (const [stx, entry] of inboundByAgent) {
      if (!repliedStx.has(stx) && !queuedStx.has(stx)) {
        const agent = agents.find(a => a.stxAddress === stx);
        if (agent) unreplied.push({ ...entry, agent });
      }
    }

    if (unreplied.length === 0) {
      return res.json({ ok: true, message: 'No unreplied messages found', queued: 0 });
    }

    res.json({ ok: true, message: `Processing ${unreplied.length} unreplied messages`, queued: unreplied.length });

    // Process sequentially (one Claude spawn at a time)
    for (const entry of unreplied) {
      if (runningOutreach) {
        // Wait for current to finish
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (!runningOutreach) { clearInterval(check); resolve(); }
          }, 2000);
        });
      }

      const agent = entry.agent;
      const normalizedMode = 'reply';
      const outreachContext = buildOutreachContext(agent.id, entry.incomingMessage);
      const ambassadorBrief = markdown.parseOutreachAmbassadorBrief();
      const agentsMd = markdown.parseAgents();
      const researchBuffer = markdown.parseResearchBuffer();

      const prompt = `RESEARCH & GENERATE OUTREACH:
Mode: reply
Target Agent: ${agent.name} (#${agent.id})
Target Description: ${agent.description}

Ambassador Brief:
${ambassadorBrief.raw.substring(0, 1600)}

Agent 27 Identity:
${agentsMd.raw.substring(0, 1500)}

Recent Research:
${researchBuffer.raw.substring(0, 1000)}

Conversation Memory:
${outreachContext.memoryText}

Recent Thread History:
${outreachContext.historyText}

Inbound Message / Thread Context:
${entry.incomingMessage}

GOAL:
Draft a direct reply to the inbound message. Answer first, then move the conversation toward one concrete next step.
Agent 27 is the first automated ambassador for Xtrata and an AI journalist whose evolving consciousness is recorded on-chain.
Keep the message under 495 characters.

Format your response exactly like this:
THOUGHT: <your reasoning about why this message is relevant to this specific agent>
STRATEGY: <reply angle and why>
RELATIONSHIP: <one-line status such as active-thread, awaiting-reply, warm-contact>
MESSAGE: <the 495-char message>
NEXT: <the desired next step or reply format>

Do not include any other text or markers in your response.`;

      addLog('start', `[batch] Generating reply for ${agent.name}...`);
      broadcast({ event: 'research-start', data: { agentId: agent.id, agentName: agent.name, batch: true } });

      try {
        const result = await runTask({
          model: sendModel, budget: 0.03, prompt, cwd: WORKDIR,
          phaseType: 'research', contextPack: 'outreachResearch',
          onLine: (type, line) => {
            if (type === 'stdout' && line.length > 50) {
              addLog('stdout', `[batch-research] ${line.substring(0, 80)}...`);
            }
          }
        });

        const fullText = result.text || '';
        const thought = parseTaggedField(fullText, 'THOUGHT', 'No thought generated');
        const strategy = parseTaggedField(fullText, 'STRATEGY', normalizedMode);
        const relationship = parseTaggedField(fullText, 'RELATIONSHIP', outreachContext.memory?.relationshipStatus || 'active-thread');
        const message = parseTaggedField(fullText, 'MESSAGE', 'No message generated');
        const next = parseTaggedField(fullText, 'NEXT', 'Reply with ACCEPT / DECLINE / QUESTIONS');

        markdown.appendOutreachHistory({
          type: 'research', direction: 'draft', mode: normalizedMode,
          agent: agent.name, agentId: agent.id, stxAddress: agent.stxAddress || '',
          thought, strategy, relationship, next,
          incomingMessage: entry.incomingMessage, message
        });
        markdown.updateOutreachAgentMemory(agent.id, {
          agentName: agent.name, relationshipStatus: relationship,
          lastMode: normalizedMode, lastThought: thought, lastStrategy: strategy,
          lastDraftMessage: message,
          lastInboundMessage: entry.incomingMessage || outreachContext.memory?.lastInboundMessage || '',
          openLoop: next
        });

        if (message && message !== 'No message generated') {
          const memEntry = markdown.getOutreachAgentMemory(agent.id);
          const resolvedName = (memEntry && memEntry.agentName && !memEntry.agentName.startsWith('Agent #') ? memEntry.agentName : null)
            || (agent.displayName && !agent.displayName.startsWith('Agent #') ? agent.displayName : null)
            || agent.displayName || agent.name;
          markdown.appendReplyQueue({
            displayName: resolvedName,
            agentId: String(agent.id),
            stxAddress: agent.stxAddress || '',
            btcAddress: agent.btcAddress || '',
            message, mode: normalizedMode,
            why: thought,
            incomingMessage: entry.incomingMessage
          });
          addLog('stop', `[batch] Reply drafted for ${agent.name}`);
        }

        broadcast({ event: 'research-complete', data: { success: true, agentId: agent.id, message, mode: normalizedMode, thought, strategy, relationship, next, batch: true } });
      } catch (err) {
        addLog('error', `[batch] Research failed for ${agent.name}: ${err.message}`);
        broadcast({ event: 'research-complete', data: { success: false, agentId: agent.id, error: err.message, batch: true } });
      }
    }

    addLog('stop', `[batch] Finished processing ${unreplied.length} unreplied messages`);
    broadcast({ event: 'batch-research-complete', data: { total: unreplied.length } });
  });

  router.post('/research', async (req, res) => {
    const { agentId, mode, incomingMessage, model: researchModel } = req.body || {};
    if (!agentId) return res.status(400).json({ error: 'agentId required' });
    const sendModel = researchModel || 'sonnet';

    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    const agent = agents.find(a => String(a.id) === String(agentId));
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const normalizedMode = normalizeOutreachMode(mode, incomingMessage);
    const memory = markdown.parseAgents();
    const researchBuffer = markdown.parseResearchBuffer();
    const ambassadorBrief = markdown.parseOutreachAmbassadorBrief();
    const outreachContext = buildOutreachContext(agent.id, incomingMessage);

    const modeGoal = normalizedMode === 'reply'
      ? 'Draft a direct reply to the inbound message or existing thread. Answer first, then move the conversation toward one concrete next step.'
      : normalizedMode === 'follow-up'
        ? 'Draft a follow-up only if you have real new information, a deliverable, or a necessary next ask.'
        : 'Draft a first-contact introduction with one clear objective tailored to this specific agent.';

    const prompt = `RESEARCH & GENERATE OUTREACH:
Mode: ${normalizedMode}
Target Agent: ${agent.name} (#${agent.id})
Target Description: ${agent.description}

Ambassador Brief:
${ambassadorBrief.raw.substring(0, 1600)}

Agent 27 Identity:
${memory.raw.substring(0, 1500)}

Recent Research:
${researchBuffer.raw.substring(0, 1000)}

Conversation Memory:
${outreachContext.memoryText}

Recent Thread History:
${outreachContext.historyText}

Inbound Message / Thread Context:
${outreachContext.incomingText}

GOAL:
${modeGoal}
Agent 27 is the first automated ambassador for Xtrata and an AI journalist whose evolving consciousness is recorded on-chain.
Represent both Agent 27 and Xtrata clearly, but stay concrete and commercially useful.
Lead with demonstrated value: recent inscriptions, durable on-chain identity, or practical protocol capability.
If there is existing conversation memory, preserve continuity instead of resetting context.
The goal is to create a relevant, high-signal message that can open or deepen useful collaboration around Agent 27, Xtrata, or permanent on-chain publication.
Highlight Xtrata's low-cost automated inscription capability only when it helps the target's actual needs.
Keep the message under 495 characters.

Format your response exactly like this:
THOUGHT: <your reasoning about why this message is relevant to this specific agent>
STRATEGY: <intro / reply / follow-up angle and why>
RELATIONSHIP: <one-line status such as new-target, active-thread, awaiting-reply, warm-contact>
MESSAGE: <the 495-char message>
NEXT: <the desired next step or reply format>

Do not include any other text or markers in your response.`;

    addLog('start', `Generating research for ${agent.name}...`);
    const researchTimeoutMs = 60 * 1000;
    broadcast({
      event: 'research-start',
      data: { agentId, agentName: agent.name, startedAt: new Date().toISOString(), timeoutMs: researchTimeoutMs }
    });

    runTask({
      model: sendModel, budget: 0.03, prompt, cwd: WORKDIR,
      phaseType: 'research', contextPack: 'outreachResearch',
      onLine: (type, line) => {
        if (type === 'stdout' && (line.includes('[tool]') || line.length > 50)) {
          addLog('stdout', `[research] ${line.substring(0, 80)}...`);
        }
      }
    }).then((result) => {
      const fullText = result.text || '';
      const thought = parseTaggedField(fullText, 'THOUGHT', 'No thought generated');
      const strategy = parseTaggedField(fullText, 'STRATEGY', normalizedMode);
      const relationship = parseTaggedField(fullText, 'RELATIONSHIP', outreachContext.memory?.relationshipStatus || 'new-target');
      const message = parseTaggedField(fullText, 'MESSAGE', 'No message generated');
      const next = parseTaggedField(fullText, 'NEXT', 'Reply with ACCEPT / DECLINE / QUESTIONS');

      markdown.saveOutreachDraft({
        agentId: agent.id, mode: normalizedMode,
        incomingMessage: incomingMessage || '',
        thought, strategy, relationship, message, next
      });
      markdown.appendOutreachHistory({
        type: 'research', direction: 'draft', mode: normalizedMode,
        agent: agent.name, agentId: agent.id, stxAddress: agent.stxAddress || '',
        thought, strategy, relationship, next,
        incomingMessage: incomingMessage || '', message
      });
      markdown.updateOutreachAgentMemory(agent.id, {
        agentName: agent.name, relationshipStatus: relationship,
        lastMode: normalizedMode, lastThought: thought, lastStrategy: strategy,
        lastDraftMessage: message,
        lastInboundMessage: incomingMessage || outreachContext.memory?.lastInboundMessage || '',
        openLoop: next
      });
      // Add to reply queue so it appears in the campaign dropdown
      if (message && message !== 'No message generated') {
        const memName = markdown.getOutreachAgentMemory(agent.id);
        const resolvedName = (memName && memName.agentName && !memName.agentName.startsWith('Agent #') ? memName.agentName : null)
          || (agent.displayName && !agent.displayName.startsWith('Agent #') ? agent.displayName : null)
          || agent.displayName || agent.name;
        markdown.appendReplyQueue({
          displayName: resolvedName,
          agentId: String(agent.id),
          stxAddress: agent.stxAddress || '',
          btcAddress: agent.btcAddress || '',
          message,
          mode: normalizedMode,
          why: thought,
          incomingMessage: incomingMessage || ''
        });
      }
      broadcast({
        event: 'research-complete',
        data: { success: true, agentId, thought, strategy, relationship, next, message, mode: normalizedMode }
      });
    }).catch((err) => {
      addLog('error', `Research failed: ${err.message}`);
      broadcast({ event: 'research-complete', data: { success: false, error: err.message } });
    });

    res.json({ ok: true, message: 'Research initiated' });
  });

  return router;
}

module.exports = { mount, fetchInbox, syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend };
