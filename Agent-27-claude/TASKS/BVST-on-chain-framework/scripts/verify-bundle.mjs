import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  absFromLogicalPath,
  bundleRoot,
  fileMetrics,
  loadModuleIndex,
  readJson,
  toPosix
} from './_inscription-helpers.mjs';

function parseJsRelativeDeps(source) {
  const deps = new Set();
  const importRe = /from\s+['"](\.\/[^'"]+)['"]/g;
  const dynamicUrlRe = /new URL\(['"](\.\/[^'"]+)['"],\s*import\.meta\.url\)/g;
  let match;
  while ((match = importRe.exec(source))) deps.add(match[1]);
  while ((match = dynamicUrlRe.exec(source))) deps.add(match[1]);
  return [...deps];
}

async function verifyModuleIndex() {
  const moduleIndex = await loadModuleIndex();
  const byName = new Map(moduleIndex.map((record) => [record.name, record]));

  for (const record of moduleIndex) {
    const absPath = absFromLogicalPath(record.bundle_path);
    const stats = await fileMetrics(absPath);
    if (stats.sha256 !== record.expected_sha256) {
      throw new Error(`Hash mismatch: ${record.name}`);
    }
    if (stats.bytes !== record.bytes) {
      throw new Error(`Byte count mismatch: ${record.name}`);
    }
    if (stats.chunks !== record.chunks) {
      throw new Error(`Chunk count mismatch: ${record.name}`);
    }
    if (stats.route !== record.route) {
      throw new Error(`Route mismatch: ${record.name}`);
    }
    for (const dep of record.dependency_names || []) {
      if (!byName.has(dep)) {
        throw new Error(`Missing dependency record: ${dep} -> ${record.name}`);
      }
    }
  }

  return moduleIndex;
}

async function verifyWorkspaceImports() {
  const sharedRoot = path.join(bundleRoot, 'workspace', 'System', 'shared');
  const entries = await fs.readdir(sharedRoot);
  for (const entry of entries) {
    if (!entry.endsWith('.js')) continue;
    const absPath = path.join(sharedRoot, entry);
    const source = await fs.readFile(absPath, 'utf8');
    for (const relDep of parseJsRelativeDeps(source)) {
      const depPath = path.resolve(path.dirname(absPath), relDep.replace(/\?v=.*$/, ''));
      await fs.access(depPath);
    }
  }
}

async function verifyBundledImportsParse() {
  const imports = [
    path.join(bundleRoot, 'workspace', 'System', 'shared', 'standalone_bridge.js'),
    path.join(bundleRoot, 'workspace', 'System', 'shared', 'plugin_core.js'),
    path.join(bundleRoot, 'workspace', 'System', 'shared', 'patch_runtime.js')
  ];

  for (const absPath of imports) {
    await import(pathToFileURL(absPath).href);
  }
}

async function verifyPluginShells() {
  const selection = await readJson('configs/first-wave-selection.json');
  for (const family of selection.families || []) {
    for (const pluginName of family.plugins || []) {
      const pluginRoot = path.join(bundleRoot, 'workspace', 'Plugins', 'Instruments', pluginName);
      const guiPath = path.join(pluginRoot, 'gui.html');
      const manifestPath = path.join(pluginRoot, 'manifest.json');
      const patchPath = path.join(pluginRoot, 'patch.json');
      const gui = await fs.readFile(guiPath, 'utf8');
      if (!gui.includes('../../../System/shared/patch_runtime.js')) {
        throw new Error(`Shell import path changed unexpectedly: ${toPosix(path.relative(bundleRoot, guiPath))}`);
      }
      await fs.access(path.resolve(pluginRoot, '../../../System/shared/patch_runtime.js'));
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      await fs.access(path.resolve(pluginRoot, manifest.components.audio_engine));
      JSON.parse(await fs.readFile(patchPath, 'utf8'));
    }
  }
}

async function verifyBatches(moduleIndex) {
  const knownNames = new Set(moduleIndex.map((record) => record.name));
  const batchesDir = path.join(bundleRoot, 'batches');
  const batchFiles = (await fs.readdir(batchesDir)).filter((name) => name.endsWith('.json')).sort();
  for (const file of batchFiles) {
    const batch = JSON.parse(await fs.readFile(path.join(batchesDir, file), 'utf8'));
    let lastOrder = -1;
    for (const artifact of batch.artifacts || []) {
      if (!knownNames.has(artifact.name)) {
        throw new Error(`Unknown artifact in ${file}: ${artifact.name}`);
      }
      const moduleRecord = moduleIndex.find((record) => record.name === artifact.name);
      if (!moduleRecord) {
        throw new Error(`Missing module index record for ${artifact.name}`);
      }
      if (artifact.order <= lastOrder) {
        throw new Error(`Out-of-order artifact sequence in ${file}`);
      }
      lastOrder = artifact.order;
      if (artifact.path !== moduleRecord.bundle_path) {
        throw new Error(`Path mismatch in ${file}: ${artifact.name}`);
      }
      if (artifact.mime !== moduleRecord.mime_type) {
        throw new Error(`MIME mismatch in ${file}: ${artifact.name}`);
      }
      const stats = await fileMetrics(absFromLogicalPath(artifact.path));
      if (stats.sha256 !== artifact.sha256) {
        throw new Error(`Batch hash mismatch in ${file}: ${artifact.name}`);
      }
      if (stats.bytes !== artifact.bytes) {
        throw new Error(`Batch byte mismatch in ${file}: ${artifact.name}`);
      }
      if (stats.chunks !== artifact.chunks) {
        throw new Error(`Batch chunk mismatch in ${file}: ${artifact.name}`);
      }
      if (stats.route !== artifact.route) {
        throw new Error(`Batch route mismatch in ${file}: ${artifact.name}`);
      }
      for (const dep of artifact.depends_on || []) {
        if (!knownNames.has(dep)) {
          throw new Error(`Unknown batch dependency in ${file}: ${dep}`);
        }
      }
    }
  }
}

async function verifyTokenTemplate(moduleIndex) {
  const tokenTemplate = await readJson('configs/token-map.template.json');
  const names = Object.keys(tokenTemplate.entries || {});
  if (names.length !== moduleIndex.length) {
    throw new Error('Token template entry count does not match module index.');
  }
  for (const record of moduleIndex) {
    if (!(record.name in tokenTemplate.entries)) {
      throw new Error(`Missing token template entry: ${record.name}`);
    }
  }
}

export async function verifyBundle() {
  const moduleIndex = await verifyModuleIndex();
  await verifyWorkspaceImports();
  await verifyBundledImportsParse();
  await verifyPluginShells();
  await verifyBatches(moduleIndex);
  await verifyTokenTemplate(moduleIndex);
  return { moduleIndex };
}

async function main() {
  const { moduleIndex } = await verifyBundle();
  console.log(`Verified on-chain bundle: ${moduleIndex.length} modules ready for staging.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
