// dashboard/server.js
const express = require('express');
const path = require('path');
const { sseHandler, broadcast } = require('./sse');

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
  res.json({ placeholder: 'status data will go here' });
});

app.get('/api/research', (req, res) => {
  res.json({ placeholder: 'research buffer data will go here' });
});

app.get('/api/ideas', (req, res) => {
  res.json({ placeholder: 'ideas data will go here' });
});

app.get('/api/ledger', (req, res) => {
  res.json({ placeholder: 'ledger data will go here' });
});

app.get('/api/log', (req, res) => {
  res.json([{ type: 'stdout', line: 'Activity log will appear here...' }]);
});

// --- SSE Route ---
app.get('/events', sseHandler);


// --- Main Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Agent 27 Dashboard server running at http://localhost:${PORT}`);
  console.log('Serving dashboard.html and API endpoints.');
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('\nShutting down Agent 27 Dashboard...');
  // In future phases, we will stop schedulers and watchers here
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
