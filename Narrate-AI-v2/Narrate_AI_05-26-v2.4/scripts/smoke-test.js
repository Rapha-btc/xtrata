const { spawn } = require('child_process');

const PORT = process.env.SMOKE_PORT || '3199';
const BASE_URL = 'http://127.0.0.1:' + PORT;
const START_TIMEOUT_MS = 8000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path) {
  const response = await fetch(BASE_URL + path, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(path + ' returned HTTP ' + response.status + ': ' + JSON.stringify(body));
  }
  return body;
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error('Server exited before smoke tests could run.');
    }
    try {
      const health = await fetchJson('/api/health');
      if (health && health.ok) return health;
    } catch (_) {}
    await wait(150);
  }
  throw new Error('Timed out waiting for server on ' + BASE_URL);
}

async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { PORT }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  try {
    const health = await waitForServer(child);
    if (health.version !== '2.4') {
      throw new Error('Expected health version 2.4, got ' + JSON.stringify(health));
    }

    const models = await fetchJson('/api/models');
    if (!Array.isArray(models.models) || !models.models.length) {
      throw new Error('/api/models did not return model metadata.');
    }

    const indexResponse = await fetch(BASE_URL + '/', { cache: 'no-store' });
    const indexHtml = await indexResponse.text();
    if (!indexResponse.ok || !indexHtml.includes('Narrate:AI Studio v2.4')) {
      throw new Error('Index page did not return the v2.4 UI.');
    }

    const serverJsResponse = await fetch(BASE_URL + '/server.js', { cache: 'no-store' });
    if (serverJsResponse.status !== 404) {
      throw new Error('Static server exposed server.js with HTTP ' + serverJsResponse.status);
    }
  } finally {
    child.kill('SIGTERM');
    await wait(100);
  }

  if (stderr.includes('EADDRINUSE')) {
    throw new Error('Smoke server hit a port conflict: ' + stderr);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
