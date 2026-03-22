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

async function runScreenshot(url, outPath, waitForSelector) {
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

async function fetchRequired(url, expectedContentType) {
  const response = await fetch(url, { cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} (${response.status})`);
  }
  if (expectedContentType && !contentType.includes(expectedContentType)) {
    throw new Error(`Unexpected content type for ${url}: ${contentType}`);
  }
  return response;
}

export async function runSamplerWaveSmoke() {
  const selection = await readJson('configs/sampler-wave-selection.json');
  const screenshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bvst-sampler-wave-smoke-'));
  const { server, address } = await startWorkspaceServer({ port: 0, host: '127.0.0.1' });
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const families = Array.isArray(selection.families) ? selection.families : [];
    const pluginChecks = [];
    const patchChecks = [];
    const screenshots = [];
    const browserAvailable = await canRunPlaywrightScreenshot();

    for (const family of families) {
      for (const pluginName of family.plugins || []) {
        const pluginRoot = path.join(
          path.resolve(fileURLToPath(new URL('../workspace', import.meta.url))),
          'Plugins',
          'Instruments',
          pluginName
        );
        const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'manifest.json'), 'utf8'));
        const patch = JSON.parse(await fs.readFile(path.join(pluginRoot, 'patch.json'), 'utf8'));

        if (patch.config?.sampler?.sourcePolicy !== 'declared-only') {
          throw new Error(`${pluginName} base sampler policy must stay declared-only.`);
        }
        if (patch.config?.profiles?.standalone?.sampler?.sourcePolicy !== 'standalone-dev') {
          throw new Error(`${pluginName} standalone sampler policy must be standalone-dev.`);
        }

        const page = `/Plugins/Instruments/${pluginName}/gui.html?standalone=1&autoSmoke=1&t=sampler-wave-smoke`;
        await fetchRequired(`${baseUrl}${page}`, 'text/html');
        await fetchRequired(`${baseUrl}/Plugins/Instruments/${pluginName}/manifest.json`, 'application/json');
        await fetchRequired(`${baseUrl}/Plugins/Instruments/${pluginName}/patch.json`, 'application/json');
        await fetchRequired(`${baseUrl}/Plugins/Instruments/${pluginName}/sampler_lab_boot.js`, 'application/javascript');

        pluginChecks.push({
          plugin: pluginName,
          page,
          manifest: manifest.name,
          version: manifest.version
        });
        patchChecks.push({
          plugin: pluginName,
          engineAlias: patch.config?.name || '',
          basePolicy: patch.config?.sampler?.sourcePolicy || '',
          standalonePolicy: patch.config?.profiles?.standalone?.sampler?.sourcePolicy || ''
        });

        if (browserAvailable) {
          const outPath = path.join(screenshotRoot, `${pluginName}.png`);
          await runScreenshot(
            `${baseUrl}${page}`,
            outPath,
            'html[data-bvst-sampler-lab-ready="1"][data-bvst-sampler-loaded="1"][data-bvst-sampler-engine-loaded="1"]'
          );
          const stat = await fs.stat(outPath);
          screenshots.push({
            plugin: pluginName,
            screenshot: outPath,
            bytes: stat.size
          });
        }
      }
    }

    return {
      baseUrl,
      browserAvailable,
      screenshotRoot,
      pluginChecks,
      patchChecks,
      screenshots
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function main() {
  parseArgs(process.argv.slice(2));
  const result = await runSamplerWaveSmoke();
  console.log(
    `Sampler-wave smoke passed: ${result.pluginChecks.length} plugin shell checked, browser=${result.browserAvailable ? 'yes' : 'no'}.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
