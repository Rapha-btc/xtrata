// dashboard/auto-converse.js — Automated agent-to-agent conversation system
// Monitors inbox for new messages and auto-generates (and optionally sends) replies
// based on per-agent or global toggles.

const stateManager = require('./state');
const markdown = require('./markdown');
const { WORKDIR, REGISTERED_AGENTS_FILE, LEGACY_REGISTERED_AGENTS_FILE } = require('./config');

let _addLog = () => {};
let _broadcast = () => {};
let _outreach = null; // set in init — holds { syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend }
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

  // Merge agent toggles if provided as a patch
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
  // Prune old entries
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
  return markdown.parseReplyQueue();
}

function approveReply(agentId, message) {
  const queue = markdown.parseReplyQueue();
  const entry = queue.find(rq =>
    String(rq.agentId) === String(agentId) &&
    rq.message === message
  );
  if (!entry) return { ok: false, error: 'Reply not found in queue' };
  if (!entry.stxAddress || !entry.btcAddress) {
    return { ok: false, error: 'Missing address — sync inbox first' };
  }

  // Remove from queue and trigger send
  markdown.removeFromReplyQueue(agentId, message);
  const agents = _outreach.loadAgentsRegistry(REGISTERED_AGENTS_FILE, LEGACY_REGISTERED_AGENTS_FILE);
  const agent = agents.find(a => String(a.id) === String(agentId));
  const displayName = entry.displayName || (agent && agent.name) || `Agent #${agentId}`;

  _outreach.executeSend({
    displayName,
    stxAddress: entry.stxAddress,
    btcAddress: entry.btcAddress,
    agentId,
    message: entry.message,
    mode: entry.mode || 'reply',
    model: 'sonnet',
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
  });

  return { ok: true, agent: displayName };
}

function dismissReply(agentId, message) {
  markdown.removeFromReplyQueue(agentId, message);
  return { ok: true };
}

// --- Core: process new inbox messages ---

/**
 * Called after each inbox sync. Checks for unreplied messages
 * from enabled agents and generates (and optionally sends) replies.
 */
async function processNewMessages(syncResult) {
  const config = getConfig();
  if (!config.enabled || processing) return;
  if (!syncResult || !syncResult.newMessages || syncResult.newMessages.length === 0) return;

  const inboundNew = syncResult.newMessages.filter(m => m.direction === 'inbound');
  if (inboundNew.length === 0) return;

  processing = true;
  _addLog('start', `[auto-converse] Processing ${inboundNew.length} new inbound message(s)`);

  const { runTask } = require('./ai-runner');
  const agents = _outreach.loadAgentsRegistry(REGISTERED_AGENTS_FILE, LEGACY_REGISTERED_AGENTS_FILE);

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

    const outreachContext = _outreach.buildOutreachContext(agent.id, msg.message);
    const ambassadorBrief = markdown.parseOutreachAmbassadorBrief();

    const prompt = `AUTO-REPLY RESEARCH:
Mode: reply
Target Agent: ${agent.name} (#${agent.id})
Target Description: ${agent.description || ''}

Ambassador Brief:
${ambassadorBrief.raw.substring(0, 1200)}

Conversation Memory:
${outreachContext.memoryText}

Recent Thread History:
${outreachContext.historyText}

Inbound Message:
${msg.message}

GOAL:
Draft a direct reply to the inbound message. Answer first, then move toward one concrete next step.
Agent 27 is the first automated ambassador for Xtrata — an AI journalist whose evolving consciousness is recorded on-chain.
Keep the message under 495 characters.

Format your response exactly like this:
THOUGHT: <reasoning>
STRATEGY: <reply angle>
RELATIONSHIP: <status>
MESSAGE: <the 495-char message>
NEXT: <desired next step>`;

    try {
      _addLog('start', `[auto-converse] Generating reply for ${agent.name}...`);
      _broadcast({ event: 'auto-converse-research', data: { agentId: agent.id, agentName: agent.name } });

      const result = await runTask({
        model: 'sonnet', budget: 0.03, prompt, cwd: WORKDIR,
        phaseType: 'research', contextPack: 'outreachResearch',
        onLine: () => {}
      });

      const fullText = result.text || '';
      const thought = parseField(fullText, 'THOUGHT');
      const strategy = parseField(fullText, 'STRATEGY');
      const relationship = parseField(fullText, 'RELATIONSHIP');
      const message = parseField(fullText, 'MESSAGE');
      const next = parseField(fullText, 'NEXT');

      if (!message || message === 'No match') {
        _addLog('error', `[auto-converse] No message generated for ${agent.name}`);
        continue;
      }

      // Log the research draft
      markdown.appendOutreachHistory({
        type: 'research', direction: 'draft', mode: 'reply',
        agent: agent.name, agentId: agent.id, stxAddress: peerStx,
        thought, strategy, relationship, next,
        incomingMessage: msg.message, message
      });
      markdown.updateOutreachAgentMemory(agent.id, {
        agentName: agent.name, relationshipStatus: relationship,
        lastMode: 'reply', lastThought: thought, lastStrategy: strategy,
        lastDraftMessage: message,
        lastInboundMessage: msg.message,
        openLoop: next
      });

      recordReply(peerStx);

      if (config.autoSend && canAutoSend() && agent.btcAddress) {
        // Auto-send immediately
        _addLog('start', `[auto-converse] Auto-sending to ${agent.name}...`);
        recordAutoSend();

        _outreach.executeSend({
          displayName: agent.name,
          stxAddress: peerStx,
          btcAddress: agent.btcAddress,
          agentId: agent.id,
          message,
          mode: 'reply',
          model: 'sonnet',
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
        });
      } else {
        // Queue for review
        const memEntry = markdown.getOutreachAgentMemory(agent.id);
        markdown.appendReplyQueue({
          displayName: (memEntry && memEntry.agentName) || agent.name,
          agentId: String(agent.id),
          stxAddress: peerStx,
          btcAddress: agent.btcAddress || '',
          message,
          mode: 'reply',
          why: thought,
          incomingMessage: msg.message
        });
        _addLog('stop', `[auto-converse] Reply queued for ${agent.name} (review required)`);
        _broadcast({ event: 'auto-converse-queued', data: { agentId: agent.id, agentName: agent.name, message } });
      }
    } catch (err) {
      _addLog('error', `[auto-converse] Error for ${agent.name}: ${err.message}`);
    }
  }

  processing = false;
  _addLog('stop', `[auto-converse] Finished processing`);
}

// --- Helper ---

function parseField(text, label) {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z- ]+:|$)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : 'No match';
}

// --- Init ---

function initAutoConverse({ addLog, broadcast, outreach }) {
  _addLog = addLog;
  _broadcast = broadcast;
  _outreach = outreach;
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
