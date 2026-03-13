// dashboard/server.js
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { sseHandler, broadcast } = require('./sse');
const stateManager = require('./state');
const markdown = require('./markdown');
const { initPhases, runPhase, cancelPhase, getPhaseStatus, getLatestDraft } = require('./phases');
const { runTask } = require('./ai-runner');
const {
  initSkillTestRunner,
  getSkillTestStatus,
  getSkillTestRun,
  runSkillTest,
  cancelSkillTest,
  listSkillTests
} = require('./skill-test-runner');
const { initWatcher, stopWatcher } = require('./watcher');
const { startChainPoller, stopChainPoller, getChainData } = require('./chain');
const {
  WORKDIR,
  AVG_COST_PER_ENTRY,
  REGISTERED_AGENTS_FILE,
  LEGACY_REGISTERED_AGENTS_FILE
} = require('./config');

const app = express();
const PORT = Number(process.env.PORT || 2727);
const LOG_LIMIT = 200;
const activityLog = [];

function addLog(type, line) {
  const entry = { timestamp: new Date().toISOString(), type, line };
  activityLog.push(entry);
  if (activityLog.length > LOG_LIMIT) activityLog.shift();
  broadcast({ event: 'log', data: entry });
  return entry;
}

function getMetricValue(rows, metricName) {
  const row = rows.find((item) => {
    if (!item.metric) return false;
    return item.metric.toLowerCase() === metricName.toLowerCase();
  });
  return row ? row.value : null;
}

function parseNumber(value) {
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadAgentsRegistry() {
  for (const filePath of [REGISTERED_AGENTS_FILE, LEGACY_REGISTERED_AGENTS_FILE]) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return [];
}

function saveAgentsRegistry(agents) {
  ensureParentDir(REGISTERED_AGENTS_FILE);
  fs.writeFileSync(REGISTERED_AGENTS_FILE, JSON.stringify(agents, null, 2));
}

// Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - start}ms)`;
    console.log(`[${new Date().toISOString()}] ${line}`);
    addLog('http', line);
  });
  next();
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// --- API Routes ---

app.get('/api/status', (req, res) => {
  res.json(stateManager.getState());
});

app.get('/api/research', (req, res) => {
  res.json(markdown.parseResearchBuffer());
});

app.get('/api/ideas', (req, res) => {
  res.json(markdown.parseIdeas());
});

app.get('/api/ledger', (req, res) => {
  res.json(markdown.parseLedger());
});

app.get('/api/agents', (req, res) => {
  res.json(markdown.parseAgents());
});

app.get('/api/evolution', (req, res) => {
  res.json(markdown.parseEvolution());
});

app.post('/api/save/:docId', (req, res) => {
  const { docId } = req.params;
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ ok: false, error: 'content required' });
  }
  const result = markdown.saveDocument(docId, content);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get('/api/log', (req, res) => {
  res.json(activityLog);
});

app.get('/api/chain', (req, res) => {
  const ledger = markdown.parseLedger();
  const runningTotals = ledger.runningTotals || [];
  const state = stateManager.getState();
  const live = getChainData();

  const stxRemainingLabel = getMetricValue(runningTotals, 'STX remaining');
  const daysOfLifeLabel = getMetricValue(runningTotals, 'Days of on-chain life');
  const stxSpentLabel = getMetricValue(runningTotals, 'STX spent (total)');
  const inscriptionsLabel = getMetricValue(runningTotals, 'Inscriptions sealed');
  const researchCyclesLabel = getMetricValue(runningTotals, 'Research cycles run');

  const stxRemaining = live.stxBalance !== null ? live.stxBalance : parseNumber(stxRemainingLabel);
  const daysOfLife = stxRemaining !== null ? Math.floor(stxRemaining / AVG_COST_PER_ENTRY) : parseNumber(daysOfLifeLabel);
  const stxSpent = parseNumber(stxSpentLabel);
  const initialBudget = 10;
  const reservePercent = stxRemaining === null
    ? null
    : Math.max(0, Math.min(100, (stxRemaining / initialBudget) * 100));

  res.json({
    stxRemaining,
    stxRemainingLabel: live.stxBalance !== null ? `${live.stxBalance.toFixed(6)} STX` : stxRemainingLabel,
    sbtcBalance: live.sbtcBalance,
    sbtcRemainingLabel: live.sbtcBalance !== null ? `${(live.sbtcBalance / 100_000_000).toFixed(8)} sBTC` : '--',
    daysOfLife,
    daysOfLifeLabel: daysOfLife !== null ? `~${daysOfLife} days` : daysOfLifeLabel,
    stxSpent,
    stxSpentLabel,
    inscriptionsLabel,
    researchCyclesLabel,
    reservePercent,
    initialBudget,
    graphSize: live.graphSize,
    feeUnit: live.feeUnit,
    transactions: live.transactions,
    lastPoll: live.lastPoll,
    lastInscription: state.lastInscription,
    errors: state.errors || []
  });
});

// --- Phase routes (replaces scheduler) ---

app.get('/api/phase-status', (req, res) => {
  res.json(getPhaseStatus());
});

app.get('/api/draft', (req, res) => {
  const draft = getLatestDraft();
  res.json(draft || { name: null });
});

app.post('/api/run/:phaseId', (req, res) => {
  const skillTestStatus = getSkillTestStatus();
  if (skillTestStatus.running) {
    const error = `Skills Lab run "${skillTestStatus.running.runId}" is active`;
    addLog('error', `Run rejected: ${error}`);
    return res.status(409).json({ ok: false, error });
  }

  const result = runPhase(req.params.phaseId);
  if (result.ok) {
    addLog('start', `Run: ${req.params.phaseId}`);
  } else {
    addLog('error', `Run rejected: ${result.error}`);
  }
  res.json(result);
});

app.post('/api/cancel', (req, res) => {
  const result = cancelPhase();
  if (result.ok) {
    addLog('stop', 'Phase cancelled by user');
  }
  res.json(result);
});

// --- Skills Lab Routes ---

app.get('/api/skill-tests', (req, res) => {
  res.json({
    skills: listSkillTests(),
    status: getSkillTestStatus()
  });
});

app.get('/api/skill-tests/status', (req, res) => {
  res.json(getSkillTestStatus());
});

app.get('/api/skill-tests/runs/:runId', (req, res) => {
  const run = getSkillTestRun(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

app.post('/api/skill-tests/run', (req, res) => {
  const { skillId, scenarioId, mode, model, budget } = req.body || {};
  if (!skillId || !scenarioId) {
    return res.status(400).json({ ok: false, error: 'skillId and scenarioId are required' });
  }

  const phaseStatus = getPhaseStatus();
  if (phaseStatus.running) {
    return res.status(409).json({ ok: false, error: `Production phase "${phaseStatus.running.phaseId}" is active` });
  }

  const result = runSkillTest({ skillId, scenarioId, mode, model, budget });
  if (result.ok) {
    addLog('start', `Skills Lab: ${skillId}/${scenarioId}`);
  } else {
    addLog('error', `Skills Lab rejected: ${result.error}`);
  }

  res.json(result);
});

app.post('/api/skill-tests/cancel', (req, res) => {
  const result = cancelSkillTest();
  if (result.ok) {
    addLog('stop', 'Skills Lab run cancelled');
  }
  res.json(result);
});

// --- Outreach Routes ---

let runningOutreach = false;

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

async function discoverAgents() {
  const { HIRO_BASE } = require('./config');
  const REGISTRY = 'SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.identity-registry-v2';
  
  try {
    // Get total agents
    const nextIdRes = await fetch(`${HIRO_BASE}/v2/contracts/call-read/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD/identity-registry-v2/get-last-token-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ', arguments: [] })
    });
    const nextIdData = await nextIdRes.json();
    // result is ok(uint) encoded as hex; parse the uint value
    const resultHex = nextIdData.result || '';
    const totalAgents = resultHex
      ? parseInt(Buffer.from(resultHex.replace('0x','').slice(4), 'hex').readBigUInt64BE(8).toString())
      : 0;
    
    console.log(`Discovering ${totalAgents} agents...`);
    const agents = [];
    
    // Fetch each agent's owner address (get-owner always set; get-agent-wallet often unset)
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
        // ok(some(principal)): 07 0a 05 16 <20 bytes hash160>
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
        await new Promise(r => setTimeout(r, 120)); // avoid rate limit
      } catch (e) {
        console.error(`Failed to fetch agent #${id}:`, e.message);
      }
    }
    
    if (agents.length > 0) {
      saveAgentsRegistry(agents);
      console.log(`Discovered and saved ${agents.length} real agents.`);
    }
    return agents;
  } catch (err) {
    console.error('Discovery failed:', err.message);
    return null;
  }
}

app.get('/api/outreach/agents', async (req, res) => {
  try {
    let agents = loadAgentsRegistry();
    
    // If no agents or user requested refresh
    if (agents.length === 0 || req.query.refresh === 'true') {
      const discovered = await discoverAgents();
      if (discovered) agents = discovered;
    }
    
    res.json(agents);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

app.get('/api/outreach/draft', (req, res) => {
  res.json(markdown.parseOutreachDraft());
});

app.post('/api/outreach/draft', (req, res) => {
  const {
    agentId,
    mode,
    message,
    incomingMessage,
    thought,
    strategy,
    relationship,
    next
  } = req.body || {};
  const result = markdown.saveOutreachDraft({
    agentId,
    mode: normalizeOutreachMode(mode, incomingMessage),
    message,
    incomingMessage,
    thought,
    strategy,
    relationship,
    next
  });
  res.json(result);
});

app.get('/api/outreach/agent-memory/:agentId', (req, res) => {
  res.json(markdown.getOutreachAgentMemory(req.params.agentId));
});

app.post('/api/outreach/log-inbound', (req, res) => {
  const { agentId, message } = req.body || {};
  if (!agentId || !String(message || '').trim()) {
    return res.status(400).json({ ok: false, error: 'agentId and inbound message are required' });
  }

  const agents = loadAgentsRegistry();
  const agent = agents.find((item) => String(item.id) === String(agentId));
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });

  const inboundMessage = String(message).trim();
  markdown.appendOutreachHistory({
    type: 'received',
    direction: 'inbound',
    mode: 'reply',
    agent: agent.name,
    agentId: agent.id,
    message: inboundMessage
  });
  markdown.updateOutreachAgentMemory(agent.id, {
    agentName: agent.name,
    relationshipStatus: 'inbound-received',
    lastMode: 'reply',
    lastInboundMessage: inboundMessage,
    openLoop: 'Reply required'
  });
  markdown.saveOutreachDraft({
    agentId: agent.id,
    mode: 'reply',
    incomingMessage: inboundMessage
  });

  res.json({ ok: true });
});

app.post('/api/outreach/send', async (req, res) => {
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

  const agents = loadAgentsRegistry();
  const agent = agents.find(a => String(a.id) === String(draft.agentId));
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const ambassadorBrief = markdown.parseOutreachAmbassadorBrief();
  const mode = normalizeOutreachMode(draft.mode, draft.incomingMessage);
  const outreachContext = buildOutreachContext(agent.id, draft.incomingMessage);

  runningOutreach = true;
  addLog('start', `Broadcasting ${mode} outreach to ${agent.name}...`);

  const walletPassword = process.env.WALLET_PASSWORD || '';
  const unlockStep = walletPassword
    ? `Step 1: Unlock the wallet named "Primary" using wallet_unlock with password "${walletPassword}".
Step 2: ` : '';

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

${unlockStep}Use mcp__aibtc__send_inbox_message to broadcast the exact message above to the target STX address.
Do not ask for confirmation — proceed directly.
If the send is successful, respond with "OUTREACH_SUCCESS".
If it fails, explain why.`;

  runTask({
    model: 'sonnet',
    budget: 0.05,
    prompt,
    cwd: WORKDIR,
    phaseType: 'research',
    contextPack: 'outreachSend',
    onLine: (type, line) => {
      // Stream some progress to Activity Log
      if (type === 'stdout' && (line.includes('[tool]') || line.length > 40)) {
        addLog('stdout', `[broadcast] ${line.substring(0, 100)}...`);
      } else if (type === 'outreach') {
        addLog('inscription', line); // Highlight TXIDs
      }
    }
  }).then((result) => {
    runningOutreach = false;
    const fullText = (result.text || '').trim();
    const isSuccess = fullText.includes('OUTREACH_SUCCESS') || result.output.some((line) => line.includes('OUTREACH_SUCCESS'));
    if (isSuccess) {
      addLog('stop', `Outreach to ${agent.name} delivered.`);
      markdown.appendOutreachHistory({
        type: 'sent',
        direction: 'outbound',
        mode,
        agent: agent.name,
        agentId: agent.id,
        message: draft.message,
        incomingMessage: draft.incomingMessage || '',
        relationship: draft.relationship || '',
        next: draft.next || ''
      });
      markdown.updateOutreachAgentMemory(agent.id, {
        agentName: agent.name,
        relationshipStatus: draft.relationship || 'outbound-sent',
        lastMode: mode,
        lastOutboundMessage: draft.message,
        lastThought: draft.thought || '',
        lastStrategy: draft.strategy || '',
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

app.get('/api/outreach/history', (req, res) => {
  res.json(markdown.parseOutreachHistory());
});

app.post('/api/outreach/research', async (req, res) => {
  const { agentId, mode, incomingMessage } = req.body || {};
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  const agents = loadAgentsRegistry();
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
    model: 'sonnet',
    budget: 0.03,
    prompt,
    cwd: WORKDIR,
    phaseType: 'research',
    contextPack: 'outreachResearch',
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
      agentId: agent.id,
      mode: normalizedMode,
      incomingMessage: incomingMessage || '',
      thought,
      strategy,
      relationship,
      message,
      next
    });

    markdown.appendOutreachHistory({ 
      type: 'research', 
      direction: 'draft',
      mode: normalizedMode,
      agent: agent.name, 
      agentId: agent.id, 
      thought, 
      strategy,
      relationship,
      next,
      incomingMessage: incomingMessage || '',
      message 
    });
    markdown.updateOutreachAgentMemory(agent.id, {
      agentName: agent.name,
      relationshipStatus: relationship,
      lastMode: normalizedMode,
      lastThought: thought,
      lastStrategy: strategy,
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

// --- SSE Route ---
app.get('/events', sseHandler);

// --- Main Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

const server = app.listen(PORT, () => {
  const line = `Agent 27 Dashboard server running at http://localhost:${PORT}`;
  console.log(line);
  addLog('start', line);

  initPhases(WORKDIR, broadcast);
  initSkillTestRunner(broadcast);
  initWatcher(WORKDIR, broadcast);
  startChainPoller(broadcast);

  if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to another value and restart.`);
  } else {
    console.error('Dashboard server failed to start:', err);
  }
  process.exit(1);
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('\nShutting down Agent 27 Dashboard...');
  addLog('stop', 'Dashboard shutdown requested.');
  stopWatcher();
  stopChainPoller();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
