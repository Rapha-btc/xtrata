import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  createResolutionSignature,
  ensureDir,
  fileMetrics,
  isTokenResolved,
  pathExists,
  readJsonAt,
  toPosix,
  writeJsonAt
} from './_inscription-helpers.mjs';

const samplerWaveRoot = path.join(bundleRoot, 'sampler-wave');
const defaultTokenMapPath = path.join(samplerWaveRoot, 'configs', 'token-map.runtime.json');
const defaultRenderRoot = path.join(samplerWaveRoot, 'rendered');
const defaultRenderedIndexPath = path.join(samplerWaveRoot, 'verification', 'rendered-index.json');

const templateFiles = [
  'manifests/sources/samplerlab.sine220.source-manifest.json',
  'manifests/sources/samplerlab.sine440.source-manifest.json',
  'catalogs/sources/samplerlab.default-sources.catalog.json',
  'catalogs/plugins/sampler-wave/samplerlab.release.catalog.json',
  'catalogs/families/sampler-wave.catalog.json',
  'catalogs/releases/sampler-wave.catalog.json'
];

function parseArgs(argv) {
  const args = {
    tokenMapPath: defaultTokenMapPath,
    renderRoot: defaultRenderRoot,
    renderedIndexPath: defaultRenderedIndexPath
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--token-map' && argv[index + 1]) {
      args.tokenMapPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--render-root' && argv[index + 1]) {
      args.renderRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--out' && argv[index + 1]) {
      args.renderedIndexPath = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function addRequiredName(name, orderedNames, seenNames, tokenEntries) {
  if (typeof name !== 'string' || !tokenEntries.has(name) || seenNames.has(name)) return;
  seenNames.add(name);
  orderedNames.push(name);
}

function collectRequiredNames(node, orderedNames, seenNames, tokenEntries) {
  if (Array.isArray(node)) {
    for (const value of node) collectRequiredNames(value, orderedNames, seenNames, tokenEntries);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (typeof node.name === 'string' && ('token_id' in node || 'txid' in node || 'block_height' in node)) {
    addRequiredName(node.name, orderedNames, seenNames, tokenEntries);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key !== 'name' && typeof value === 'string') {
      addRequiredName(value, orderedNames, seenNames, tokenEntries);
      continue;
    }
    collectRequiredNames(value, orderedNames, seenNames, tokenEntries);
  }
}

function resolveNode(node, tokenEntries) {
  if (Array.isArray(node)) return node.map((value) => resolveNode(value, tokenEntries));
  if (!node || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = resolveNode(value, tokenEntries);
    if (key !== 'name' && typeof value === 'string' && tokenEntries.has(value)) {
      const ref = tokenEntries.get(value);
      out[`${key}_token_id`] = ref.token_id;
      out[`${key}_txid`] = ref.txid;
      out[`${key}_block_height`] = ref.block_height;
    }
  }

  if (typeof node.name === 'string' && tokenEntries.has(node.name)) {
    const ref = tokenEntries.get(node.name);
    if ('token_id' in node) out.token_id = ref.token_id;
    if ('txid' in node) out.txid = ref.txid;
    if ('block_height' in node) out.block_height = ref.block_height;
  }

  return out;
}

function injectContentUrls(json) {
  if (json.schema === 'bvst.sample-source/v1') {
    const txid = json.audio_leaf?.txid || null;
    const template = json.runtime_source?.content_url_template || '';
    json.runtime_source.content_url = txid && template ? template.replace('{txid}', txid) : null;
    return json;
  }

  if (json.type === 'sample-source-catalog' && Array.isArray(json.sources)) {
    for (const source of json.sources) {
      if (source.audio_leaf_txid == null && source.audio_leaf_name_txid != null) {
        source.audio_leaf_txid = source.audio_leaf_name_txid;
      }
      if (source.audio_leaf_token_id == null && source.audio_leaf_name_token_id != null) {
        source.audio_leaf_token_id = source.audio_leaf_name_token_id;
      }
      if (source.audio_leaf_block_height == null && source.audio_leaf_name_block_height != null) {
        source.audio_leaf_block_height = source.audio_leaf_name_block_height;
      }
      const template = source.content_url_template || '';
      source.content_url = source.audio_leaf_txid && template
        ? template.replace('{audio_leaf_txid}', source.audio_leaf_txid)
        : null;
    }
  }

  return json;
}

export async function renderSamplerWaveCatalogs(options = {}) {
  const tokenMapPath = path.resolve(options.tokenMapPath || defaultTokenMapPath);
  const renderRoot = path.resolve(options.renderRoot || defaultRenderRoot);
  const renderedIndexPath = path.resolve(options.renderedIndexPath || defaultRenderedIndexPath);

  const tokenMap = await readJsonAt(tokenMapPath);
  const tokenEntries = new Map(Object.entries(tokenMap.entries || {}));

  await ensureDir(renderRoot);

  const catalogs = [];
  for (const relPath of templateFiles) {
    const templateAbs = path.join(samplerWaveRoot, relPath);
    const templateJson = await readJsonAt(templateAbs);
    const requiredNames = [];
    const seenNames = new Set();
    collectRequiredNames(templateJson, requiredNames, seenNames, tokenEntries);
    const missingDependencies = requiredNames.filter((name) => !isTokenResolved(tokenEntries.get(name)));
    const resolutionSignature = createResolutionSignature(requiredNames, tokenEntries);
    const renderedAbs = path.join(renderRoot, relPath);

    if (missingDependencies.length > 0) {
      if (await pathExists(renderedAbs)) {
        await fs.rm(renderedAbs, { force: true });
      }
      catalogs.push({
        name: templateJson.name,
        template_path: toPosix(path.join('sampler-wave', relPath)),
        status: 'pending',
        missing_dependencies: missingDependencies,
        rendered_path: null,
        resolution_signature: resolutionSignature
      });
      continue;
    }

    const renderedJson = injectContentUrls(resolveNode(templateJson, tokenEntries));
    renderedJson.resolved_dependency_names = requiredNames;
    renderedJson.resolved_at = new Date().toISOString();
    await ensureDir(path.dirname(renderedAbs));
    await fs.writeFile(renderedAbs, `${JSON.stringify(renderedJson, null, 2)}\n`, 'utf8');
    const stats = await fileMetrics(renderedAbs);
    catalogs.push({
      name: templateJson.name,
      template_path: toPosix(path.join('sampler-wave', relPath)),
      status: 'ready',
      missing_dependencies: [],
      rendered_path: toPosix(path.relative(bundleRoot, renderedAbs)),
      rendered_sha256: stats.sha256,
      rendered_bytes: stats.bytes,
      rendered_chunks: stats.chunks,
      rendered_route: stats.route,
      resolution_signature: resolutionSignature
    });
  }

  const out = {
    generated_at: new Date().toISOString(),
    token_map: toPosix(path.relative(bundleRoot, tokenMapPath)),
    catalogs
  };
  await writeJsonAt(renderedIndexPath, out);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await renderSamplerWaveCatalogs(args);
  const ready = result.catalogs.filter((entry) => entry.status === 'ready').length;
  const pending = result.catalogs.filter((entry) => entry.status === 'pending').length;
  console.log(`Rendered sampler-wave templates: ${ready} ready, ${pending} pending.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
