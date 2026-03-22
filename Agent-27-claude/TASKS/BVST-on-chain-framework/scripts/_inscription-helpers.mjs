import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CHUNK_SIZE = 16_384;
export const HELPER_LIMIT = 30;

export const defaultBundleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const bundleRoot = process.env.XTRATA_BUNDLE_ROOT
  ? path.resolve(process.env.XTRATA_BUNDLE_ROOT)
  : defaultBundleRoot;
export const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

export const defaultTokenTemplatePath = path.join(bundleRoot, 'configs', 'token-map.template.json');
export const defaultTokenMapPath = path.join(bundleRoot, 'configs', 'token-map.runtime.json');
export const defaultInscriptionLogPath = path.join(bundleRoot, 'verification', 'inscription-log.json');
export const defaultRenderedIndexPath = path.join(bundleRoot, 'verification', 'rendered-index.json');
export const defaultRenderRoot = path.join(bundleRoot, 'rendered');

export function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonAt(absPath) {
  return JSON.parse(await fs.readFile(absPath, 'utf8'));
}

export async function writeJsonAt(absPath, value) {
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(relPath) {
  return readJsonAt(path.join(bundleRoot, relPath));
}

export async function writeJson(relPath, value) {
  return writeJsonAt(path.join(bundleRoot, relPath), value);
}

export function absFromLogicalPath(logicalPath) {
  const trimmed = logicalPath.replace(/^on-chain-modules\//, '');
  return path.join(bundleRoot, trimmed);
}

export function displayPath(absPath) {
  if (absPath.startsWith(bundleRoot)) {
    return toPosix(path.relative(bundleRoot, absPath));
  }
  if (absPath.startsWith(repoRoot)) {
    return toPosix(path.relative(repoRoot, absPath));
  }
  return toPosix(absPath);
}

export async function fileMetrics(absPath) {
  const buf = await fs.readFile(absPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const bytes = buf.length;
  const chunks = bytes === 0 ? 0 : Math.ceil(bytes / CHUNK_SIZE);
  const route = chunks <= HELPER_LIMIT ? 'helper' : 'staged';
  return { sha256, bytes, chunks, route };
}

export async function loadModuleIndex() {
  return readJson('verification/module-index.json');
}

export async function loadTokenMap(tokenMapPath = defaultTokenMapPath) {
  return readJsonAt(tokenMapPath);
}

export async function loadExecutionBatches() {
  const batchesDir = path.join(bundleRoot, 'batches');
  const files = (await fs.readdir(batchesDir))
    .filter((name) => name.endsWith('.json') && name !== '99-master-release.batch.json')
    .sort();
  const batches = [];
  for (const file of files) {
    const absPath = path.join(batchesDir, file);
    batches.push({ file, batch: JSON.parse(await fs.readFile(absPath, 'utf8')) });
  }
  return batches;
}

export async function loadBatchArtifactLookup() {
  const lookup = new Map();
  for (const { file, batch } of await loadExecutionBatches()) {
    for (const artifact of batch.artifacts || []) {
      lookup.set(artifact.name, { file, artifact });
    }
  }
  return lookup;
}

export function isTokenResolved(entry) {
  return Boolean(
    entry &&
    entry.token_id !== null &&
    entry.token_id !== undefined &&
    entry.txid !== null &&
    entry.txid !== undefined &&
    entry.block_height !== null &&
    entry.block_height !== undefined
  );
}

export function createResolutionSignature(names, entriesMap) {
  const payload = names.map((name) => {
    const entry = entriesMap.get(name);
    return [
      name,
      entry?.token_id ?? null,
      entry?.txid ?? null,
      entry?.block_height ?? null
    ];
  });
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
