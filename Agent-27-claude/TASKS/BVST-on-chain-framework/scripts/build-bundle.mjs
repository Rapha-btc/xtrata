import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CHUNK_SIZE = 16_384;
const HELPER_LIMIT = 30;
const STAGED_BATCH_LIMIT = 50;

const bundleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = path.join(bundleRoot, 'workspace');
const defaultSourceRoot = path.resolve(bundleRoot, '..', '..');

const foundationModules = [
  {
    name: 'bvst.schema.patch.v1',
    source: 'System/shared/bvst_patch_v1.schema.json',
    stratum: 'schema',
    group: 'schema',
    version: '1',
    mime: 'application/json',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [],
    orderHint: 10,
    notes: 'Primary patch schema for recursive BVST releases.'
  },
  {
    name: 'bvst.runtime.bvst-css.v1.0.0',
    source: 'System/shared/bvst.css',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'text/css',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [],
    orderHint: 20,
    notes: 'Shared BVST stylesheet loaded by ui_styles.js.'
  },
  {
    name: 'bvst.runtime.ui-styles.v1.0.0',
    source: 'System/shared/ui_styles.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.bvst-css.v1.0.0'],
    orderHint: 30,
    notes: 'Shared stylesheet injector for controls, keyboard, sequencer, and visualizer.'
  },
  {
    name: 'bvst.runtime.audional-decoder.v1.0.0',
    source: 'System/shared/audional_decoder.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [],
    orderHint: 40,
    notes: 'Sampler and host audio byte decoder.'
  },
  {
    name: 'bvst.runtime.controls.v1.0.0',
    source: 'System/shared/controls.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0'],
    orderHint: 50,
    notes: 'Dynamic control builder for patch-driven UIs.'
  },
  {
    name: 'bvst.runtime.keyboard.v1.0.0',
    source: 'System/shared/keyboard.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0'],
    orderHint: 60,
    notes: 'Shared virtual keyboard with standalone-safe note release handling.'
  },
  {
    name: 'bvst.runtime.midi.v1.0.0',
    source: 'System/shared/midi.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0'],
    orderHint: 70,
    notes: 'Browser MIDI input manager.'
  },
  {
    name: 'bvst.runtime.midi-parser.v1.0.0',
    source: 'System/shared/midi_parser.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [],
    orderHint: 80,
    notes: 'MIDI parsing helper reserved for host and offline tooling.'
  },
  {
    name: 'bvst.runtime.visualizer.v1.0.0',
    source: 'System/shared/visualizer.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0'],
    orderHint: 90,
    notes: 'Waveform and spectrum visualizer bridge.'
  },
  {
    name: 'bvst.runtime.sampler.v1.0.0',
    source: 'System/shared/sampler.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0', 'bvst.runtime.audional-decoder.v1.0.0'],
    orderHint: 100,
    notes: 'Sampler UI runtime reserved for later sampler families.'
  },
  {
    name: 'bvst.runtime.sequencer-core.v1.0.0',
    source: 'System/shared/sequencer_core.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.ui-styles.v1.0.0'],
    orderHint: 110,
    notes: 'Sequencer UI/runtime reserved for future sequencer-capable chains.'
  },
  {
    name: 'bvst.engine.unified-wasm.v1.0.0',
    source: 'System/shared/bvst_unified_bg.wasm',
    stratum: 'engine',
    group: 'engine',
    version: '1.0.0',
    mime: 'application/wasm',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [],
    orderHint: 120,
    notes: 'Unified DSP engine binary shared by all first-wave modules.'
  },
  {
    name: 'bvst.engine.unified-loader.v1.0.0',
    source: 'System/shared/wasm_loader_unified.js',
    stratum: 'engine',
    group: 'engine',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.engine.unified-wasm.v1.0.0'],
    orderHint: 130,
    notes: 'WASM loader/glue for the unified DSP engine.'
  },
  {
    name: 'bvst.engine.unified-worklet.v1.0.0',
    source: 'System/shared/processor_unified.js',
    stratum: 'engine',
    group: 'engine',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.engine.unified-loader.v1.0.0'],
    orderHint: 140,
    notes: 'Shared AudioWorklet processor for all unified BVST engines.'
  },
  {
    name: 'bvst.runtime.standalone-bridge.v1.0.0',
    source: 'System/shared/standalone_bridge.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.engine.unified-worklet.v1.0.0', 'bvst.engine.unified-wasm.v1.0.0'],
    orderHint: 150,
    notes: 'Standalone audio bootstrap for direct plugin-page playback.'
  },
  {
    name: 'bvst.runtime.plugin-core.v1.0.0',
    source: 'System/shared/plugin_core.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: [
      'bvst.runtime.controls.v1.0.0',
      'bvst.runtime.keyboard.v1.0.0',
      'bvst.runtime.midi.v1.0.0',
      'bvst.runtime.sampler.v1.0.0',
      'bvst.runtime.visualizer.v1.0.0',
      'bvst.runtime.sequencer-core.v1.0.0',
      'bvst.runtime.standalone-bridge.v1.0.0'
    ],
    orderHint: 160,
    notes: 'Shared BVST UI runtime and standalone diagnostics layer.'
  },
  {
    name: 'bvst.runtime.patch-runtime.v1.0.0',
    source: 'System/shared/patch_runtime.js',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    mime: 'application/javascript',
    runtimeMajor: 1,
    engineMajor: 1,
    schemaMajor: 1,
    dependsOn: ['bvst.runtime.plugin-core.v1.0.0'],
    orderHint: 170,
    notes: 'Patch runner with host/standalone profile resolution.'
  }
];

const firstWaveFamilies = [
  {
    key: 'universalsynth-family',
    title: 'UniversalSynth Family',
    description: 'Patch-defined instruments sharing the UniversalSynth engine path.',
    plugins: ['UniversalSynth', 'UniversalEngine', 'JMS10']
  },
  {
    key: 'standalone-synths',
    title: 'Standalone Synth Engines',
    description: 'Dedicated synth engines already behaving well in standalone mode.',
    plugins: ['RetroKeys', 'BlueMarvinOne', 'BlueMarvinTwo', 'NeonPoly']
  }
];

const generatedDirs = ['workspace', 'catalogs', 'batches', 'verification', 'configs'];

function pluginId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSourceRoot() {
  const candidates = [];
  if (process.env.BVST_SOURCE_ROOT) {
    candidates.push(path.resolve(process.env.BVST_SOURCE_ROOT));
  }
  candidates.push(defaultSourceRoot);

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'System')) && await pathExists(path.join(candidate, 'Plugins'))) {
      return candidate;
    }
  }

  throw new Error(
    'build-bundle.mjs requires the original BVST source tree. Set BVST_SOURCE_ROOT to a repo containing System/ and Plugins/, or use verify-bundle.mjs plus the inscription prep scripts for this frozen TASKS bundle.'
  );
}

async function resetGeneratedDirs() {
  for (const dir of generatedDirs) {
    await fs.rm(path.join(bundleRoot, dir), { recursive: true, force: true });
    await fs.mkdir(path.join(bundleRoot, dir), { recursive: true });
  }
}

async function copyToWorkspace(sourceRoot, sourceRel) {
  const src = path.join(sourceRoot, sourceRel);
  const dst = path.join(workspaceRoot, sourceRel);
  await ensureDir(path.dirname(dst));
  await fs.copyFile(src, dst);
  return toPosix(path.relative(bundleRoot, dst));
}

async function fileMetrics(absPath) {
  const buf = await fs.readFile(absPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const bytes = buf.length;
  const chunks = bytes === 0 ? 0 : Math.ceil(bytes / CHUNK_SIZE);
  const route = chunks <= HELPER_LIMIT ? 'helper' : 'staged';
  return { sha256, bytes, chunks, route };
}

function moduleRecordFromDef(def, bundlePath, metrics) {
  return {
    name: def.name,
    kind: def.kind || 'leaf',
    stratum: def.stratum,
    group: def.group || null,
    family: def.family || null,
    plugin: def.plugin || null,
    version: def.version,
    source_repo_path: def.source || null,
    bundle_path: toPosix(path.join('on-chain-modules', bundlePath)),
    mime_type: def.mime,
    runtime_major: def.runtimeMajor ?? 1,
    engine_major: def.engineMajor ?? 1,
    schema_major: def.schemaMajor ?? 1,
    dependency_names: clone(def.dependsOn || []),
    expected_sha256: metrics.sha256,
    bytes: metrics.bytes,
    chunks: metrics.chunks,
    route: metrics.route,
    order_hint: def.orderHint ?? 999,
    status: 'planned',
    notes: def.notes || ''
  };
}

function compareNames(a, b) {
  if (a.order_hint !== b.order_hint) return a.order_hint - b.order_hint;
  return a.name.localeCompare(b.name);
}

function topoSort(records) {
  const byName = new Map(records.map((record) => [record.name, record]));
  const inDegree = new Map();
  const outgoing = new Map();
  for (const record of records) {
    inDegree.set(record.name, 0);
    outgoing.set(record.name, []);
  }
  for (const record of records) {
    for (const dep of record.dependency_names) {
      if (!byName.has(dep)) {
        throw new Error(`Unknown dependency: ${dep} -> ${record.name}`);
      }
      inDegree.set(record.name, (inDegree.get(record.name) || 0) + 1);
      outgoing.get(dep).push(record.name);
    }
  }
  const queue = records.filter((record) => inDegree.get(record.name) === 0).sort(compareNames);
  const ordered = [];
  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);
    for (const nextName of outgoing.get(current.name) || []) {
      const nextDegree = (inDegree.get(nextName) || 0) - 1;
      inDegree.set(nextName, nextDegree);
      if (nextDegree === 0) {
        queue.push(byName.get(nextName));
        queue.sort(compareNames);
      }
    }
  }
  if (ordered.length !== records.length) {
    throw new Error('Cycle detected while ordering module records.');
  }
  return ordered;
}

async function writeJson(relPath, value) {
  const absPath = path.join(bundleRoot, relPath);
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return relPath;
}

function moduleRef(record) {
  return {
    name: record.name,
    token_id: null,
    txid: null,
    block_height: null,
    path: record.bundle_path,
    mime_type: record.mime_type,
    sha256: record.expected_sha256,
    bytes: record.bytes,
    chunks: record.chunks,
    route: record.route
  };
}

async function buildLeafRecords(sourceRoot) {
  const records = [];

  for (const def of foundationModules) {
    const bundlePath = await copyToWorkspace(sourceRoot, def.source);
    const metrics = await fileMetrics(path.join(bundleRoot, bundlePath));
    records.push(moduleRecordFromDef(def, bundlePath, metrics));
  }

  for (const family of firstWaveFamilies) {
    for (const pluginName of family.plugins) {
      const manifestPath = path.join(sourceRoot, 'Plugins', 'Instruments', pluginName, 'manifest.json');
      const manifestJson = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const version = typeof manifestJson.version === 'string' && manifestJson.version.trim()
        ? manifestJson.version.trim()
        : '1.0.0';
      const pid = pluginId(pluginName);
      const pluginBase = {
        family: family.key,
        plugin: pluginName,
        version,
        runtimeMajor: 1,
        engineMajor: 1,
        schemaMajor: 1,
        orderHint: family.key === 'universalsynth-family' ? 230 : 330
      };

      const pluginDefs = [
        {
          ...pluginBase,
          name: `bvst.plugin.${pid}.manifest.v${version}`,
          source: `Plugins/Instruments/${pluginName}/manifest.json`,
          stratum: 'plugin-manifest',
          group: 'plugin-leaf',
          mime: 'application/json',
          dependsOn: [],
          notes: `${pluginName} manifest leaf module.`
        },
        {
          ...pluginBase,
          name: `bvst.plugin.${pid}.patch.v${version}`,
          source: `Plugins/Instruments/${pluginName}/patch.json`,
          stratum: 'plugin-patch',
          group: 'plugin-leaf',
          mime: 'application/json',
          dependsOn: ['bvst.schema.patch.v1'],
          notes: `${pluginName} patch and preset definition.`
        },
        {
          ...pluginBase,
          name: `bvst.plugin.${pid}.shell.v${version}`,
          source: `Plugins/Instruments/${pluginName}/gui.html`,
          stratum: 'plugin-shell',
          group: 'plugin-leaf',
          mime: 'text/html',
          dependsOn: [
            'bvst.runtime.patch-runtime.v1.0.0',
            `bvst.plugin.${pid}.manifest.v${version}`,
            `bvst.plugin.${pid}.patch.v${version}`
          ],
          notes: `${pluginName} standalone HTML shell for local and on-chain wrapper use.`
        }
      ];

      for (const def of pluginDefs) {
        const bundlePath = await copyToWorkspace(sourceRoot, def.source);
        const metrics = await fileMetrics(path.join(bundleRoot, bundlePath));
        records.push(moduleRecordFromDef(def, bundlePath, metrics));
      }
    }
  }

  return records;
}

function buildCatalogDefinitions(leafRecords) {
  const byName = new Map(leafRecords.map((record) => [record.name, record]));
  const runtimeLeaves = leafRecords.filter((record) => record.group === 'runtime');
  const engineLeaves = leafRecords.filter((record) => record.group === 'engine');
  const schemaLeaves = leafRecords.filter((record) => record.group === 'schema');

  const catalogFiles = [];

  const pushCatalog = (relPath, def, content) => {
    catalogFiles.push({ relPath, def, content });
  };

  pushCatalog(
    'catalogs/majors/runtime-v1.catalog.json',
    {
      name: 'bvst.catalog.runtime.v1',
      kind: 'catalog',
      stratum: 'major-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: runtimeLeaves.map((record) => record.name),
      orderHint: 180,
      notes: 'Runtime major catalog for the first recursive BVST release line.'
    },
    {
      name: 'bvst.catalog.runtime.v1',
      type: 'major-catalog',
      family: 'runtime',
      major: 1,
      modules: runtimeLeaves.map(moduleRef)
    }
  );

  pushCatalog(
    'catalogs/majors/engine-v1.catalog.json',
    {
      name: 'bvst.catalog.engine.v1',
      kind: 'catalog',
      stratum: 'major-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: engineLeaves.map((record) => record.name),
      orderHint: 190,
      notes: 'Engine major catalog for the shared unified DSP runtime.'
    },
    {
      name: 'bvst.catalog.engine.v1',
      type: 'major-catalog',
      family: 'engine',
      major: 1,
      modules: engineLeaves.map(moduleRef)
    }
  );

  pushCatalog(
    'catalogs/majors/schema-v1.catalog.json',
    {
      name: 'bvst.catalog.schema.v1',
      kind: 'catalog',
      stratum: 'major-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: schemaLeaves.map((record) => record.name),
      orderHint: 200,
      notes: 'Schema major catalog for patch validation.'
    },
    {
      name: 'bvst.catalog.schema.v1',
      type: 'major-catalog',
      family: 'schema',
      major: 1,
      modules: schemaLeaves.map(moduleRef)
    }
  );

  pushCatalog(
    'catalogs/releases/foundation-v1.catalog.json',
    {
      name: 'bvst.catalog.foundation.v1',
      kind: 'catalog',
      stratum: 'foundation-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: ['bvst.catalog.runtime.v1', 'bvst.catalog.engine.v1', 'bvst.catalog.schema.v1'],
      orderHint: 210,
      notes: 'Foundation release catalog for all shared recursive modules.'
    },
    {
      name: 'bvst.catalog.foundation.v1',
      type: 'foundation-catalog',
      runtime_major_catalog: 'bvst.catalog.runtime.v1',
      engine_major_catalog: 'bvst.catalog.engine.v1',
      schema_major_catalog: 'bvst.catalog.schema.v1',
      modules: {
        runtime: runtimeLeaves.map(moduleRef),
        engine: engineLeaves.map(moduleRef),
        schema: schemaLeaves.map(moduleRef)
      }
    }
  );

  const pluginReleaseCatalogNames = [];
  const familyCatalogNames = [];

  for (const family of firstWaveFamilies) {
    const familyReleaseNames = [];
    for (const pluginName of family.plugins) {
      const pid = pluginId(pluginName);
      const manifestRecord = [...byName.values()].find((record) => record.name.startsWith(`bvst.plugin.${pid}.manifest.`));
      const patchRecord = [...byName.values()].find((record) => record.name.startsWith(`bvst.plugin.${pid}.patch.`));
      const shellRecord = [...byName.values()].find((record) => record.name.startsWith(`bvst.plugin.${pid}.shell.`));
      const releaseName = `bvst.plugin.${pid}.release.v${manifestRecord.version}`;
      familyReleaseNames.push(releaseName);
      pluginReleaseCatalogNames.push(releaseName);
      pushCatalog(
        `catalogs/plugins/${family.key}/${pid}.release.catalog.json`,
        {
          name: releaseName,
          kind: 'catalog',
          stratum: 'plugin-release-catalog',
          group: 'catalog',
          family: family.key,
          plugin: pluginName,
          version: manifestRecord.version,
          mime: 'application/json',
          runtimeMajor: 1,
          engineMajor: 1,
          schemaMajor: 1,
          dependsOn: [
            manifestRecord.name,
            patchRecord.name,
            shellRecord.name,
            'bvst.catalog.runtime.v1',
            'bvst.catalog.engine.v1',
            'bvst.catalog.schema.v1'
          ],
          orderHint: family.key === 'universalsynth-family' ? 240 : 340,
          notes: `${pluginName} release catalog pinned to foundation v1.`
        },
        {
          name: releaseName,
          type: 'plugin-release-catalog',
          plugin_name: pluginName,
          plugin_family: family.key,
          category: 'Instruments',
          runtime_major: 1,
          engine_major: 1,
          schema_major: 1,
          dependencies: {
            foundation_catalog: 'bvst.catalog.foundation.v1',
            runtime_major_catalog: 'bvst.catalog.runtime.v1',
            engine_major_catalog: 'bvst.catalog.engine.v1',
            schema_major_catalog: 'bvst.catalog.schema.v1',
            manifest: moduleRef(manifestRecord),
            patch: moduleRef(patchRecord),
            shell: moduleRef(shellRecord)
          }
        }
      );
    }

    const familyCatalogName = `bvst.catalog.family.${family.key.replace(/[^a-z0-9]+/g, '')}.v1`;
    familyCatalogNames.push(familyCatalogName);
    pushCatalog(
      `catalogs/families/${family.key}.catalog.json`,
      {
        name: familyCatalogName,
        kind: 'catalog',
        stratum: 'plugin-family-catalog',
        group: 'catalog',
        family: family.key,
        version: '1',
        mime: 'application/json',
        runtimeMajor: 1,
        engineMajor: 1,
        schemaMajor: 1,
        dependsOn: familyReleaseNames,
        orderHint: family.key === 'universalsynth-family' ? 250 : 350,
        notes: `${family.title} family catalog.`
      },
      {
        name: familyCatalogName,
        type: 'plugin-family-catalog',
        family_key: family.key,
        title: family.title,
        description: family.description,
        plugin_releases: familyReleaseNames.map((name) => ({ name, token_id: null }))
      }
    );
  }

  pushCatalog(
    'catalogs/releases/first-wave-instruments.catalog.json',
    {
      name: 'bvst.catalog.release.firstwaveinstruments.v1',
      kind: 'catalog',
      stratum: 'release-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: familyCatalogNames,
      orderHint: 360,
      notes: 'First-wave instrument release catalog.'
    },
    {
      name: 'bvst.catalog.release.firstwaveinstruments.v1',
      type: 'release-catalog',
      scope: 'first-wave-instruments',
      families: familyCatalogNames.map((name) => ({ name, token_id: null })),
      plugin_releases: pluginReleaseCatalogNames.map((name) => ({ name, token_id: null }))
    }
  );

  pushCatalog(
    'catalogs/root/root.catalog.json',
    {
      name: 'bvst.catalog.root.v1',
      kind: 'catalog',
      stratum: 'root-catalog',
      group: 'catalog',
      version: '1',
      mime: 'application/json',
      runtimeMajor: 1,
      engineMajor: 1,
      schemaMajor: 1,
      dependsOn: ['bvst.catalog.foundation.v1', 'bvst.catalog.release.firstwaveinstruments.v1'],
      orderHint: 370,
      notes: 'Root discovery catalog for the staged recursive release.'
    },
    {
      name: 'bvst.catalog.root.v1',
      type: 'root-catalog',
      planning_docs: [
        'on-chain-planning/README.md',
        'on-chain-planning/02-module-strata.md',
        'on-chain-planning/03-recursive-dependency-graph.md',
        'on-chain-planning/04-xtrata-inscription-workflow.md',
        'on-chain-planning/05-roadmap.md'
      ],
      foundation_catalog: 'bvst.catalog.foundation.v1',
      first_wave_catalog: 'bvst.catalog.release.firstwaveinstruments.v1'
    }
  );

  return catalogFiles;
}

async function buildCatalogRecords(leafRecords) {
  const catalogDefs = buildCatalogDefinitions(leafRecords);
  const records = [];
  for (const item of catalogDefs) {
    const relPath = await writeJson(item.relPath, item.content);
    const metrics = await fileMetrics(path.join(bundleRoot, relPath));
    records.push(moduleRecordFromDef(item.def, relPath, metrics));
  }
  return records;
}

function buildSelectionConfig() {
  return {
    release_scope: 'first-wave-instruments',
    rationale: [
      'UniversalSynth family maximizes recursive reuse because the engine is already shared.',
      'Dedicated standalone synths provide clear canaries for future engine-specific releases.',
      'Sequencer-heavy and sampler-heavy instruments are deferred until later waves.'
    ],
    families: firstWaveFamilies
  };
}

function buildNetworkTemplate() {
  return {
    network: 'stacks-mainnet',
    chunk_size: CHUNK_SIZE,
    helper_chunk_limit: HELPER_LIMIT,
    staged_batch_chunk_limit: STAGED_BATCH_LIMIT,
    xtrata_core_contract: '',
    xtrata_helper_contract: '',
    deployer_address: '',
    fee_strategy: {
      helper: 'single-tx-recursive',
      staged: ['begin-or-get', 'add-chunk-batch', 'seal-recursive']
    },
    notes: 'Fill live contract IDs and deployer settings before inscription.'
  };
}

async function writeSupportFiles(allRecords) {
  await writeJson('configs/first-wave-selection.json', buildSelectionConfig());
  await writeJson('configs/xtrata-network.template.json', buildNetworkTemplate());
  await writeJson(
    'configs/token-map.template.json',
    {
      generated_for: 'on-chain-modules',
      entries: Object.fromEntries(
        allRecords
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((record) => [
            record.name,
            { token_id: null, txid: null, block_height: null }
          ])
      )
    }
  );
}

async function writeBatches(allRecords) {
  const ordered = topoSort(allRecords);
  const byName = new Map(ordered.map((record) => [record.name, record]));
  const universalsynthPluginNames = new Set(firstWaveFamilies[0].plugins);
  const standalonePluginNames = new Set(firstWaveFamilies[1].plugins);

  const foundationNames = ordered
    .filter((record) =>
      record.group === 'runtime' ||
      record.group === 'engine' ||
      record.group === 'schema' ||
      ['bvst.catalog.runtime.v1', 'bvst.catalog.engine.v1', 'bvst.catalog.schema.v1', 'bvst.catalog.foundation.v1'].includes(record.name)
    )
    .map((record) => record.name);

  const familyBatchNames = (pluginSet, familyKey) =>
    ordered
      .filter((record) =>
        (record.plugin && pluginSet.has(record.plugin)) ||
        (record.family === familyKey && record.kind === 'catalog') ||
        (record.name === `bvst.catalog.family.${familyKey.replace(/[^a-z0-9]+/g, '')}.v1`)
      )
      .map((record) => record.name);

  const universalsynthNames = familyBatchNames(universalsynthPluginNames, 'universalsynth-family');
  const standaloneNames = familyBatchNames(standalonePluginNames, 'standalone-synths');
  const releaseRootNames = ['bvst.catalog.release.firstwaveinstruments.v1', 'bvst.catalog.root.v1'];

  const makeBatch = (releaseName, moduleNames, prerequisiteBatches = []) => ({
    release_name: releaseName,
    network_template: 'on-chain-modules/configs/xtrata-network.template.json',
    prerequisite_batches: prerequisiteBatches,
    chunk_size: CHUNK_SIZE,
    helper_chunk_limit: HELPER_LIMIT,
    staged_batch_chunk_limit: STAGED_BATCH_LIMIT,
    artifacts: moduleNames.map((name, index) => {
      const record = byName.get(name);
      return {
        order: (index + 1) * 10,
        name: record.name,
        path: record.bundle_path,
        mime: record.mime_type,
        bytes: record.bytes,
        chunks: record.chunks,
        sha256: record.expected_sha256,
        route: record.route,
        depends_on: clone(record.dependency_names)
      };
    })
  });

  await writeJson('batches/10-foundation.batch.json', makeBatch('bvst-foundation-v1', foundationNames));
  await writeJson(
    'batches/20-universalsynth-family.batch.json',
    makeBatch('bvst-universalsynth-family-v1', universalsynthNames, ['10-foundation.batch.json'])
  );
  await writeJson(
    'batches/30-standalone-synths.batch.json',
    makeBatch('bvst-standalone-synths-v1', standaloneNames, ['10-foundation.batch.json'])
  );
  await writeJson(
    'batches/40-root-catalogs.batch.json',
    makeBatch('bvst-root-catalogs-v1', releaseRootNames, ['10-foundation.batch.json', '20-universalsynth-family.batch.json', '30-standalone-synths.batch.json'])
  );
  await writeJson(
    'batches/99-master-release.batch.json',
    makeBatch('bvst-master-release-v1', ordered.map((record) => record.name))
  );
}

async function writeVerificationFiles(allRecords) {
  const ordered = topoSort(allRecords).map((record, index) => ({
    ...record,
    topo_order: index + 1
  }));
  const edges = [];
  for (const record of ordered) {
    for (const dep of record.dependency_names) {
      edges.push({ from: dep, to: record.name });
    }
  }

  await writeJson('verification/module-index.json', ordered);
  await writeJson('verification/dependency-graph.json', {
    nodes: ordered.map((record) => ({
      name: record.name,
      kind: record.kind,
      stratum: record.stratum,
      route: record.route,
      bundle_path: record.bundle_path
    })),
    edges
  });
  await writeJson('verification/local-status.json', {
    generated_at: new Date().toISOString(),
    module_count: ordered.length,
    helper_count: ordered.filter((record) => record.route === 'helper').length,
    staged_count: ordered.filter((record) => record.route === 'staged').length,
    total_bytes: ordered.reduce((sum, record) => sum + record.bytes, 0),
    first_wave_plugins: firstWaveFamilies.flatMap((family) => family.plugins)
  });
  await writeJson('verification/release-index.json', {
    foundation_catalog: 'bvst.catalog.foundation.v1',
    family_catalogs: [
      'bvst.catalog.family.universalsynthfamily.v1',
      'bvst.catalog.family.standalonesynths.v1'
    ],
    first_wave_release_catalog: 'bvst.catalog.release.firstwaveinstruments.v1',
    root_catalog: 'bvst.catalog.root.v1'
  });
}

async function main() {
  const sourceRoot = await resolveSourceRoot();
  await resetGeneratedDirs();
  const leafRecords = await buildLeafRecords(sourceRoot);
  const catalogRecords = await buildCatalogRecords(leafRecords);
  const allRecords = [...leafRecords, ...catalogRecords];
  await writeSupportFiles(allRecords);
  await writeBatches(allRecords);
  await writeVerificationFiles(allRecords);

  const ordered = topoSort(allRecords);
  const totalBytes = ordered.reduce((sum, record) => sum + record.bytes, 0);
  console.log(`Built on-chain bundle with ${ordered.length} modules (${totalBytes} bytes staged).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
