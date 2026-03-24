// dashboard/outreach/messaging.js — Unified send + draft generation
const store = require('./store');
const { sendInboxMessage } = require('../aibtc-inbox-client');
const { WORKDIR } = require('../config');

let _addLog = () => {};
let _broadcast = () => {};
let _runningOutreach = false;

function initMessaging({ addLog, broadcast }) {
  _addLog = addLog;
  _broadcast = broadcast;
}

function isRunning() { return _runningOutreach; }

// --- Helpers ---

function clipText(value, limit = 500) {
  const text = String(value || '').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function normalizeOutreachMode(mode, incomingMessage = '') {
  const normalized = String(mode || '').trim().toLowerCase();
  if (['intro', 'reply', 'follow-up'].includes(normalized)) return normalized;
  return String(incomingMessage || '').trim() ? 'reply' : 'intro';
}

function parseTaggedField(text, label, fallback = '') {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z- ]+:|$)`, 'i');
  const match = text.match(pattern);
  return (match ? match[1] : fallback).trim();
}

function parsePaymentSats(payment) {
  const amount = String(payment?.amount || '').trim();
  const match = amount.match(/(\d+)/);
  return match ? Number(match[1]) : 100;
}

function buildOutreachContext(agentId, incomingMessage = '') {
  const { loadAgentsRegistry } = require('./agents');
  const agentKey = String(agentId || '').trim();
  const agents = loadAgentsRegistry();
  const agent = agents.find((entry) =>
    String(entry.id) === agentKey || entry.stxAddress === agentKey
  );
  const memory = store.getOutreachAgentMemory(agentKey)
    || (agent?.stxAddress ? store.getOutreachAgentMemory(agent.stxAddress) : null);
  const stxAddress = memory?.stxAddress || agent?.stxAddress || '';
  const history = store.parseOutreachHistory()
    .filter((entry) =>
      String(entry.agentId) === agentKey ||
      (stxAddress && entry.stxAddress === stxAddress)
    )
    .slice(0, 6);

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

// --- Unified send with retry ---

/**
 * Send a message via aibtc-inbox-client with 3-retry logic.
 * On success: appendOutreachHistory + updateOutreachAgentMemory + deleteDraft + broadcast
 * On failure: queue as draft with recovery txid + broadcast error
 * Returns { success, paymentTxid, error }
 */
async function sendMessage({ displayName, stxAddress, btcAddress, agentId, message, mode, paymentTxid, logPrefix = 'Send' }) {
  const walletPassword = process.env.WALLET_PASSWORD || '';
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 30_000;
  let currentPaymentTxid = paymentTxid || '';

  _runningOutreach = true;
  _addLog('start', `${logPrefix} [mcp-direct] send to ${displayName}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await sendInboxMessage({
        recipientBtcAddress: btcAddress,
        recipientStxAddress: stxAddress,
        content: message,
        walletPassword,
        paymentTxid: currentPaymentTxid || undefined,
        onStatus: (statusLine) => {
          _addLog('stdout', `[${logPrefix}] [mcp-direct] ${statusLine}`);
        }
      });

      // Success — bookkeeping
      _runningOutreach = false;
      const payment = data?.payment || {};

      store.appendOutreachHistory({
        type: 'sent', direction: 'outbound', mode: mode || 'intro',
        agent: displayName, agentId, stxAddress: stxAddress || '',
        message,
        paymentTxid: payment.txid || null,
        paymentSats: parsePaymentSats(payment),
        toBtcAddress: btcAddress || ''
      });
      store.updateOutreachAgentMemory(agentId, {
        agentName: displayName,
        relationshipStatus: 'outbound-sent',
        lastOutboundMessage: message,
        openLoop: 'Awaiting reply'
      });
      store.deleteDraft(agentId);
      store.removeFromReplyQueue(agentId, message);

      _addLog('stop', `${logPrefix} [mcp-direct] to ${displayName} delivered.`);
      _broadcast({ event: 'outreach-complete', data: { success: true, agent: displayName, source: logPrefix } });

      return { success: true, paymentTxid: payment.txid || null };

    } catch (err) {
      const errMsg = err.message || '';
      const recoveryTxid = err.recovery?.paymentTxid;
      if (recoveryTxid) currentPaymentTxid = recoveryTxid;

      const isRetryable = /nonce|ConflictingNonce|settlement|timeout|retry/i.test(errMsg);
      if (isRetryable && attempt < MAX_RETRIES) {
        _addLog('stdout', `${logPrefix} [mcp-direct] attempt ${attempt}/${MAX_RETRIES} failed (${errMsg.substring(0, 80)}), retrying in ${BACKOFF_MS / 1000}s...`);
        await new Promise(r => setTimeout(r, BACKOFF_MS));
        continue;
      }

      // Non-retryable or retries exhausted — failure bookkeeping
      _runningOutreach = false;
      const failureText = errMsg || 'Unknown inbox send error';

      // Re-queue with recovery txid
      if (currentPaymentTxid) {
        store.saveDraft(agentId, { paymentTxid: currentPaymentTxid });
      }

      _addLog('error', `${logPrefix} [mcp-direct] failed after ${attempt} attempt(s): ${failureText.substring(0, 120)}`);
      _broadcast({ event: 'outreach-complete', data: { success: false, agent: displayName, source: logPrefix, error: failureText } });

      return { success: false, error: failureText, paymentTxid: currentPaymentTxid || null };
    }
  }

  _runningOutreach = false;
  return { success: false, error: 'Max retries exhausted' };
}

// --- Draft generation ---

/**
 * Generate a draft message for a target agent using AI research.
 * Returns the parsed draft fields: { thought, strategy, relationship, message, next }
 */
async function generateDraft({ agent, mode, incomingMessage, model = 'sonnet' }) {
  const { runTask } = require('../ai-runner');
  const { parseAgents, parseResearchBuffer } = require('../markdown');

  const normalizedMode = normalizeOutreachMode(mode, incomingMessage);
  const agentsMd = parseAgents();
  const researchBuffer = parseResearchBuffer();
  const ambassadorBrief = store.parseOutreachAmbassadorBrief();
  const outreachContext = buildOutreachContext(agent.id, incomingMessage);

  const modeGoal = normalizedMode === 'reply'
    ? 'Draft a direct reply to the inbound message. Answer first, then move toward one concrete next step.'
    : normalizedMode === 'follow-up'
      ? 'Draft a follow-up only if you have real new information, a deliverable, or a necessary next ask.'
      : 'Draft a first-contact introduction with one clear objective tailored to this specific agent.';

  const prompt = `RESEARCH & GENERATE OUTREACH:
Mode: ${normalizedMode}
Target Agent: ${agent.name} (#${agent.id})
Target Description: ${agent.description || ''}

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
${outreachContext.incomingText}

GOAL:
${modeGoal}
Agent 27 is the first automated ambassador for Xtrata and an AI journalist whose evolving consciousness is recorded on-chain.
Keep the message under 495 characters.

Format your response exactly like this:
THOUGHT: <your reasoning about why this message is relevant to this specific agent>
STRATEGY: <intro / reply / follow-up angle and why>
RELATIONSHIP: <one-line status such as new-target, active-thread, awaiting-reply, warm-contact>
MESSAGE: <the 495-char message>
NEXT: <the desired next step or reply format>

Do not include any other text or markers in your response.`;

  const result = await runTask({
    model, budget: 0.03, prompt, cwd: WORKDIR,
    phaseType: 'research', contextPack: 'outreachResearch',
    onLine: () => {}
  });

  const fullText = result.text || '';
  const thought = parseTaggedField(fullText, 'THOUGHT', 'No thought generated');
  const strategy = parseTaggedField(fullText, 'STRATEGY', normalizedMode);
  const relationship = parseTaggedField(fullText, 'RELATIONSHIP', outreachContext.memory?.relationshipStatus || 'new-target');
  const message = parseTaggedField(fullText, 'MESSAGE', 'No message generated');
  const next = parseTaggedField(fullText, 'NEXT', 'Reply with ACCEPT / DECLINE / QUESTIONS');

  // Persist research result
  store.appendOutreachHistory({
    type: 'research', direction: 'draft', mode: normalizedMode,
    agent: agent.name, agentId: agent.id, stxAddress: agent.stxAddress || '',
    thought, strategy, relationship, next,
    incomingMessage: incomingMessage || '', message
  });
  store.updateOutreachAgentMemory(agent.id, {
    agentName: agent.name, relationshipStatus: relationship,
    lastMode: normalizedMode, lastThought: thought, lastStrategy: strategy,
    lastDraftMessage: message,
    lastInboundMessage: incomingMessage || outreachContext.memory?.lastInboundMessage || '',
    openLoop: next
  });

  return { thought, strategy, relationship, message, next, mode: normalizedMode };
}

module.exports = {
  initMessaging,
  isRunning,
  sendMessage,
  generateDraft,
  buildOutreachContext,
  normalizeOutreachMode,
  parseTaggedField,
  clipText,
  parsePaymentSats
};
