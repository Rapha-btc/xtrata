import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson } from './_inscription-helpers.mjs';
import { startWorkspaceServer } from './serve-workspace.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    args[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }
  return args;
}

async function canRunPlaywrightScreenshot() {
  return await new Promise((resolve) => {
    const child = spawn('playwright', ['screenshot', '--help'], { stdio: 'ignore' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function runScreenshot(url, outPath, waitForSelector = 'html[data-bvst-ready="1"]') {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      'playwright',
      [
        'screenshot',
        '--browser',
        'chromium',
        '--timeout',
        '15000',
        '--wait-for-selector',
        waitForSelector,
        '--wait-for-timeout',
        '1500',
        '--viewport-size',
        '1440,960',
        url,
        outPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `playwright screenshot failed for ${url}`));
    });
  });
}

export async function runWorkspaceBrowserSmoke() {
  if (!await canRunPlaywrightScreenshot()) {
    return { available: false, reason: 'Playwright CLI is not available.' };
  }

  const selection = await readJson('configs/first-wave-selection.json');
  const screenshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bvst-browser-smoke-'));
  const { server, address } = await startWorkspaceServer({ port: 0, host: '127.0.0.1' });
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const screenshots = [];
    const samplerScreenshots = [];
    for (const family of selection.families || []) {
      for (const pluginName of family.plugins || []) {
        const outPath = path.join(screenshotRoot, `${pluginName}.png`);
        const url = `${baseUrl}/Plugins/Instruments/${pluginName}/gui.html?standalone=1&t=browser-smoke`;
        await runScreenshot(url, outPath);
        const stat = await fs.stat(outPath);
        screenshots.push({
          plugin: pluginName,
          url,
          screenshot: outPath,
          bytes: stat.size
        });
      }
    }

    const samplerUrl = `${baseUrl}/System/tests/sampler-smoke.html?t=browser-smoke`;
    const samplerPath = path.join(screenshotRoot, 'SamplerSmoke.png');
    await runScreenshot(
      samplerUrl,
      samplerPath,
      'html[data-bvst-ready="1"][data-bvst-sampler-loaded="1"]'
    );
    const samplerStat = await fs.stat(samplerPath);
    samplerScreenshots.push({
      name: 'SamplerSmoke',
      url: samplerUrl,
      screenshot: samplerPath,
      bytes: samplerStat.size
    });

    return {
      available: true,
      baseUrl,
      screenshotRoot,
      screenshots,
      samplerScreenshots
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function main() {
  parseArgs(process.argv.slice(2));
  const result = await runWorkspaceBrowserSmoke();
  if (!result.available) {
    console.log(`Browser smoke skipped: ${result.reason}`);
    return;
  }
  console.log(
    `Browser smoke passed: ${result.screenshots.length} plugin pages and ${result.samplerScreenshots.length} sampler page reached ready state.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
