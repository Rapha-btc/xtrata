import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, loadModuleIndex } from './_inscription-helpers.mjs';
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

function bundlePathToWorkspaceUrl(bundlePath) {
  return `/${bundlePath.replace(/^on-chain-modules\/workspace\//, '')}`;
}

function expectedProcessorPathFromManifestUrl(urlPath) {
  const absolute = new URL(urlPath, 'http://127.0.0.1');
  const parts = absolute.pathname.split('/');
  parts[parts.length - 1] = 'processor_unified.js';
  absolute.pathname = parts.join('/');
  return absolute.pathname;
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

export async function runWorkspaceHttpSmoke() {
  const { server, address } = await startWorkspaceServer({ port: 0, host: '127.0.0.1' });
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const moduleIndex = await loadModuleIndex();
    const leafWorkspaceArtifacts = moduleIndex.filter((record) => record.kind === 'leaf');
    const firstWave = await readJson('configs/first-wave-selection.json');
    const pluginChecks = [];
    const samplerChecks = [];

    for (const record of leafWorkspaceArtifacts) {
      const relUrl = bundlePathToWorkspaceUrl(record.bundle_path);
      await fetchRequired(`${baseUrl}${relUrl}`, record.mime_type.split(';')[0]);
    }

    for (const family of firstWave.families || []) {
      for (const pluginName of family.plugins || []) {
        const pagePath = `/Plugins/Instruments/${pluginName}/gui.html?standalone=1&t=http-smoke`;
        const pageUrl = `${baseUrl}${pagePath}`;
        await fetchRequired(pageUrl, 'text/html');

        const manifestUrl = `${baseUrl}/Plugins/Instruments/${pluginName}/manifest.json`;
        const patchUrl = `${baseUrl}/Plugins/Instruments/${pluginName}/patch.json`;
        const manifestRes = await fetchRequired(manifestUrl, 'application/json');
        await fetchRequired(patchUrl, 'application/json');

        const manifest = await manifestRes.json();
        const wasmPath = new URL(manifest.components.audio_engine, manifestUrl).pathname;
        const processorPath = expectedProcessorPathFromManifestUrl(wasmPath);
        const patchRuntimePath = new URL('../../../System/shared/patch_runtime.js', pageUrl).pathname;

        await fetchRequired(`${baseUrl}${patchRuntimePath}`, 'application/javascript');
        await fetchRequired(`${baseUrl}${processorPath}`, 'application/javascript');
        await fetchRequired(`${baseUrl}${wasmPath}`, 'application/wasm');

        pluginChecks.push({
          plugin: pluginName,
          page: pagePath,
          manifest: new URL(manifestUrl).pathname,
          patch: new URL(patchUrl).pathname,
          wasm: wasmPath,
          processor: processorPath
        });
      }
    }

    const samplerPage = '/System/tests/sampler-smoke.html?t=http-smoke';
    const samplerScript = '/System/tests/sampler-smoke.js';
    await fetchRequired(`${baseUrl}${samplerPage}`, 'text/html');
    await fetchRequired(`${baseUrl}${samplerScript}`, 'application/javascript');
    await fetchRequired(`${baseUrl}/System/shared/patch_runtime.js`, 'application/javascript');
    await fetchRequired(`${baseUrl}/System/shared/processor_unified.js`, 'application/javascript');
    await fetchRequired(`${baseUrl}/System/shared/bvst_unified_bg.wasm`, 'application/wasm');
    samplerChecks.push({
      page: samplerPage,
      script: samplerScript,
      patchRuntime: '/System/shared/patch_runtime.js',
      processor: '/System/shared/processor_unified.js',
      wasm: '/System/shared/bvst_unified_bg.wasm'
    });

    return {
      baseUrl,
      workspaceLeafCount: leafWorkspaceArtifacts.length,
      pluginCount: pluginChecks.length,
      pluginChecks,
      samplerChecks
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function main() {
  parseArgs(process.argv.slice(2));
  const result = await runWorkspaceHttpSmoke();
  console.log(
    `HTTP workspace smoke passed: ${result.workspaceLeafCount} leaf assets, ${result.pluginCount} plugin shells, and ${result.samplerChecks.length} sampler test page over ${result.baseUrl}.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
