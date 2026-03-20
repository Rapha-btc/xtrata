// dashboard/server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const { sseHandler, broadcast } = require('./sse');
const stateManager = require('./state');
const markdown = require('./markdown');
const { initPhases, runPhase, cancelPhase, getPhaseStatus, getLatestDraft } = require('./phases');
const {
  initSkillTestRunner,
  getSkillTestStatus,
  getSkillTestRun,
  runSkillTest,
  cancelSkillTest,
  listSkillTests
} = require('./skill-test-runner');
const { initWatcher, stopWatcher } = require('./watcher');
const { startChainPoller, stopChainPoller, getChainData, onAfterPoll } = require('./chain');
const { mount: mountOutreach, syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend } = require('./outreach');
const { startHeartbeatPoller, stopHeartbeatPoller, getHeartbeatStatus, triggerHeartbeat } = require('./heartbeat');
const {
  initAutoConverse,
  getConfig: getAutoConverseConfig,
  updateConfig: updateAutoConverseConfig,
  processNewMessages,
  getReplyQueue: getAutoConverseQueue,
  approveReply,
  dismissReply
} = require('./auto-converse');
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
  const { model } = req.body || {};
  console.log(`[server] POST /api/run/${req.params.phaseId} received (model: ${model || 'default'})`);

  const skillTestStatus = getSkillTestStatus();
  if (skillTestStatus.running) {
    const error = `Skills Lab run "${skillTestStatus.running.runId}" is active`;
    addLog('error', `Run rejected: ${error}`);
    return res.status(409).json({ ok: false, error });
  }

  const result = runPhase(req.params.phaseId, { model });
  if (result.ok) {
    addLog('start', `Run: ${req.params.phaseId} (${model || 'default model'})`);
    console.log(`[server] Phase ${req.params.phaseId} dispatched successfully`);
  } else {
    addLog('error', `Run rejected: ${result.error}`);
    console.log(`[server] Phase ${req.params.phaseId} rejected: ${result.error}`);
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

// --- Outreach Routes (delegated to outreach.js) ---
app.use('/api/outreach', mountOutreach({
  addLog,
  broadcast,
  registryFile: REGISTERED_AGENTS_FILE,
  legacyRegistryFile: LEGACY_REGISTERED_AGENTS_FILE
}));

// --- Heartbeat Routes ---

app.get('/api/heartbeat/status', (req, res) => {
  res.json(getHeartbeatStatus());
});

app.post('/api/heartbeat/trigger', async (req, res) => {
  try {
    const status = await triggerHeartbeat();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Auto-Converse Routes ---

app.get('/api/auto-converse', (req, res) => {
  res.json(getAutoConverseConfig());
});

app.post('/api/auto-converse', (req, res) => {
  const config = updateAutoConverseConfig(req.body);
  addLog('start', `Auto-converse config updated: enabled=${config.enabled}, mode=${config.mode}, autoSend=${config.autoSend}`);
  res.json({ ok: true, config });
});

app.get('/api/auto-converse/queue', (req, res) => {
  res.json(getAutoConverseQueue());
});

app.post('/api/auto-converse/approve', (req, res) => {
  const { agentId, message } = req.body || {};
  if (!agentId || !message) return res.status(400).json({ ok: false, error: 'agentId and message required' });
  const result = approveReply(agentId, message);
  if (result.ok) addLog('start', `Auto-converse: approved send to ${result.agent}`);
  res.json(result);
});

app.post('/api/auto-converse/dismiss', (req, res) => {
  const { agentId, message } = req.body || {};
  if (!agentId || !message) return res.status(400).json({ ok: false, error: 'agentId and message required' });
  const result = dismissReply(agentId, message);
  res.json(result);
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

  initPhases(WORKDIR, broadcast, addLog);
  initSkillTestRunner(broadcast);
  initWatcher(WORKDIR, broadcast);
  startChainPoller(broadcast);
  startHeartbeatPoller(broadcast, addLog);

  // Init auto-converse with outreach functions
  initAutoConverse({
    addLog, broadcast,
    outreach: { syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend }
  });

  // Register inbox auto-sync as a post-poll hook (runs every 5 min with chain poll)
  onAfterPoll(async (_chainData, bc) => {
    try {
      const result = await syncInbox();
      if (result.newCount > 0) {
        addLog('start', `[inbox-sync] ${result.newCount} new message(s)`);
        bc({ event: 'inbox-synced', data: result });
        // Feed new messages to auto-converse
        await processNewMessages(result);
      }
    } catch (err) {
      // Inbox sync is non-critical — log and continue
      console.error('[inbox-sync] Error:', err.message);
    }
  });

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
  stopHeartbeatPoller();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  addLog('error', `Uncaught exception: ${err.message}`);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  addLog('error', `Unhandled rejection: ${reason}`);
});
