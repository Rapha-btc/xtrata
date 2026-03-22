import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHUNK_SIZE = 16_384;
const HELPER_LIMIT = 30;

const batches = [
  {
    file: '10-foundation.batch.json',
    releaseName: 'xtrata-canary-foundation-v1',
    prerequisiteBatches: [],
    artifactNames: [
      'canary.schema.release.v1',
      'canary.runtime.copy.v1',
      'canary.runtime.theme.v1',
      'canary.runtime.core.v1'
    ]
  },
  {
    file: '20-application.batch.json',
    releaseName: 'xtrata-canary-application-v1',
    prerequisiteBatches: ['10-foundation.batch.json'],
    artifactNames: [
      'canary.runtime.widget.v1',
      'canary.app.shell.v1'
    ]
  },
  {
    file: '30-catalogs.batch.json',
    releaseName: 'xtrata-canary-catalogs-v1',
    prerequisiteBatches: ['10-foundation.batch.json', '20-application.batch.json'],
    artifactNames: [
      'canary.catalog.runtime.v1',
      'canary.catalog.release.v1',
      'canary.catalog.root.v1'
    ]
  },
  {
    file: '40-proof-viewer.batch.json',
    releaseName: 'xtrata-canary-proof-viewer-v1',
    prerequisiteBatches: ['10-foundation.batch.json', '20-application.batch.json', '30-catalogs.batch.json'],
    artifactNames: [
      'canary.proof.viewer.v1'
    ]
  }
];

const leafDefinitions = [
  {
    name: 'canary.schema.release.v1',
    kind: 'leaf',
    stratum: 'schema',
    group: 'schema',
    version: '1',
    relativePath: 'workspace/System/shared/canary-release.schema.json',
    mime: 'application/json',
    batch: '10-foundation.batch.json',
    release: 'xtrata-canary-foundation-v1',
    order: 10,
    dependsOn: [],
    notes: 'Schema for canary release metadata.'
  },
  {
    name: 'canary.runtime.copy.v1',
    kind: 'leaf',
    stratum: 'runtime',
    group: 'runtime',
    version: '1',
    relativePath: 'workspace/System/shared/canary-copy.json',
    mime: 'application/json',
    batch: '10-foundation.batch.json',
    release: 'xtrata-canary-foundation-v1',
    order: 20,
    dependsOn: [],
    notes: 'Human-readable operator copy for the canary bundle.'
  },
  {
    name: 'canary.runtime.theme.v1',
    kind: 'leaf',
    stratum: 'runtime',
    group: 'runtime',
    version: '1',
    relativePath: 'workspace/System/shared/canary-theme.css',
    mime: 'text/css',
    batch: '10-foundation.batch.json',
    release: 'xtrata-canary-foundation-v1',
    order: 30,
    dependsOn: [],
    notes: 'Shared visual treatment for the canary runtime.'
  },
  {
    name: 'canary.runtime.core.v1',
    kind: 'leaf',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    relativePath: 'workspace/System/shared/canary-core.js',
    mime: 'application/javascript',
    batch: '10-foundation.batch.json',
    release: 'xtrata-canary-foundation-v1',
    order: 40,
    dependsOn: ['canary.runtime.copy.v1'],
    notes: 'Core helper used by the canary widget.'
  },
  {
    name: 'canary.runtime.widget.v1',
    kind: 'leaf',
    stratum: 'runtime',
    group: 'runtime',
    version: '1.0.0',
    relativePath: 'workspace/System/shared/canary-widget.js',
    mime: 'application/javascript',
    batch: '20-application.batch.json',
    release: 'xtrata-canary-application-v1',
    order: 10,
    dependsOn: ['canary.runtime.core.v1', 'canary.runtime.copy.v1'],
    notes: 'Secondary runtime leaf to force dependency ordering across batches.'
  },
  {
    name: 'canary.app.shell.v1',
    kind: 'leaf',
    stratum: 'application',
    group: 'application',
    version: '1.0.0',
    relativePath: 'workspace/Apps/Canary/index.html',
    mime: 'text/html',
    batch: '20-application.batch.json',
    release: 'xtrata-canary-application-v1',
    order: 20,
    dependsOn: ['canary.runtime.theme.v1', 'canary.runtime.widget.v1'],
    notes: 'Self-contained shell artifact for the final canary page.'
  }
];

function bundlePath(relativePath) {
  return `on-chain-modules/${relativePath.replaceAll(path.sep, path.posix.sep)}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(relativePath, value) {
  const absPath = path.join(bundleRoot, relativePath);
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fileMetrics(relativePath) {
  const absPath = path.join(bundleRoot, relativePath);
  const buf = await fs.readFile(absPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const bytes = buf.length;
  const chunks = bytes === 0 ? 0 : Math.ceil(bytes / CHUNK_SIZE);
  return {
    sha256,
    bytes,
    chunks,
    route: chunks <= HELPER_LIMIT ? 'helper' : 'staged'
  };
}

function catalogEntryFromRecord(record) {
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

function artifactRecord(definition, metrics, topoOrder) {
  return {
    name: definition.name,
    kind: definition.kind,
    stratum: definition.stratum,
    group: definition.group,
    family: null,
    plugin: null,
    version: definition.version,
    source_repo_path: definition.relativePath,
    bundle_path: bundlePath(definition.relativePath),
    mime_type: definition.mime,
    runtime_major: 1,
    engine_major: null,
    schema_major: definition.stratum === 'schema' ? 1 : null,
    dependency_names: [...definition.dependsOn],
    expected_sha256: metrics.sha256,
    bytes: metrics.bytes,
    chunks: metrics.chunks,
    route: metrics.route,
    order_hint: definition.order,
    status: 'planned',
    notes: definition.notes,
    topo_order: topoOrder
  };
}

async function main() {
  const verificationDir = path.join(bundleRoot, 'verification');
  const batchDir = path.join(bundleRoot, 'batches');
  const catalogDir = path.join(bundleRoot, 'catalogs');
  await ensureDir(verificationDir);
  await ensureDir(batchDir);
  await ensureDir(catalogDir);

  const leafMetrics = new Map();
  const recordsByName = new Map();
  let topoOrder = 1;

  for (const definition of leafDefinitions) {
    const metrics = await fileMetrics(definition.relativePath);
    leafMetrics.set(definition.name, metrics);
    recordsByName.set(definition.name, artifactRecord(definition, metrics, topoOrder));
    topoOrder += 1;
  }

  const runtimeCatalog = {
    name: 'canary.catalog.runtime.v1',
    type: 'runtime-catalog',
    release: 'xtrata-canary-release-v1',
    modules: {
      runtime: [
        'canary.runtime.copy.v1',
        'canary.runtime.theme.v1',
        'canary.runtime.core.v1',
        'canary.runtime.widget.v1'
      ].map((name) => catalogEntryFromRecord(recordsByName.get(name)))
    }
  };

  const releaseCatalog = {
    name: 'canary.catalog.release.v1',
    type: 'release-catalog',
    runtime_catalog: 'canary.catalog.runtime.v1',
    shell: catalogEntryFromRecord(recordsByName.get('canary.app.shell.v1')),
    schema: catalogEntryFromRecord(recordsByName.get('canary.schema.release.v1')),
    notes: 'Recursive canary release used before the BVST first-wave inscription.'
  };

  const rootCatalog = {
    name: 'canary.catalog.root.v1',
    type: 'root-catalog',
    planning_docs: [
      'README.md',
      'INSCRIPTION_AUTOMATION.md'
    ],
    release_catalog: 'canary.catalog.release.v1'
  };

  await writeJson('catalogs/majors/runtime-v1.catalog.json', runtimeCatalog);
  await writeJson('catalogs/releases/canary-app.catalog.json', releaseCatalog);
  await writeJson('catalogs/root/root.catalog.json', rootCatalog);

  const catalogDefinitions = [
    {
      name: 'canary.catalog.runtime.v1',
      kind: 'catalog',
      stratum: 'catalog',
      group: 'catalog',
      version: '1',
      relativePath: 'catalogs/majors/runtime-v1.catalog.json',
      mime: 'application/json',
      batch: '30-catalogs.batch.json',
      release: 'xtrata-canary-catalogs-v1',
      order: 10,
      dependsOn: ['canary.runtime.copy.v1', 'canary.runtime.theme.v1', 'canary.runtime.core.v1', 'canary.runtime.widget.v1'],
      notes: 'Catalog that resolves the runtime layer of the canary bundle.'
    },
    {
      name: 'canary.catalog.release.v1',
      kind: 'catalog',
      stratum: 'catalog',
      group: 'catalog',
      version: '1',
      relativePath: 'catalogs/releases/canary-app.catalog.json',
      mime: 'application/json',
      batch: '30-catalogs.batch.json',
      release: 'xtrata-canary-catalogs-v1',
      order: 20,
      dependsOn: ['canary.catalog.runtime.v1', 'canary.app.shell.v1', 'canary.schema.release.v1'],
      notes: 'Release catalog that binds the shell to the runtime catalog.'
    },
    {
      name: 'canary.catalog.root.v1',
      kind: 'catalog',
      stratum: 'catalog',
      group: 'catalog',
      version: '1',
      relativePath: 'catalogs/root/root.catalog.json',
      mime: 'application/json',
      batch: '30-catalogs.batch.json',
      release: 'xtrata-canary-catalogs-v1',
      order: 30,
      dependsOn: ['canary.catalog.release.v1'],
      notes: 'Root catalog that closes the recursive canary graph.'
    },
    {
      name: 'canary.proof.viewer.v1',
      kind: 'catalog',
      stratum: 'catalog',
      group: 'catalog',
      version: '1',
      relativePath: 'catalogs/views/proof-viewer.v1.html',
      mime: 'text/html',
      batch: '40-proof-viewer.batch.json',
      release: 'xtrata-canary-proof-viewer-v1',
      order: 10,
      dependsOn: [
        'canary.schema.release.v1',
        'canary.runtime.copy.v1',
        'canary.runtime.theme.v1',
        'canary.runtime.core.v1',
        'canary.runtime.widget.v1',
        'canary.app.shell.v1',
        'canary.catalog.runtime.v1',
        'canary.catalog.release.v1',
        'canary.catalog.root.v1'
      ],
      notes: 'Final rendered proof viewer that shows the resolved token graph after inscription.'
    }
  ];

  for (const definition of catalogDefinitions) {
    const metrics = await fileMetrics(definition.relativePath);
    recordsByName.set(definition.name, artifactRecord(definition, metrics, topoOrder));
    topoOrder += 1;
  }

  const orderedRecords = [...recordsByName.values()].sort(
    (left, right) => left.topo_order - right.topo_order || left.name.localeCompare(right.name)
  );

  for (const batch of batches) {
    const artifacts = batch.artifactNames.map((name) => {
      const record = recordsByName.get(name);
      return {
        order: record.order_hint,
        name: record.name,
        path: record.bundle_path,
        mime: record.mime_type,
        bytes: record.bytes,
        chunks: record.chunks,
        sha256: record.expected_sha256,
        route: record.route,
        depends_on: [...record.dependency_names]
      };
    });

    await writeJson(`batches/${batch.file}`, {
      release_name: batch.releaseName,
      network_template: 'on-chain-modules/configs/xtrata-network.template.json',
      prerequisite_batches: batch.prerequisiteBatches,
      chunk_size: CHUNK_SIZE,
      helper_chunk_limit: HELPER_LIMIT,
      staged_batch_chunk_limit: 50,
      artifacts
    });
  }

  await writeJson('batches/99-master-release.batch.json', {
    release_name: 'xtrata-canary-release-v1',
    bundle_root: 'on-chain-modules',
    batches: batches.map((batch) => batch.file)
  });

  const definitionByName = new Map(
    [...leafDefinitions, ...catalogDefinitions].map((definition) => [definition.name, definition])
  );

  const dependencyGraph = {
    nodes: orderedRecords.map((record) => ({
      name: record.name,
      kind: record.kind,
      batch: definitionByName.get(record.name)?.batch || null
    })),
    edges: orderedRecords.flatMap((record) =>
      (record.dependency_names || []).map((dependency) => ({ from: dependency, to: record.name }))
    )
  };

  await writeJson('verification/module-index.json', orderedRecords);
  await writeJson('verification/release-index.json', {
    runtime_catalog: 'canary.catalog.runtime.v1',
    release_catalog: 'canary.catalog.release.v1',
    root_catalog: 'canary.catalog.root.v1',
    proof_viewer: 'canary.proof.viewer.v1'
  });
  await writeJson('verification/dependency-graph.json', dependencyGraph);
  await writeJson('configs/token-map.template.json', {
    generated_for: 'on-chain-modules',
    entries: Object.fromEntries(
      orderedRecords.map((record) => [record.name, { token_id: null, txid: null, block_height: null }])
    )
  });

  console.log(`Built canary release metadata for ${orderedRecords.length} artifacts.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
