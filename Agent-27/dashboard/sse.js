// dashboard/sse.js

const clients = new Set();

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Hint reconnect interval for EventSource clients.
  res.write('retry: 5000\n\n');
  writeEvent(res, 'log', { type: 'stdout', line: 'SSE stream connected.' });
  console.log('SSE client connected.');

  clients.add(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      cleanup();
    }
  }, 30000);

  function cleanup() {
    if (!clients.has(res)) return;
    clients.delete(res);
    clearInterval(heartbeat);
    console.log('SSE client disconnected.');
  }

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

function broadcast({ event, data }) {
  if (!clients.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // console.log(`Broadcasting SSE event: ${event}`);
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

module.exports = { sseHandler, broadcast };
