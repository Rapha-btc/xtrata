import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  fileMetrics,
  loadModuleIndex,
  readJsonAt,
  toPosix,
  writeJson,
  writeJsonAt
} from './_inscription-helpers.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateRefMetadata(node, recordByName) {
  if (Array.isArray(node)) {
    return node.map((value) => updateRefMetadata(value, recordByName));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = updateRefMetadata(value, recordByName);
  }

  const record = typeof node.name === 'string' ? recordByName.get(node.name) : null;
  if (record) {
    if ('path' in node) out.path = record.bundle_path;
    if ('mime_type' in node) out.mime_type = record.mime_type;
    if ('sha256' in node) out.sha256 = record.expected_sha256;
    if ('bytes' in node) out.bytes = record.bytes;
    if ('chunks' in node) out.chunks = record.chunks;
    if ('route' in node) out.route = record.route;
  }

  return out;
}

function buildLocalStatus(records) {
  return {
    generated_at: new Date().toISOString(),
    module_count: records.length,
    helper_count: records.filter((record) => record.route === 'helper').length,
    staged_count: records.filter((record) => record.route === 'staged').length,
    total_bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    first_wave_plugins: [
      'UniversalSynth',
      'UniversalEngine',
      'JMS10',
      'RetroKeys',
      'BlueMarvinOne',
      'BlueMarvinTwo',
      'NeonPoly'
    ]
  };
}

export async function refreshBundleMetadata() {
  const moduleIndex = await loadModuleIndex();
  const updatedRecords = clone(moduleIndex);
  const recordByName = new Map(updatedRecords.map((record) => [record.name, record]));

  for (const record of updatedRecords.filter((entry) => entry.kind === 'leaf')) {
    const absPath = path.join(bundleRoot, record.bundle_path.replace(/^on-chain-modules\//, ''));
    const stats = await fileMetrics(absPath);
    record.expected_sha256 = stats.sha256;
    record.bytes = stats.bytes;
    record.chunks = stats.chunks;
    record.route = stats.route;
  }

  for (const record of updatedRecords.filter((entry) => entry.kind === 'catalog')) {
    const absPath = path.join(bundleRoot, record.bundle_path.replace(/^on-chain-modules\//, ''));
    const json = await readJsonAt(absPath);
    const refreshed = updateRefMetadata(json, recordByName);
    await writeJsonAt(absPath, refreshed);
    const stats = await fileMetrics(absPath);
    record.expected_sha256 = stats.sha256;
    record.bytes = stats.bytes;
    record.chunks = stats.chunks;
    record.route = stats.route;
  }

  await writeJson('verification/module-index.json', updatedRecords);

  const batchesDir = path.join(bundleRoot, 'batches');
  const batchFiles = (await (await import('node:fs')).promises.readdir(batchesDir))
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const file of batchFiles) {
    const absPath = path.join(batchesDir, file);
    const batch = await readJsonAt(absPath);
    for (const artifact of batch.artifacts || []) {
      const record = recordByName.get(artifact.name);
      if (!record) continue;
      artifact.path = record.bundle_path;
      artifact.mime = record.mime_type;
      artifact.bytes = record.bytes;
      artifact.chunks = record.chunks;
      artifact.sha256 = record.expected_sha256;
      artifact.route = record.route;
    }
    await writeJsonAt(absPath, batch);
  }

  await writeJson('verification/local-status.json', buildLocalStatus(updatedRecords));

  return {
    moduleCount: updatedRecords.length,
    helperCount: updatedRecords.filter((record) => record.route === 'helper').length,
    stagedCount: updatedRecords.filter((record) => record.route === 'staged').length
  };
}

async function main() {
  const result = await refreshBundleMetadata();
  console.log(
    `Refreshed bundle metadata for ${result.moduleCount} modules (${result.helperCount} helper, ${result.stagedCount} staged).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
