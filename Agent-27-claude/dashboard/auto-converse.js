// dashboard/auto-converse.js — Automated agent-to-agent conversation system
// Monitors inbox for new messages and auto-generates (and optionally sends) replies
// based on per-agent or global toggles.

const stateManager = require('./state');
const store = require('./outreach/store');
const { loadAgentsRegistry } = require('./outreach/agents');
const { sendMessage, generateDraft, buildOutreachContext } = require('./outreach/messaging');
const { WORKDIR } = require('./config');

let _addLog = () => {};
let _broadcast = () => {};
let processing = false;

// Rate limit tracking (in-memory, resets on restart)
const replyTimestamps = new Map(); // agentStxAddress → last reply timestamp
const autoSendLog = [];            // timestamps of auto-sends in current hour

const MAX_REPLY_INTERVAL_MS = 30 * 60 * 1000; // 1 reply per agent per 30 min
const MAX_AUTO_SENDS_PER_HOUR = 5;

// --- Config persistence via state manager ---

const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'selective',  // 'selective' | 'all'
  autoSend: false,    // true = send immediately; false = queue for review
  agents: {}          // { stxAddress: { enabled: true, label: 'Name' } }
};

function getConfig() {
  const state = stateManager.getState();
  return { ...DEFAULT_CONFIG, ...(state.autoConverse || {}) };
}

function updateConfig(patch) {
  const current = getConfig();
  const updated = { ...current, ...patch };

  if (patch.agents) {
    updated.agents = { ...current.agents, ...patch.agents };
  }

  stateManager.updateState({ autoConverse: updated });
  _broadcast({ event: 'auto-converse-config', data: updated });
  return updated;
}

function isAgentEnabled(stxAddress) {
  const config = getConfig();
  if (!config.enabled) return false;
  if (config.mode === 'all') return true;
  const agentEntry = config.agents[stxAddress];
  return !!(agentEntry && agentEntry.enabled);
}

// --- Rate limiting ---

function canReplyToAgent(stxAddress) {
  const last = replyTimestamps.get(stxAddress);
  if (!last) return true;
  return (Date.now() - last) >= MAX_REPLY_INTERVAL_MS;
}

function canAutoSend() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  while (autoSendLog.length > 0 && autoSendLog[0] < oneHourAgo) {
    autoSendLog.shift();
  }
  return autoSendLog.length < MAX_AUTO_SENDS_PER_HOUR;
}

function recordReply(stxAddress) {
  replyTimestamps.set(stxAddress, Date.now());
}

function recordAutoSend() {
  autoSendLog.push(Date.now());
}

// --- Reply queue management ---

function getReplyQueue() {
  return store.parseReplyQueue();
}

function approveReply(agentId, message) {
  const queue = store.parseReplyQueue();
  const entry = queue.find(rq =>
    String(rq.agentId) === String(agentId) &&
    rq.message === message
  );
  if (!entry) return { ok: false, error: 'Reply not found in queue' };
  if (!entry.stxAddress || !entry.btcAddress) {
    return { ok: false, error: 'Missing address — sync inbox first' };
  }

  // Remove from queue and trigger send
  store.removeFromReplyQueue(agentId, message);
  const agents = loadAgentsRegistry();
  const agent = agents.find(a => String(a.id) === String(agentId));
  const displayName = entry.displayName || (agent && agent.name) || `Agent #${agentId}`;

  // Use unified sendMessage — handles all bookkeeping
  sendMessage({
    displayName,
    stxAddress: entry.stxAddress,
    btcAddress: entry.btcAddress,
    agentId,
    message: entry.message,
    mode: entry.mode || 'reply',
<<<<<<< Updated upstream
    incomingMessage: entry.incomingMessage || '',
    paymentTxid: entry.paymentTxid || '',
    logPrefix: 'AutoConverse-Approved'
=======
    model: 'haiku',
    logPrefix: 'AutoConverse-Approved',
    onSuccess: () => {
      markdown.appendOutreachHistory({
        type: 'sent', direction: 'outbound', mode: entry.mode || 'reply',
        agent: displayName, agentId, stxAddress: entry.stxAddress,
        message: entry.message
      });
      markdown.updateOutreachAgentMemory(agentId, {
        agentName: displayName,
        relationshipStatus: 'outbound-sent',
        lastOutboundMessage: entry.message,
        openLoop: 'Awaiting reply'
      });
      _broadcast({ event: 'outreach-complete', data: { success: true, agent: displayName, source: 'auto-converse' } });
    },
    onFailure: (errText) => {
      _addLog('error', `AutoConverse approved send failed for ${displayName}: ${errText}`);
      _broadcast({ event: 'outreach-complete', data: { success: false, agent: displayName, source: 'auto-converse' } });
    }
>>>>>>> Stashed changes
  });

  return { ok: true, agent: displayName };
}

function dismissReply(agentId, message) {
  store.removeFromReplyQueue(agentId, message);
  return { ok: true };
}

// --- Core: process new inbox messages ---

async function processNewMessages(syncResult) {
  const config = getConfig();
  if (!config.enabled || processing) return;
  if (!syncResult || !syncResult.newMessages || syncResult.newMessages.length === 0) return;

  const inboundNew = syncResult.newMessages.filter(m => m.direction === 'inbound');
  if (inboundNew.length === 0) return;

  processing = true;
  _addLog('start', `[auto-converse] Processing ${inboundNew.length} new inbound message(s)`);

  const agents = loadAgentsRegistry();

  for (const msg of inboundNew) {
    const peerStx = msg.stxAddress || '';
    if (!isAgentEnabled(peerStx)) {
      _addLog('stdout', `[auto-converse] Skipping ${msg.agent} — not enabled`);
      continue;
    }
    if (!canReplyToAgent(peerStx)) {
      _addLog('stdout', `[auto-converse] Skipping ${msg.agent} — rate limited`);
      continue;
    }

    const agent = agents.find(a => a.stxAddress === peerStx);
    if (!agent) continue;

    // Guard: don't reply if we already successfully replied to this message
    if (store.hasSuccessfulReplyTo(agent.id, msg.message)) {
      _addLog('stdout', `[auto-converse] Skipping ${agent.name} — already replied to this message`);
      continue;
    }

    // Guard: don't generate if a send is already pending for this agent
    if (store.hasPendingSendTo(agent.id)) {
      _addLog('stdout', `[auto-converse] Skipping ${agent.name} — send already pending`);
      continue;
    }

    try {
      _addLog('start', `[auto-converse] Generating reply for ${agent.name}...`);
      _broadcast({ event: 'auto-converse-research', data: { agentId: agent.id, agentName: agent.name } });

<<<<<<< Updated upstream
      const draft = await generateDraft({
        agent, mode: 'reply', incomingMessage: msg.message, model: 'sonnet'
=======
      const result = await runTask({
        model: 'sonnet', budget: 0.08, prompt, cwd: WORKDIR,
        phaseType: 'research', contextPack: 'outreachResearch',
        onLine: () => {}
>>>>>>> Stashed changes
      });

      if (!draft.message || draft.message === 'No match' || draft.message === 'No message generated') {
        _addLog('error', `[auto-converse] No message generated for ${agent.name}`);
        continue;
      }

      recordReply(peerStx);

      if (config.autoSend && canAutoSend() && agent.btcAddress) {
        // Auto-send immediately
        _addLog('start', `[auto-converse] Auto-sending to ${agent.name}...`);
        recordAutoSend();

        sendMessage({
          displayName: agent.name,
          stxAddress: peerStx,
          btcAddress: agent.btcAddress,
          agentId: agent.id,
          message: draft.message,
          mode: 'reply',
<<<<<<< Updated upstream
          incomingMessage: msg.message,
          logPrefix: 'AutoConverse'
=======
          model: 'haiku',
          logPrefix: 'AutoConverse',
          onSuccess: () => {
            markdown.appendOutreachHistory({
              type: 'sent', direction: 'outbound', mode: 'reply',
              agent: agent.name, agentId: agent.id, stxAddress: peerStx,
              message
            });
            markdown.updateOutreachAgentMemory(agent.id, {
              agentName: agent.name, relationshipStatus: 'outbound-sent',
              lastOutboundMessage: message, openLoop: 'Awaiting reply'
            });
            _broadcast({ event: 'outreach-complete', data: { success: true, agent: agent.name, source: 'auto-converse' } });
          },
          onFailure: () => {
            _broadcast({ event: 'outreach-complete', data: { success: false, agent: agent.name, source: 'auto-converse' } });
          }
>>>>>>> Stashed changes
        });
      } else {
        // Queue for review
        const memEntry = store.getOutreachAgentMemory(agent.id);
        store.appendReplyQueue({
          displayName: (memEntry && memEntry.agentName) || agent.name,
          agentId: String(agent.id),
          stxAddress: peerStx,
          btcAddress: agent.btcAddress || '',
          message: draft.message,
          mode: 'reply',
          why: draft.thought,
          incomingMessage: msg.message
        });
        // Also save as keyed draft
        store.saveDraft(agent.id, {
          mode: 'reply', message: draft.message,
          incomingMessage: msg.message,
          thought: draft.thought, strategy: draft.strategy,
          relationship: draft.relationship, next: draft.next,
          source: 'auto-converse'
        });
        _addLog('stop', `[auto-converse] Reply queued for ${agent.name} (review required)`);
        _broadcast({ event: 'auto-converse-queued', data: { agentId: agent.id, agentName: agent.name, message: draft.message } });
      }
    } catch (err) {
      _addLog('error', `[auto-converse] Error for ${agent.name}: ${err.message}`);
    }
  }

  processing = false;
  _addLog('stop', `[auto-converse] Finished processing`);
}

// --- Init ---

function initAutoConverse({ addLog, broadcast }) {
  _addLog = addLog;
  _broadcast = broadcast;
  console.log('Auto-converse module ready');
}

module.exports = {
  initAutoConverse,
  getConfig,
  updateConfig,
  isAgentEnabled,
  processNewMessages,
  getReplyQueue,
  approveReply,
  dismissReply
};
