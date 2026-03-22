import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultPort = 8123;
const workspaceRoot = path.resolve(fileURLToPath(new URL('../workspace', import.meta.url)));

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
]);

function parsePort(argv) {
  const portFlag = argv.find((arg) => arg.startsWith('--port='));
  if (portFlag) {
    const value = Number(portFlag.slice('--port='.length));
    if (Number.isFinite(value) && value > 0) return value;
  }

  const portIndex = argv.indexOf('--port');
  if (portIndex >= 0 && argv[portIndex + 1]) {
    const value = Number(argv[portIndex + 1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  if (process.env.PORT) {
    const value = Number(process.env.PORT);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return defaultPort;
}

function safePathname(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0]);
  const clean = raw === '/' ? '/index.html' : raw;
  const abs = path.resolve(workspaceRoot, `.${clean}`);
  if (!abs.startsWith(workspaceRoot)) {
    return null;
  }
  return abs;
}

async function sendFile(res, absPath) {
  let filePath = absPath;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes.get(ext) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Server error: ${err && err.message ? err.message : String(err)}`);
  }
}

const port = parsePort(process.argv.slice(2));

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  const pathname = safePathname(req.url || '/');
  if (!pathname) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (method === 'HEAD') {
    try {
      const stat = await fs.stat(pathname);
      const filePath = stat.isDirectory() ? path.join(pathname, 'index.html') : pathname;
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes.get(ext) || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end();
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end();
    }
    return;
  }

  await sendFile(res, pathname);
});

export function createWorkspaceServer() {
  return http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }

    const pathname = safePathname(req.url || '/');
    if (!pathname) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    if (method === 'HEAD') {
      try {
        const stat = await fs.stat(pathname);
        const filePath = stat.isDirectory() ? path.join(pathname, 'index.html') : pathname;
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': mimeTypes.get(ext) || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end();
      } catch (_) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end();
      }
      return;
    }

    await sendFile(res, pathname);
  });
}

export async function startWorkspaceServer({ port = defaultPort, host = '127.0.0.1' } = {}) {
  const server = createWorkspaceServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return { server, address };
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  const { address } = await startWorkspaceServer({ port, host: '127.0.0.1' });
  console.log(`Serving BVST bundle workspace at http://127.0.0.1:${address.port}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
