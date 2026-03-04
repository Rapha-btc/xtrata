// dashboard/server.js
const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const { sseHandler, broadcast } = require('./sse');
const stateManager = require('./state');
const markdown = require('./markdown');
const { initPhases, runPhase, cancelPhase, getPhaseStatus, getLatestDraft } = require('./phases');
const { initWatcher, stopWatcher } = require('./watcher');
const { startChainPoller, stopChainPoller, getChainData } = require('./chain');
const { WORKDIR, AVG_COST_PER_ENTRY } = require('./config');

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
