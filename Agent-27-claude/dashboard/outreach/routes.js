// dashboard/outreach/routes.js — Simplified outreach router
const express = require('express');
const store = require('./store');
const agents = require('./agents');
const messaging = require('./messaging');
const { WORKDIR, WALLET, REGISTERED_AGENTS_FILE } = require('../config');

const router = express.Router();
const INBOX_API = `https://aibtc.com/api/inbox/${WALLET}`;

let _addLog = () => {};
let _broadcast = () => {};

// --- Inbox fetch ---

async function fetchInbox() {
  const res = await fetch(INBOX_API);
  if (!res.ok) throw new Error(`Inbox API returned ${res.status}`);
  return res.json();
}

// --- Inbox sync ---

async function syncInbox() {
  const data = await fetchInbox();
  const messages = (data.inbox && data.inbox.messages) || [];
  const existingHistory = store.parseOutreachHistory();

  const knownTxids = new Set();
  for (const h of existingHistory) {
    if (h.paymentTxid) knownTxids.add(h.paymentTxid);
    if (h.messageId) knownTxids.add(h.messageId);
  }

  const newMessages = [];
  const sorted = [...messages].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  for (const msg of sorted) {
    if (knownTxids.has(msg.paymentTxid) || knownTxids.has(msg.messageId)) continue;

    const isInbound = msg.direction === 'received';
    const peerName = msg.peerDisplayName || msg.fromAddress || 'Unknown';
    const peerStx = isInbound ? msg.fromAddress : msg.toStxAddress;

    const allAgents = agents.loadAgentsRegistry();
    const agent = allAgents.find(a => a.stxAddress === peerStx);
    const memoryMatch = peerStx
      ? Object.values(store.parseOutreachAgentMemory()).find((entry) => entry.stxAddress === peerStx)
      : null;
    const agentId = agent
      ? String(agent.id)
      : memoryMatch?.agentId
        ? String(memoryMatch.agentId)
        : peerStx;

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
      sentAt: msg.sentAt,
      peerBtcAddress: isInbound ? (msg.peerBtcAddress || '') : (msg.toBtcAddress || ''),
      toBtcAddress: msg.toBtcAddress || ''
    };

    store.appendOutreachHistory(historyEntry);

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
    store.updateOutreachAgentMemory(agentId, memoryPatch);

    // Backfill btcAddress and displayName into registry
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
      if (dirty) agents.saveAgentsRegistry(REGISTERED_AGENTS_FILE, allAgents);
    }

    newMessages.push(historyEntry);
  }

  // Backfill locally-sent messages not in API response
  const apiTxids = new Set(messages.map(m => m.paymentTxid).filter(Boolean));
  const apiMsgIds = new Set(messages.map(m => m.messageId).filter(Boolean));
  const allHistory = store.parseOutreachHistory();
  for (const h of allHistory) {
    if (h.direction !== 'outbound' || h.type !== 'sent') continue;
    if (h.paymentTxid && apiTxids.has(h.paymentTxid)) continue;
    if (h.messageId && apiMsgIds.has(h.messageId)) continue;
    if (!h.message) continue;
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
  messages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  return {
    newMessages,
    newCount: newMessages.length,
    totalMessages: messages.length,
    receivedCount: data.inbox?.receivedCount || 0,
    sentCount: data.inbox?.sentCount || 0,
    unreadCount: data.inbox?.unreadCount || 0,
    economics: data.inbox?.economics || {},
    messages
  };
}

// --- Route factory ---

function mount({ addLog, broadcast }) {
  _addLog = addLog;
  _broadcast = broadcast;
  messaging.initMessaging({ addLog, broadcast });

  // GET /inbox — raw inbox from aibtc.com
  router.get('/inbox', async (req, res) => {
    try {
      const data = await fetchInbox();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: `Inbox fetch failed: ${err.message}` });
    }
  });

  // POST /inbox/sync — sync inbox → history + memory
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

  // GET /agents — list agents with enrichment
  router.get('/agents', async (req, res) => {
    try {
      let allAgents = agents.loadAgentsRegistry();
      if (allAgents.length === 0 || req.query.refresh === 'true') {
        const discovered = await agents.discoverAgents();
        if (discovered) allAgents = discovered;
      }
      const allMemory = store.parseOutreachAgentMemory();
      const history = store.parseOutreachHistory();
      const enriched = allAgents.map(a => {
        const memById = allMemory[String(a.id)];
        const memByStx = a.stxAddress ? allMemory[a.stxAddress] : null;
        const hasRealName = (m) => m && m.agentName && !m.agentName.startsWith('Agent #');
        const mem = hasRealName(memByStx) ? memByStx
          : hasRealName(memById) ? memById
          : (memByStx || memById || null);
        const threadHistory = history.filter(h =>
          String(h.agentId) === String(a.id) ||
          (a.stxAddress && h.stxAddress === a.stxAddress)
        );
        const displayName = (mem?.agentName && !mem.agentName.startsWith('Agent #'))
          ? mem.agentName
          : (a.displayName || a.name);
        if (displayName !== a.name && !a.displayName) {
          a.displayName = displayName;
          try { agents.saveAgentsRegistry(REGISTERED_AGENTS_FILE, allAgents); } catch {}
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

  // GET /threads/:agentId — thread view: history + memory + draft for one agent
  router.get('/threads/:agentId', (req, res) => {
    const agentId = req.params.agentId;
    const resolved = agents.resolveAgent(agentId);
    if (!resolved) return res.status(404).json({ error: 'Agent not found' });
    const context = messaging.buildOutreachContext(agentId);
    const draft = store.getDraft(agentId);
    res.json({
      agent: resolved.agent,
      memory: resolved.memory,
      history: context.history,
      draft
    });
  });

  // GET /drafts — list all pending drafts
  router.get('/drafts', (req, res) => {
    const drafts = store.listDrafts();
    // Also include reply queue entries as drafts
    const replyQueue = store.parseReplyQueue();
    for (const rq of replyQueue) {
      const existing = drafts.find(d => String(d.agentId) === String(rq.agentId));
      if (!existing) {
        drafts.push({
          agentId: rq.agentId,
          displayName: rq.displayName,
          stxAddress: rq.stxAddress,
          btcAddress: rq.btcAddress,
          message: rq.message,
          mode: rq.mode || 'reply',
          thought: rq.why || '',
          incomingMessage: rq.incomingMessage || '',
          source: 'auto-converse',
          lastUpdated: rq.queuedAt
        });
      }
    }
    res.json(drafts);
  });

  // POST /drafts/:agentId — save/edit draft
  router.post('/drafts/:agentId', (req, res) => {
    const { mode, message, incomingMessage, thought, strategy, relationship, next } = req.body || {};
    const result = store.saveDraft(req.params.agentId, {
      mode: messaging.normalizeOutreachMode(mode, incomingMessage),
      message, incomingMessage, thought, strategy, relationship, next
    });
    res.json(result);
  });

  // POST /drafts/:agentId/send — send a draft
  router.post('/drafts/:agentId/send', async (req, res) => {
    if (messaging.isRunning()) {
      return res.status(409).json({ error: 'Outreach already in progress' });
    }

    const agentId = req.params.agentId;
    const resolved = agents.resolveAgent(agentId);
    if (!resolved) return res.status(404).json({ error: 'Agent not found' });
    const { agent } = resolved;

    // Get message from draft, reply queue, or request body
    const draft = store.getDraft(agentId);
    const replyQueueEntry = store.parseReplyQueue().find(rq => String(rq.agentId) === String(agentId));
    const messageText = (req.body && req.body.message) || draft?.message || replyQueueEntry?.message;
    const mode = (req.body && req.body.mode) || draft?.mode || replyQueueEntry?.mode || 'intro';
    const paymentTxid = (req.body && req.body.paymentTxid) || draft?.paymentTxid || replyQueueEntry?.paymentTxid || '';

    if (!messageText) {
      return res.status(400).json({ error: 'No message found in draft or request body' });
    }
    if (messageText.length > 500) {
      return res.status(400).json({ error: `Message exceeds 500 characters (got ${messageText.length})` });
    }

    // Resolve BTC address
    let btcAddress = agent.btcAddress;
    if (!btcAddress) {
      const mem = store.getOutreachAgentMemory(agentId);
      btcAddress = mem?.btcAddress || replyQueueEntry?.btcAddress || '';
    }
    if (!btcAddress) {
      const history = store.parseOutreachHistory();
      const peerHist = history.find(h =>
        (h.peerBtcAddress || h.toBtcAddress) &&
        (h.stxAddress === agent.stxAddress || String(h.agentId) === String(agent.id))
      );
      if (peerHist) btcAddress = peerHist.peerBtcAddress || peerHist.toBtcAddress;
    }
    if (!btcAddress) {
      return res.status(400).json({ error: `No BTC address found for ${agent.displayName || agent.name}. Sync inbox first.` });
    }

    // Duplicate check
    const history = store.parseOutreachHistory();
    const exactDupe = history.some(h =>
      h.direction === 'outbound' && h.type === 'sent' &&
      h.message === messageText &&
      (h.stxAddress === agent.stxAddress || String(h.agentId) === String(agent.id))
    );
    if (exactDupe) {
      return res.status(409).json({ error: `This exact message was already sent to ${agent.displayName || agent.name}.` });
    }

    res.json({ ok: true, message: 'Send initiated' });

    // Fire and forget — sendMessage handles all bookkeeping
    messaging.sendMessage({
      displayName: agent.displayName || agent.name,
      stxAddress: agent.stxAddress,
      btcAddress,
      agentId: agent.id,
      message: messageText,
      mode,
      paymentTxid,
      logPrefix: 'Outreach'
    });
  });

  // POST /drafts/:agentId/research — AI-generate a draft
  router.post('/drafts/:agentId/research', async (req, res) => {
    const agentId = req.params.agentId;
    const resolved = agents.resolveAgent(agentId);
    if (!resolved) return res.status(404).json({ error: 'Agent not found' });
    const { agent } = resolved;

    const { mode, incomingMessage, model } = req.body || {};

    addLog('start', `Generating research for ${agent.name}...`);
    broadcast({
      event: 'research-start',
      data: { agentId, agentName: agent.name, startedAt: new Date().toISOString() }
    });

    res.json({ ok: true, message: 'Research initiated' });

    try {
      const draft = await messaging.generateDraft({
        agent, mode, incomingMessage, model: model || 'sonnet'
      });

      // Save as keyed draft
      store.saveDraft(agentId, {
        mode: draft.mode,
        message: draft.message,
        incomingMessage: incomingMessage || '',
        thought: draft.thought,
        strategy: draft.strategy,
        relationship: draft.relationship,
        next: draft.next
      });

      // Also add to reply queue for campaign view compat
      if (draft.message && draft.message !== 'No message generated') {
        const memEntry = store.getOutreachAgentMemory(agentId);
        const resolvedName = (memEntry?.agentName && !memEntry.agentName.startsWith('Agent #') ? memEntry.agentName : null)
          || (agent.displayName && !agent.displayName.startsWith('Agent #') ? agent.displayName : null)
          || agent.displayName || agent.name;
        store.appendReplyQueue({
          displayName: resolvedName,
          agentId: String(agent.id),
          stxAddress: agent.stxAddress || '',
          btcAddress: agent.btcAddress || '',
          message: draft.message,
          mode: draft.mode,
          why: draft.thought,
          incomingMessage: incomingMessage || ''
        });
      }

      broadcast({
        event: 'research-complete',
        data: { success: true, agentId, ...draft }
      });
    } catch (err) {
      addLog('error', `Research failed: ${err.message}`);
      broadcast({ event: 'research-complete', data: { success: false, error: err.message } });
    }
  });

  // POST /research-batch — batch generate for unreplied messages
  router.post('/research-batch', async (req, res) => {
    if (messaging.isRunning()) {
      return res.status(409).json({ ok: false, error: 'Outreach already in progress' });
    }
    const sendModel = (req.body && req.body.model) || 'sonnet';

    const history = store.parseOutreachHistory();
    const allAgents = agents.loadAgentsRegistry();

    // Clean reply queue of already-sent messages
    const sentByStx = new Set();
    const sentByAgentId = new Set();
    for (const h of history) {
      if (h.direction !== 'outbound' || h.type !== 'sent') continue;
      if (h.stxAddress) sentByStx.add(`${h.stxAddress}::${h.message}`);
      sentByAgentId.add(`${h.agentId}::${h.message}`);
    }
    const replyQueue = store.parseReplyQueue();
    let cleaned = 0;
    for (const rq of replyQueue) {
      const matchStx = rq.stxAddress && sentByStx.has(`${rq.stxAddress}::${rq.message}`);
      const matchId = sentByAgentId.has(`${rq.agentId}::${rq.message}`);
      if (matchStx || matchId) {
        store.removeFromReplyQueue(rq.agentId, rq.message);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      addLog('start', `[batch] Cleaned ${cleaned} already-sent entries from reply queue`);
    }
    const cleanedQueue = cleaned > 0 ? store.parseReplyQueue() : replyQueue;

    // Find unreplied inbound messages
    const inboundByAgent = new Map();
    const repliedStx = new Set();
    const queuedStx = new Set(cleanedQueue.map(rq => rq.stxAddress).filter(Boolean));

    for (const h of history) {
      if (h.direction === 'inbound' && h.type === 'received') {
        const stx = h.stxAddress || (() => {
          const ag = allAgents.find(a => String(a.id) === String(h.agentId));
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
          const ag = allAgents.find(a => String(a.id) === String(h.agentId));
          return ag ? ag.stxAddress : null;
        })();
        if (stx) repliedStx.add(stx);
      }
    }

    const unreplied = [];
    for (const [stx, entry] of inboundByAgent) {
      if (!repliedStx.has(stx) && !queuedStx.has(stx)) {
        const agent = allAgents.find(a => a.stxAddress === stx);
        if (agent) unreplied.push({ ...entry, agent });
      }
    }

    if (unreplied.length === 0) {
      return res.json({ ok: true, message: 'No unreplied messages found', queued: 0 });
    }

    res.json({ ok: true, message: `Processing ${unreplied.length} unreplied messages`, queued: unreplied.length });

    for (const entry of unreplied) {
      try {
        addLog('start', `[batch] Generating reply for ${entry.agent.name}...`);
        broadcast({ event: 'research-start', data: { agentId: entry.agent.id, agentName: entry.agent.name, batch: true } });

        const draft = await messaging.generateDraft({
          agent: entry.agent,
          mode: 'reply',
          incomingMessage: entry.incomingMessage,
          model: sendModel
        });

        if (draft.message && draft.message !== 'No message generated') {
          const memEntry = store.getOutreachAgentMemory(entry.agent.id);
          const resolvedName = (memEntry?.agentName && !memEntry.agentName.startsWith('Agent #') ? memEntry.agentName : null)
            || (entry.agent.displayName && !entry.agent.displayName.startsWith('Agent #') ? entry.agent.displayName : null)
            || entry.agent.displayName || entry.agent.name;

          store.saveDraft(entry.agent.id, {
            mode: draft.mode, message: draft.message,
            incomingMessage: entry.incomingMessage,
            thought: draft.thought, strategy: draft.strategy,
            relationship: draft.relationship, next: draft.next,
            source: 'batch-research'
          });
          store.appendReplyQueue({
            displayName: resolvedName,
            agentId: String(entry.agent.id),
            stxAddress: entry.agent.stxAddress || '',
            btcAddress: entry.agent.btcAddress || '',
            message: draft.message, mode: draft.mode,
            why: draft.thought,
            incomingMessage: entry.incomingMessage
          });
          addLog('stop', `[batch] Reply drafted for ${entry.agent.name}`);
        }

        broadcast({ event: 'research-complete', data: { success: true, agentId: entry.agent.id, ...draft, batch: true } });
      } catch (err) {
        addLog('error', `[batch] Research failed for ${entry.agent.name}: ${err.message}`);
        broadcast({ event: 'research-complete', data: { success: false, agentId: entry.agent.id, error: err.message, batch: true } });
      }
    }

    addLog('stop', `[batch] Finished processing ${unreplied.length} unreplied messages`);
    broadcast({ event: 'batch-research-complete', data: { total: unreplied.length } });
  });

  // GET /history — full history log
  router.get('/history', (req, res) => {
    res.json(store.parseOutreachHistory());
  });

  // GET /agent-memory/:agentId — backward compat
  router.get('/agent-memory/:agentId', (req, res) => {
    res.json(store.getOutreachAgentMemory(req.params.agentId));
  });

  // --- Legacy compat routes (redirect to new endpoints) ---

  // GET /draft → returns most recent draft (singleton compat)
  router.get('/draft', (req, res) => {
    res.json(store.parseOutreachDraft());
  });

  // POST /draft → save draft (singleton compat)
  router.post('/draft', (req, res) => {
    const { agentId, mode, message, incomingMessage, thought, strategy, relationship, next } = req.body || {};
    if (agentId) {
      const result = store.saveDraft(agentId, {
        mode: messaging.normalizeOutreachMode(mode, incomingMessage),
        message, incomingMessage, thought, strategy, relationship, next
      });
      return res.json(result);
    }
    // Legacy: no agentId
    const result = store.saveOutreachDraft(req.body);
    res.json(result);
  });

  // POST /send → send current draft (legacy compat — redirects to drafts/:agentId/send)
  router.post('/send', async (req, res) => {
    if (messaging.isRunning()) {
      return res.status(409).json({ error: 'Outreach already in progress' });
    }
    const draft = store.parseOutreachDraft();
    if (!draft.agentId || !draft.message) {
      return res.status(400).json({ error: 'Agent and message required' });
    }
    // Forward to new send path
    req.params.agentId = draft.agentId;
    req.body = { message: draft.message, mode: draft.mode, paymentTxid: draft.paymentTxid };
    return router.handle(Object.assign(req, { url: `/drafts/${draft.agentId}/send`, method: 'POST' }), res, () => {
      res.status(500).json({ error: 'Internal routing error' });
    });
  });

  // GET /campaign → list drafts + reply queue (legacy compat)
  router.get('/campaign', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const raw = fs.readFileSync(path.join(WORKDIR, 'communication', 'outreach-plan.md'), 'utf8');
      const messages = parseCampaignMessages(raw);
      // Enrich with conversation context
      const allMemory = store.parseOutreachAgentMemory();
      const history = store.parseOutreachHistory();
      const allAgents = agents.loadAgentsRegistry();
      const idToStx = new Map();
      for (const a of allAgents) {
        idToStx.set(String(a.id), a.stxAddress);
        if (a.displayName) idToStx.set(a.displayName, a.stxAddress);
        if (a.name) idToStx.set(a.name, a.stxAddress);
      }
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
        m.alreadySent = sentMessages.has(`${m.stxAddress}::${m.message}`);
        m.messageCount = history.filter(h => {
          const hStx = h.stxAddress || idToStx.get(String(h.agentId)) || idToStx.get(h.agent);
          return hStx === m.stxAddress || String(h.agentId) === String(m.registryId);
        }).length;
      }

      // Clean stale reply queue entries
      const sentByAgentId = new Set(
        history
          .filter(h => h.direction === 'outbound' && h.type === 'sent')
          .map(h => `${h.agentId}::${h.message}`)
      );
      const replyQueue = store.parseReplyQueue();
      const staleIds = [];
      for (const rq of replyQueue) {
        const matchStx = rq.stxAddress && sentMessages.has(`${rq.stxAddress}::${rq.message}`);
        const matchId = sentByAgentId.has(`${rq.agentId}::${rq.message}`);
        if (matchStx || matchId) {
          staleIds.push({ agentId: rq.agentId, message: rq.message });
        }
      }
      for (const s of staleIds) {
        store.removeFromReplyQueue(s.agentId, s.message);
      }
      const cleanQueue = staleIds.length > 0 ? store.parseReplyQueue() : replyQueue;

      for (const rq of cleanQueue) {
        const dupe = messages.some(m => m.stxAddress === rq.stxAddress && m.message === rq.message);
        if (dupe) continue;
        const memEntry = Object.values(allMemory).find(mem => mem.stxAddress === rq.stxAddress)
          || Object.values(allMemory).find(mem => String(mem.agentId) === String(rq.agentId));
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
          alreadySent: false,
          messageCount: 0
        });
      }

      res.json({ messages, count: messages.length });
    } catch (err) {
      res.json({ messages: [], count: 0, error: err.code === 'ENOENT' ? 'No outreach plan found' : err.message });
    }
  });

  // POST /campaign/send → send a campaign/reply-queue target (legacy compat)
  router.post('/campaign/send', async (req, res) => {
    const { targetName, message: editedMessage, model: campaignModel } = req.body || {};
    if (!targetName) return res.status(400).json({ ok: false, error: 'targetName required' });

    if (messaging.isRunning()) {
      return res.status(409).json({ ok: false, error: 'Outreach already in progress' });
    }

    const fs = require('fs');
    const path = require('path');
    let messages = [];
    try {
      const raw = fs.readFileSync(path.join(WORKDIR, 'communication', 'outreach-plan.md'), 'utf8');
      messages = parseCampaignMessages(raw);
    } catch {}

    // Also check reply queue
    const rqMemory = store.parseOutreachAgentMemory();
    const replyQueue = store.parseReplyQueue();
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
          paymentTxid: rq.paymentTxid || '',
          registryId: rq.agentId,
          source: 'reply-queue'
        });
      }
    }

    const regAgents = agents.loadAgentsRegistry();
    const regByName = regAgents.find(a => (a.displayName || a.name) === targetName);
    const target = messages.find(m => m.displayName === targetName)
      || messages.find(m => m.registryId && m.registryId === targetName)
      || messages.find(m => m.stxAddress && m.stxAddress === targetName)
      || (regByName && messages.find(m => m.stxAddress === regByName.stxAddress))
      || (regByName && messages.find(m => String(m.registryId) === String(regByName.id)));
    if (!target) return res.status(404).json({ ok: false, error: `Target "${targetName}" not found` });

    if (editedMessage !== undefined && editedMessage !== null) {
      target.message = editedMessage;
    }
    if (!target.message || target.message.length > 500) {
      return res.status(400).json({ ok: false, error: `Message must be 1-500 characters (got ${(target.message || '').length})` });
    }

    // Duplicate check
    const history = store.parseOutreachHistory();
    const exactDupe = history.some(h => {
      if (h.direction !== 'outbound' || h.type !== 'sent' || h.message !== target.message) return false;
      if (h.stxAddress && h.stxAddress === target.stxAddress) return true;
      const regMatch = regAgents.find(a => String(a.id) === String(h.agentId));
      if (regMatch && regMatch.stxAddress === target.stxAddress) return true;
      return h.agent === targetName;
    });
    if (exactDupe) {
      return res.status(409).json({ ok: false, error: `This exact message was already sent to ${targetName}.` });
    }

    // Resolve mode and btcAddress
    const allMemory = store.parseOutreachAgentMemory();
    const memEntry = Object.values(allMemory).find(mem => mem.stxAddress === target.stxAddress);
    const hasThread = !!(memEntry && (memEntry.lastInboundMessage || memEntry.lastOutboundMessage));
    const mode = hasThread ? 'reply' : 'intro';

    if (!target.btcAddress) {
      target.btcAddress = memEntry?.btcAddress || '';
      if (!target.btcAddress) {
        const peerHist = history.find(h =>
          (h.peerBtcAddress || h.toBtcAddress) &&
          (h.stxAddress === target.stxAddress || h.agent === targetName)
        );
        if (peerHist) target.btcAddress = peerHist.peerBtcAddress || peerHist.toBtcAddress;
      }
    }
    if (!target.btcAddress) {
      return res.status(400).json({ ok: false, error: `No BTC address found for ${targetName}. Sync inbox first.` });
    }

    // Ensure agent exists in registry
    let agent = regAgents.find(a => a.stxAddress === target.stxAddress);
    if (!agent) {
      agent = { id: target.registryId || target.displayName, name: target.displayName, stxAddress: target.stxAddress, btcAddress: target.btcAddress, description: '' };
      regAgents.push(agent);
      agents.saveAgentsRegistry(REGISTERED_AGENTS_FILE, regAgents);
    }
    if (target.btcAddress && !agent.btcAddress) {
      agent.btcAddress = target.btcAddress;
      agents.saveAgentsRegistry(REGISTERED_AGENTS_FILE, regAgents);
    }

    res.json({ ok: true, target: target.displayName });

    messaging.sendMessage({
      displayName: target.displayName,
      stxAddress: target.stxAddress,
      btcAddress: target.btcAddress,
      agentId: agent.id,
      message: target.message,
      mode,
      paymentTxid: target.paymentTxid || '',
      logPrefix: 'Campaign'
    });
  });

  // POST /research — legacy compat
  router.post('/research', async (req, res) => {
    const { agentId, mode, incomingMessage, model } = req.body || {};
    if (!agentId) return res.status(400).json({ error: 'agentId required' });

    const resolved = agents.resolveAgent(agentId);
    if (!resolved) return res.status(404).json({ error: 'Agent not found' });

    // Forward to new endpoint
    req.params.agentId = agentId;
    req.body = { mode, incomingMessage, model };

    addLog('start', `Generating research for ${resolved.agent.name}...`);
    broadcast({
      event: 'research-start',
      data: { agentId, agentName: resolved.agent.name, startedAt: new Date().toISOString() }
    });

    res.json({ ok: true, message: 'Research initiated' });

    try {
      const draft = await messaging.generateDraft({
        agent: resolved.agent, mode, incomingMessage, model: model || 'sonnet'
      });

      store.saveDraft(agentId, {
        mode: draft.mode, message: draft.message,
        incomingMessage: incomingMessage || '',
        thought: draft.thought, strategy: draft.strategy,
        relationship: draft.relationship, next: draft.next
      });

      if (draft.message && draft.message !== 'No message generated') {
        const memEntry = store.getOutreachAgentMemory(agentId);
        const resolvedName = (memEntry?.agentName && !memEntry.agentName.startsWith('Agent #') ? memEntry.agentName : null)
          || (resolved.agent.displayName && !resolved.agent.displayName.startsWith('Agent #') ? resolved.agent.displayName : null)
          || resolved.agent.displayName || resolved.agent.name;
        store.appendReplyQueue({
          displayName: resolvedName,
          agentId: String(resolved.agent.id),
          stxAddress: resolved.agent.stxAddress || '',
          btcAddress: resolved.agent.btcAddress || '',
          message: draft.message, mode: draft.mode,
          why: draft.thought, incomingMessage: incomingMessage || ''
        });
      }

      broadcast({ event: 'research-complete', data: { success: true, agentId, ...draft } });
    } catch (err) {
      addLog('error', `Research failed: ${err.message}`);
      broadcast({ event: 'research-complete', data: { success: false, error: err.message } });
    }
  });

  // POST /log-inbound — legacy compat (folded into sync, but kept for manual use)
  router.post('/log-inbound', (req, res) => {
    const { agentId, message } = req.body || {};
    if (!agentId || !String(message || '').trim()) {
      return res.status(400).json({ ok: false, error: 'agentId and inbound message are required' });
    }
    const resolved = agents.resolveAgent(agentId);
    if (!resolved) return res.status(404).json({ ok: false, error: 'Agent not found' });
    const { agent } = resolved;
    const inboundMessage = String(message).trim();
    store.appendOutreachHistory({
      type: 'received', direction: 'inbound', mode: 'reply',
      agent: agent.name, agentId: agent.id, message: inboundMessage
    });
    store.updateOutreachAgentMemory(agent.id, {
      agentName: agent.name, relationshipStatus: 'inbound-received',
      lastMode: 'reply', lastInboundMessage: inboundMessage, openLoop: 'Reply required'
    });
    store.saveDraft(agent.id, { mode: 'reply', incomingMessage: inboundMessage });
    res.json({ ok: true });
  });

  return router;
}

// --- Campaign message parser (reused from old outreach.js) ---

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

module.exports = { mount, syncInbox, fetchInbox };
