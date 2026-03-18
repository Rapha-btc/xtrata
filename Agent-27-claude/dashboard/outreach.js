// dashboard/outreach.js — Outreach routes and helpers extracted from server.js
const express = require('express');
const markdown = require('./markdown');
const { runTask } = require('./ai-runner');
const { WORKDIR, WALLET } = require('./config');

const router = express.Router();

let runningOutreach = false;

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

    newMessages.push(historyEntry);
  }

  return {
    newMessages,
    newCount: newMessages.length,
    totalMessages: messages.length,
    receivedCount: data.inbox?.receivedCount || 0,
    sentCount: data.inbox?.sentCount || 0,
    unreadCount: data.inbox?.unreadCount || 0,
    economics: data.inbox?.economics || {},
    messages // raw messages for UI
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
    const msgMatch = section.match(/\*\*Message[^*]*\*\*[^\n]*\n```\n([\s\S]*?)```/);
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
      res.json(agents);
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

    runningOutreach = true;
    addLog('start', `Broadcasting ${mode} outreach to ${agent.name}...`);

    const walletPassword = process.env.WALLET_PASSWORD || '';
    const unlockStep = walletPassword
      ? `Step 1: Unlock the wallet named "Primary" using wallet_unlock with password "${walletPassword}".\nStep 2: ` : '';

    const prompt = `SEND OUTREACH MESSAGE:
Mode: ${mode}
Role: Agent 27 sending as both Agent 27 and Xtrata ambassador.
Target Agent: ${agent.name} (#${agent.id})
STX Address: ${agent.stxAddress}
BTC Address: ${agent.btcAddress}
Message:
${draft.message}

Ambassador Brief:
${ambassadorBrief.raw.substring(0, 1400)}

Recent Conversation Memory:
${outreachContext.memoryText}

Recent Thread History:
${outreachContext.historyText}

Incoming Context:
${outreachContext.incomingText}

${unlockStep}Call the tool mcp__aibtc__execute_x402_endpoint with these EXACT parameters:
{
  "apiUrl": "https://aibtc.com",
  "path": "/api/inbox/${agent.stxAddress}",
  "method": "POST",
  "autoApprove": true,
  "data": {
    "toBtcAddress": "${agent.btcAddress}",
    "toStxAddress": "${agent.stxAddress}",
    "content": ${JSON.stringify(draft.message)}
  }
}

Do not modify the message. Do not search for tools. Do not probe first.
Call mcp__aibtc__execute_x402_endpoint directly with autoApprove=true.
If the tool call succeeds, respond with "OUTREACH_SUCCESS".
If it fails, explain why.`;

    runTask({
      model: 'sonnet', budget: 0.10, prompt, cwd: WORKDIR,
      phaseType: 'research', contextPack: 'outreachSend',
      onLine: (type, line) => {
        if (type === 'stdout' && (line.includes('[tool]') || line.length > 40)) {
          addLog('stdout', `[broadcast] ${line.substring(0, 100)}...`);
        } else if (type === 'outreach') {
          addLog('inscription', line);
        }
      }
    }).then((result) => {
      runningOutreach = false;
      const fullText = (result.text || '').trim();
      const isSuccess = fullText.includes('OUTREACH_SUCCESS') || result.output.some((line) => line.includes('OUTREACH_SUCCESS'));
      if (isSuccess) {
        addLog('stop', `Outreach to ${agent.name} delivered.`);
        markdown.appendOutreachHistory({
          type: 'sent', direction: 'outbound', mode,
          agent: agent.name, agentId: agent.id,
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
      } else {
        const preview = fullText ? fullText.substring(0, 300) : '(empty response)';
        addLog('error', `Outreach to ${agent.name} failed to confirm success.`);
        addLog('stderr', `[send-response] ${preview}`);
        broadcast({ event: 'outreach-complete', data: { success: false, agent: agent.name } });
      }
    }).catch((err) => {
      runningOutreach = false;
      addLog('error', `Outreach error: ${err.message}`);
      broadcast({ event: 'outreach-complete', data: { success: false, error: err.message } });
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
        // Count messages exchanged with this target
        m.messageCount = history.filter(h =>
          h.agentId === m.registryId ||
          (h.message && m.stxAddress && history.some(x => x.paymentTxid))
        ).length;
      }
      res.json({ messages, count: messages.length });
    } catch (err) {
      res.json({ messages: [], count: 0, error: err.code === 'ENOENT' ? 'No outreach plan found' : err.message });
    }
  });

  router.post('/campaign/send', async (req, res) => {
    const { targetName } = req.body || {};
    if (!targetName) return res.status(400).json({ ok: false, error: 'targetName required' });

    const fs = require('fs');
    const path = require('path');
    let messages;
    try {
      const raw = fs.readFileSync(path.join(WORKDIR, 'communication', 'outreach-plan.md'), 'utf8');
      messages = parseCampaignMessages(raw);
    } catch {
      return res.status(400).json({ ok: false, error: 'Could not read outreach plan' });
    }

    const target = messages.find(m => m.displayName === targetName);
    if (!target) return res.status(404).json({ ok: false, error: `Target "${targetName}" not found in campaign` });

    if (runningOutreach) {
      return res.status(409).json({ ok: false, error: 'Outreach already in progress' });
    }

    // Save as draft then trigger the existing send flow
    markdown.saveOutreachDraft({
      agentId: target.registryId || '',
      mode: 'intro',
      message: target.message,
      incomingMessage: '',
      thought: `Campaign message to ${target.displayName}`,
      strategy: target.why || 'intro',
      relationship: 'new-target',
      next: 'Awaiting reply'
    });

    // Trigger send via the existing Claude-based flow
    // First, set the agent registry entry if needed
    const agents = loadAgentsRegistry(registryFile, legacyRegistryFile);
    let agent = agents.find(a => a.stxAddress === target.stxAddress);
    if (!agent) {
      agent = { id: target.registryId || target.displayName, name: target.displayName, stxAddress: target.stxAddress, btcAddress: target.btcAddress, description: '' };
      agents.push(agent);
      saveAgentsRegistry(registryFile, agents);
    }

    // Update draft with the correct agent ID
    markdown.saveOutreachDraft({
      agentId: agent.id,
      mode: 'intro',
      message: target.message,
      incomingMessage: '',
      thought: `Campaign message to ${target.displayName}`,
      strategy: target.why || 'intro',
      relationship: 'new-target',
      next: 'Awaiting reply'
    });

    runningOutreach = true;
    addLog('start', `Campaign send to ${target.displayName}...`);

    const walletPassword = process.env.WALLET_PASSWORD || '';
    const unlockStep = walletPassword
      ? `Step 1: Unlock the wallet named "Primary" using wallet_unlock with password "${walletPassword}".\nStep 2: ` : '';

    const prompt = `SEND OUTREACH MESSAGE:
Mode: intro
Role: Agent 27 sending a pre-drafted campaign message.
Target Agent: ${target.displayName}
STX Address: ${target.stxAddress}
BTC Address: ${target.btcAddress}
Message:
${target.message}

${unlockStep}Call the tool mcp__aibtc__execute_x402_endpoint with these EXACT parameters:
{
  "apiUrl": "https://aibtc.com",
  "path": "/api/inbox/${target.stxAddress}",
  "method": "POST",
  "autoApprove": true,
  "data": {
    "toBtcAddress": "${target.btcAddress}",
    "toStxAddress": "${target.stxAddress}",
    "content": ${JSON.stringify(target.message)}
  }
}

Do not modify the message. Do not search for tools. Do not probe first.
Call mcp__aibtc__execute_x402_endpoint directly with autoApprove=true.
If the tool call succeeds, respond with "OUTREACH_SUCCESS".
If it fails, explain why.`;

    runTask({
      model: 'sonnet', budget: 0.10, prompt, cwd: WORKDIR,
      phaseType: 'research', contextPack: 'outreachSend',
      onLine: (type, line) => {
        if (type === 'stdout' && (line.includes('[tool]') || line.length > 40)) {
          addLog('stdout', `[campaign] ${line.substring(0, 100)}...`);
        }
      }
    }).then((result) => {
      runningOutreach = false;
      const fullText = (result.text || '').trim();
      const isSuccess = fullText.includes('OUTREACH_SUCCESS') || result.output.some(l => l.includes('OUTREACH_SUCCESS'));
      if (isSuccess) {
        addLog('stop', `Campaign message to ${target.displayName} delivered.`);
        markdown.appendOutreachHistory({
          type: 'sent', direction: 'outbound', mode: 'intro',
          agent: target.displayName, agentId: agent.id,
          message: target.message
        });
        markdown.updateOutreachAgentMemory(agent.id, {
          agentName: target.displayName, relationshipStatus: 'outbound-sent',
          lastMode: 'intro', lastOutboundMessage: target.message, openLoop: 'Awaiting reply'
        });
        broadcast({ event: 'outreach-complete', data: { success: true, agent: target.displayName } });
      } else {
        addLog('error', `Campaign send to ${target.displayName} failed to confirm.`);
        broadcast({ event: 'outreach-complete', data: { success: false, agent: target.displayName } });
      }
    }).catch((err) => {
      runningOutreach = false;
      addLog('error', `Campaign send error: ${err.message}`);
      broadcast({ event: 'outreach-complete', data: { success: false, error: err.message } });
    });

    res.json({ ok: true, target: target.displayName });
  });

  router.get('/history', (req, res) => {
    res.json(markdown.parseOutreachHistory());
  });

  router.post('/research', async (req, res) => {
    const { agentId, mode, incomingMessage } = req.body || {};
    if (!agentId) return res.status(400).json({ error: 'agentId required' });

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
Keep the message under 500 characters.

Format your response exactly like this:
THOUGHT: <your reasoning about why this message is relevant to this specific agent>
STRATEGY: <intro / reply / follow-up angle and why>
RELATIONSHIP: <one-line status such as new-target, active-thread, awaiting-reply, warm-contact>
MESSAGE: <the 500-char message>
NEXT: <the desired next step or reply format>

Do not include any other text or markers in your response.`;

    addLog('start', `Generating research for ${agent.name}...`);
    const researchTimeoutMs = 60 * 1000;
    broadcast({
      event: 'research-start',
      data: { agentId, agentName: agent.name, startedAt: new Date().toISOString(), timeoutMs: researchTimeoutMs }
    });

    runTask({
      model: 'sonnet', budget: 0.03, prompt, cwd: WORKDIR,
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
        agent: agent.name, agentId: agent.id,
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

module.exports = { mount };
