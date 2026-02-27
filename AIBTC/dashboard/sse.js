// dashboard/sse.js

const clients = new Set();

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  // Send an immediate 'open' event to establish the connection.
  res.write('event: open\\ndata: {}\\n\\n');

  console.log('SSE client connected, open event sent.');

  clients.add(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\\n\\n');
  }, 30000);

  req.on('close', () => {
    clients.delete(res);
    clearInterval(heartbeat);
    console.log('SSE client disconnected.');
  });
}

function broadcast({ event, data }) {
  if (!clients.size) return;
  const payload = `event: ${event}\\ndata: ${JSON.stringify(data)}\\n\\n`;
  // console.log(`Broadcasting SSE event: ${event}`);
  for (const client of clients) {
    client.write(payload);
  }
}

module.exports = { sseHandler, broadcast };
