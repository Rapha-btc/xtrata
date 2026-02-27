// dashboard/server.js
const express = require('express');
const path = require('path');
const { sseHandler, broadcast } = require('./sse');
const stateManager = require('./state');
const markdown = require('./markdown');

const app = express();
const PORT = 2727;

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
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

app.get('/api/log', (req, res) => {
  res.json([{ type: 'stdout', line: 'Activity log will appear here...' }]);
});

app.get('/api/chain', (req, res) => {
  res.json({ placeholder: 'chain data will go here' });
});

// --- SSE Route ---
app.get('/events', sseHandler);


// --- Main Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Agent 27 Dashboard server running at http://localhost:${PORT}`);
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('\\nShutting down Agent 27 Dashboard...');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
