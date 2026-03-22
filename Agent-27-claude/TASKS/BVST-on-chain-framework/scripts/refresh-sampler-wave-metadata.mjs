import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  clone,
  fileMetrics,
  readJsonAt,
  toPosix,
  writeJsonAt
} from './_inscription-helpers.mjs';

const samplerWaveRoot = path.join(bundleRoot, 'sampler-wave');

const leafDefinitions = [
  {
    name: 'bvst.schema.sample-source.v1',
    kind: 'leaf',
    path: 'sampler-wave/schemas/bvst_sample_source_v1.schema.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.plugin.samplerlab.manifest.v0.1.0',
    kind: 'leaf',
    path: 'on-chain-modules/workspace/Plugins/Instruments/SamplerLab/manifest.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.plugin.samplerlab.patch.v0.1.0',
    kind: 'leaf',
    path: 'on-chain-modules/workspace/Plugins/Instruments/SamplerLab/patch.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.plugin.samplerlab.shell.v0.1.0',
    kind: 'leaf',
    path: 'on-chain-modules/workspace/Plugins/Instruments/SamplerLab/gui.html',
    mime_type: 'text/html'
  },
  {
    name: 'bvst.sample.samplerlab.sine220.audio.v1',
    kind: 'leaf',
    path: 'sampler-wave/assets/audio/samplerlab.sine220.audio.wav',
    mime_type: 'audio/wav'
  },
  {
    name: 'bvst.sample.samplerlab.sine220.source-manifest.v1',
    kind: 'leaf',
    path: 'sampler-wave/manifests/sources/samplerlab.sine220.source-manifest.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.sample.samplerlab.sine440.audio.v1',
    kind: 'leaf',
    path: 'sampler-wave/assets/audio/samplerlab.sine440.audio.wav',
    mime_type: 'audio/wav'
  },
  {
    name: 'bvst.sample.samplerlab.sine440.source-manifest.v1',
    kind: 'leaf',
    path: 'sampler-wave/manifests/sources/samplerlab.sine440.source-manifest.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.catalog.source.samplerlab.defaultset.v1',
    kind: 'catalog',
    path: 'sampler-wave/catalogs/sources/samplerlab.default-sources.catalog.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.plugin.samplerlab.release.v0.1.0',
    kind: 'catalog',
    path: 'sampler-wave/catalogs/plugins/sampler-wave/samplerlab.release.catalog.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.catalog.family.samplerwave.v1',
    kind: 'catalog',
    path: 'sampler-wave/catalogs/families/sampler-wave.catalog.json',
    mime_type: 'application/json'
  },
  {
    name: 'bvst.catalog.release.samplerwave.v1',
    kind: 'catalog',
    path: 'sampler-wave/catalogs/releases/sampler-wave.catalog.json',
    mime_type: 'application/json'
  }
];

function absFromLogical(logicalPath) {
  const trimmed = logicalPath.replace(/^on-chain-modules\//, '');
  return path.join(bundleRoot, trimmed);
}

function buildStatus(records) {
  return {
    generated_at: new Date().toISOString(),
    module_count: records.length,
    leaf_count: records.filter((record) => record.kind === 'leaf').length,
    catalog_count: records.filter((record) => record.kind === 'catalog').length,
    total_bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    helper_count: records.filter((record) => record.route === 'helper').length,
    staged_count: records.filter((record) => record.route === 'staged').length
  };
}

export async function refreshSamplerWaveMetadata() {
  const records = [];

  for (const def of leafDefinitions) {
    const absPath = absFromLogical(def.path);
    const stats = await fileMetrics(absPath);
    records.push({
      name: def.name,
      kind: def.kind,
      path: def.path,
      mime_type: def.mime_type,
      sha256: stats.sha256,
      bytes: stats.bytes,
      chunks: stats.chunks,
      route: stats.route
    });
  }

  const byName = new Map(records.map((record) => [record.name, record]));

  for (const manifestName of [
    'bvst.sample.samplerlab.sine220.source-manifest.v1',
    'bvst.sample.samplerlab.sine440.source-manifest.v1'
  ]) {
    const record = byName.get(manifestName);
    const manifestAbs = absFromLogical(record.path);
    const manifest = clone(await readJsonAt(manifestAbs));
    const audioRecord = byName.get(manifest.audio_leaf.name);
    manifest.audio_leaf.path = audioRecord.path;
    manifest.audio_leaf.mime_type = audioRecord.mime_type;
    manifest.audio_leaf.sha256 = audioRecord.sha256;
    manifest.audio_leaf.bytes = audioRecord.bytes;
    manifest.audio_leaf.chunks = audioRecord.chunks;
    manifest.audio_leaf.route = audioRecord.route;
    await writeJsonAt(manifestAbs, manifest);

    const stats = await fileMetrics(manifestAbs);
    record.sha256 = stats.sha256;
    record.bytes = stats.bytes;
    record.chunks = stats.chunks;
    record.route = stats.route;
  }

  const releaseCatalogAbs = absFromLogical('sampler-wave/catalogs/plugins/sampler-wave/samplerlab.release.catalog.json');
  const releaseCatalog = clone(await readJsonAt(releaseCatalogAbs));
  for (const key of ['sample_source_schema', 'manifest', 'patch', 'shell']) {
    const dep = releaseCatalog.dependencies[key];
    const record = byName.get(dep.name);
    dep.path = record.path;
    dep.mime_type = record.mime_type;
    dep.sha256 = record.sha256;
    dep.bytes = record.bytes;
    dep.chunks = record.chunks;
    dep.route = record.route;
  }
  await writeJsonAt(releaseCatalogAbs, releaseCatalog);
  {
    const record = byName.get('bvst.plugin.samplerlab.release.v0.1.0');
    const stats = await fileMetrics(releaseCatalogAbs);
    record.sha256 = stats.sha256;
    record.bytes = stats.bytes;
    record.chunks = stats.chunks;
    record.route = stats.route;
  }

  for (const name of [
    'bvst.catalog.source.samplerlab.defaultset.v1',
    'bvst.catalog.family.samplerwave.v1',
    'bvst.catalog.release.samplerwave.v1'
  ]) {
    const record = byName.get(name);
    const stats = await fileMetrics(absFromLogical(record.path));
    record.sha256 = stats.sha256;
    record.bytes = stats.bytes;
    record.chunks = stats.chunks;
    record.route = stats.route;
  }

  for (const batchFile of [
    '50-sampler-wave-foundation.batch.json',
    '60-sampler-wave-sources.batch.json',
    '70-sampler-wave-catalogs.batch.json'
  ]) {
    const batchAbs = path.join(samplerWaveRoot, 'batches', batchFile);
    const batch = clone(await readJsonAt(batchAbs));
    for (const artifact of batch.artifacts || []) {
      const record = byName.get(artifact.name);
      if (!record) continue;
      artifact.path = record.path;
      artifact.mime = record.mime_type;
      artifact.bytes = record.bytes;
      artifact.chunks = record.chunks;
      artifact.sha256 = record.sha256;
      artifact.route = record.route;
    }
    await writeJsonAt(batchAbs, batch);
  }

  await writeJsonAt(path.join(samplerWaveRoot, 'verification', 'module-index.json'), records);
  await writeJsonAt(path.join(samplerWaveRoot, 'verification', 'track-status.json'), buildStatus(records));

  return {
    moduleCount: records.length,
    helperCount: records.filter((record) => record.route === 'helper').length,
    stagedCount: records.filter((record) => record.route === 'staged').length
  };
}

async function main() {
  const result = await refreshSamplerWaveMetadata();
  console.log(
    `Refreshed sampler-wave metadata for ${result.moduleCount} modules (${result.helperCount} helper, ${result.stagedCount} staged).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
