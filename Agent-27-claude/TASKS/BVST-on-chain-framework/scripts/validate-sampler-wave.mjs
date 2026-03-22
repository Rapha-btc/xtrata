import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  fileMetrics,
  readJsonAt,
  toPosix,
  writeJsonAt
} from './_inscription-helpers.mjs';
import { refreshSamplerWaveMetadata } from './refresh-sampler-wave-metadata.mjs';
import { renderSamplerWaveCatalogs } from './render-sampler-wave-catalogs.mjs';

const samplerWaveRoot = path.join(bundleRoot, 'sampler-wave');

function createSection(name) {
  return { name, status: 'passed', errors: [], warnings: [], details: {} };
}

function fail(section, message) {
  section.status = 'failed';
  section.errors.push(message);
}

function warn(section, message) {
  if (section.status === 'passed') section.status = 'passed_with_warnings';
  section.warnings.push(message);
}

function summarizeSections(sections) {
  return {
    failed: sections.filter((section) => section.status === 'failed').length,
    passed_with_warnings: sections.filter((section) => section.status === 'passed_with_warnings').length,
    passed: sections.filter((section) => section.status === 'passed').length
  };
}

async function validateSamplerWaveAssets() {
  const section = createSection('sampler_wave_assets');
  const selection = await readJsonAt(path.join(bundleRoot, 'configs', 'sampler-wave-selection.json'));
  const manifest = await readJsonAt(path.join(bundleRoot, 'workspace', 'Plugins', 'Instruments', 'SamplerLab', 'manifest.json'));
  const patch = await readJsonAt(path.join(bundleRoot, 'workspace', 'Plugins', 'Instruments', 'SamplerLab', 'patch.json'));
  const records = await readJsonAt(path.join(samplerWaveRoot, 'verification', 'module-index.json'));
  const recordByName = new Map(records.map((record) => [record.name, record]));

  if (!selection.families?.some((family) => (family.plugins || []).includes('SamplerLab'))) {
    fail(section, 'SamplerLab is missing from sampler-wave-selection.json.');
  }
  if (manifest.xtrata?.engine_alias !== 'UniversalSampler') {
    fail(section, 'SamplerLab manifest must target the UniversalSampler backend.');
  }
  if (patch.config?.sampler?.sourcePolicy !== 'declared-only') {
    fail(section, 'SamplerLab base sampler policy must remain declared-only.');
  }
  if (patch.config?.profiles?.standalone?.sampler?.sourcePolicy !== 'standalone-dev') {
    fail(section, 'SamplerLab standalone profile must use standalone-dev.');
  }

  const sourceManifestPaths = [
    path.join(samplerWaveRoot, 'manifests', 'sources', 'samplerlab.sine220.source-manifest.json'),
    path.join(samplerWaveRoot, 'manifests', 'sources', 'samplerlab.sine440.source-manifest.json')
  ];
  const sources = [];
  for (const manifestPath of sourceManifestPaths) {
    const source = await readJsonAt(manifestPath);
    const audioRecord = recordByName.get(source.audio_leaf.name);
    if (!audioRecord) {
      fail(section, `Audio leaf record missing for ${source.audio_leaf.name}.`);
      continue;
    }
    const actual = await fileMetrics(path.join(bundleRoot, audioRecord.path.replace(/^on-chain-modules\//, '')));
    if (source.audio_leaf.sha256 !== actual.sha256) fail(section, `Audio leaf sha mismatch in ${path.basename(manifestPath)}.`);
    if (source.audio_leaf.bytes !== actual.bytes) fail(section, `Audio leaf byte count mismatch in ${path.basename(manifestPath)}.`);
    if (source.audio_leaf.chunks !== actual.chunks) fail(section, `Audio leaf chunk count mismatch in ${path.basename(manifestPath)}.`);
    if (source.playback.loop_start_pct >= source.playback.loop_end_pct) {
      fail(section, `Loop points are inverted in ${path.basename(manifestPath)}.`);
    }
    if (source.runtime_source.content_url_template !== '/content/{txid}') {
      warn(section, `Unexpected runtime source template in ${path.basename(manifestPath)}.`);
    }
    sources.push({
      name: source.name,
      sample_id: source.sample_id,
      audio_leaf: source.audio_leaf.name,
      bytes: source.audio_leaf.bytes
    });
  }

  section.details.sources = sources;
  section.details.module_count = records.length;
  return section;
}

async function validateSamplerWaveBatches() {
  const section = createSection('sampler_wave_batches');
  const records = await readJsonAt(path.join(samplerWaveRoot, 'verification', 'module-index.json'));
  const knownNames = new Set(records.map((record) => record.name).concat([
    'bvst.catalog.foundation.v1',
    'bvst.catalog.runtime.v1',
    'bvst.catalog.engine.v1',
    'bvst.catalog.schema.v1',
    'bvst.runtime.patch-runtime.v1.0.0',
    'bvst.runtime.sampler.v1.0.0'
  ]));

  const batchFiles = [
    '50-sampler-wave-foundation.batch.json',
    '60-sampler-wave-sources.batch.json',
    '70-sampler-wave-catalogs.batch.json'
  ];
  const summary = [];

  for (const file of batchFiles) {
    const batch = await readJsonAt(path.join(samplerWaveRoot, 'batches', file));
    const seenNames = new Set();
    for (const artifact of batch.artifacts || []) {
      if (seenNames.has(artifact.name)) fail(section, `Duplicate artifact ${artifact.name} in ${file}.`);
      seenNames.add(artifact.name);
      for (const dep of artifact.depends_on || []) {
        if (!knownNames.has(dep)) {
          fail(section, `Unknown dependency ${dep} referenced by ${artifact.name} in ${file}.`);
        }
      }
    }
    summary.push({ file, artifact_count: (batch.artifacts || []).length });
  }

  section.details.batches = summary;
  return section;
}

async function validateRenderedSynthetic() {
  const section = createSection('sampler_wave_render');
  const renderRoot = path.join(os.tmpdir(), `bvst-sampler-wave-render-${Date.now()}`);
  const outPath = path.join(renderRoot, 'rendered-index.json');
  const result = await renderSamplerWaveCatalogs({
    tokenMapPath: path.join(samplerWaveRoot, 'configs', 'token-map.synthetic.json'),
    renderRoot,
    renderedIndexPath: outPath
  });
  const pending = result.catalogs.filter((entry) => entry.status !== 'ready');
  if (pending.length > 0) {
    fail(section, `Synthetic token map left ${pending.length} sampler-wave templates unresolved.`);
  }

  const sourceCatalog = await readJsonAt(path.join(renderRoot, 'catalogs', 'sources', 'samplerlab.default-sources.catalog.json'));
  for (const source of sourceCatalog.sources || []) {
    if (!source.content_url) {
      fail(section, `Rendered source catalog did not populate content_url for ${source.name}.`);
    }
  }

  const renderedManifest = await readJsonAt(path.join(renderRoot, 'manifests', 'sources', 'samplerlab.sine220.source-manifest.json'));
  if (!renderedManifest.runtime_source?.content_url) {
    fail(section, 'Rendered sample source manifest did not populate runtime_source.content_url.');
  }

  section.details.render_root = toPosix(renderRoot);
  section.details.ready_count = result.catalogs.filter((entry) => entry.status === 'ready').length;
  return section;
}

export async function validateSamplerWave() {
  await refreshSamplerWaveMetadata();

  const sections = [
    await validateSamplerWaveAssets(),
    await validateSamplerWaveBatches(),
    await validateRenderedSynthetic()
  ];

  const report = {
    generated_at: new Date().toISOString(),
    sampler_wave_root: samplerWaveRoot,
    summary: summarizeSections(sections),
    sections
  };

  await writeJsonAt(path.join(samplerWaveRoot, 'verification', 'validation.report.json'), report);

  if (report.summary.failed > 0) {
    throw new Error(`Sampler-wave validation failed in ${report.summary.failed} section(s).`);
  }

  return report;
}

async function main() {
  const report = await validateSamplerWave();
  console.log(
    `Sampler-wave validation passed: ${report.summary.passed} passed, ${report.summary.passed_with_warnings} with warnings.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
