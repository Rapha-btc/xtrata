import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  defaultRenderRoot,
  defaultRenderedIndexPath,
  defaultTokenMapPath,
  createResolutionSignature,
  displayPath,
  ensureDir,
  fileMetrics,
  isTokenResolved,
  loadBatchArtifactLookup,
  loadModuleIndex,
  pathExists,
  readJsonAt,
  toPosix,
  writeJsonAt
} from './_inscription-helpers.mjs';

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
      continue;
    }
  }

  return args;
}

function addRequiredName(name, orderedNames, seenNames, tokenEntries) {
  if (typeof name !== 'string' || !tokenEntries.has(name) || seenNames.has(name)) {
    return;
  }
  seenNames.add(name);
  orderedNames.push(name);
}

function collectRequiredNames(node, orderedNames, seenNames, tokenEntries) {
  if (Array.isArray(node)) {
    for (const value of node) {
      collectRequiredNames(value, orderedNames, seenNames, tokenEntries);
    }
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

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

function buildRenderEntries(names, tokenEntries, moduleByName) {
  return names
    .map((name) => {
      const token = tokenEntries.get(name);
      const record = moduleByName.get(name) || {};
      return {
        name,
        kind: record.kind || null,
        stratum: record.stratum || null,
        mime_type: record.mime_type || null,
        bundle_path: record.bundle_path || null,
        dependency_names: [...(record.dependency_names || [])],
        topo_order: record.topo_order || null,
        token_id: token?.token_id ?? null,
        txid: token?.txid ?? null,
        block_height: token?.block_height ?? null
      };
    })
    .sort((left, right) => (left.topo_order || 0) - (right.topo_order || 0) || left.name.localeCompare(right.name));
}

function resolveNode(node, tokenEntries) {
  if (Array.isArray(node)) {
    return node.map((value) => resolveNode(value, tokenEntries));
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const resolved = {};

  for (const [key, value] of Object.entries(node)) {
    resolved[key] = resolveNode(value, tokenEntries);
    if (key !== 'name' && typeof value === 'string' && tokenEntries.has(value)) {
      const ref = tokenEntries.get(value);
      resolved[`${key}_token_id`] = ref.token_id;
      resolved[`${key}_txid`] = ref.txid;
      resolved[`${key}_block_height`] = ref.block_height;
    }
  }

  if (typeof node.name === 'string' && tokenEntries.has(node.name)) {
    const ref = tokenEntries.get(node.name);
    if ('token_id' in node) {
      resolved.token_id = ref.token_id;
    }
    if ('txid' in node) {
      resolved.txid = ref.txid;
    }
    if ('block_height' in node) {
      resolved.block_height = ref.block_height;
    }
  }

  return resolved;
}

function renderTextTemplate(templateText, context) {
  const placeholder = '__XTRATA_RENDER_CONTEXT__';
  if (!templateText.includes(placeholder)) {
    throw new Error(`Rendered text template is missing ${placeholder}.`);
  }
  return templateText.replace(placeholder, JSON.stringify(context, null, 2));
}

function collectResolutionIssues(node, tokenEntries, issues, currentPath = '$') {
  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      collectResolutionIssues(value, tokenEntries, issues, `${currentPath}[${index}]`);
    });
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  if (
    typeof node.name === 'string' &&
    tokenEntries.has(node.name) &&
    (('token_id' in node && node.token_id === null) ||
      ('txid' in node && node.txid === null) ||
      ('block_height' in node && node.block_height === null))
  ) {
    issues.push(`${currentPath}.name=${node.name}`);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key !== 'name' && typeof value === 'string' && tokenEntries.has(value)) {
      const tokenIdKey = `${key}_token_id`;
      const txidKey = `${key}_txid`;
      const blockHeightKey = `${key}_block_height`;
      if (node[tokenIdKey] === null || node[txidKey] === null || node[blockHeightKey] === null) {
        issues.push(`${currentPath}.${key}=${value}`);
      }
      continue;
    }
    collectResolutionIssues(value, tokenEntries, issues, `${currentPath}.${key}`);
  }
}

function renderedLogicalPath(renderedAbs) {
  if (renderedAbs.startsWith(bundleRoot)) {
    return toPosix(path.join('on-chain-modules', path.relative(bundleRoot, renderedAbs)));
  }
  return toPosix(renderedAbs);
}

function batchDirectDependencies(record, batchLookup) {
  const batchEntry = batchLookup.get(record.name);
  if (batchEntry && Array.isArray(batchEntry.artifact.depends_on)) {
    return [...batchEntry.artifact.depends_on];
  }
  return [...(record.dependency_names || [])];
}

function previousCatalogMap(previousIndex) {
  return new Map((previousIndex?.catalogs || []).map((entry) => [entry.name, entry]));
}

export async function renderCatalogs(options = {}) {
  const tokenMapPath = path.resolve(options.tokenMapPath || defaultTokenMapPath);
  const renderRoot = path.resolve(options.renderRoot || defaultRenderRoot);
  const renderedIndexPath = path.resolve(options.renderedIndexPath || defaultRenderedIndexPath);

  const tokenMap = await readJsonAt(tokenMapPath);
  const tokenEntries = new Map(Object.entries(tokenMap.entries || {}));
  const moduleIndex = await loadModuleIndex();
  const moduleByName = new Map(moduleIndex.map((record) => [record.name, record]));
  const batchLookup = await loadBatchArtifactLookup();
  const existingIndex = (await pathExists(renderedIndexPath)) ? await readJsonAt(renderedIndexPath) : null;
  const previousByName = previousCatalogMap(existingIndex);

  const catalogRecords = moduleIndex
    .filter((record) => record.kind === 'catalog')
    .sort((left, right) => (left.topo_order || 0) - (right.topo_order || 0) || left.name.localeCompare(right.name));

  const catalogs = [];
  let readyCount = 0;
  let pendingCount = 0;
  let routeMismatchCount = 0;
  let unresolvedCount = 0;
  let inscribedCount = 0;
  const generatedAt = new Date().toISOString();

  await ensureDir(renderRoot);

  for (const record of catalogRecords) {
    const templateAbs = path.join(bundleRoot, record.bundle_path.replace(/^on-chain-modules\//, ''));
    const templateRaw = await fs.readFile(templateAbs, 'utf8');
    const directDependencyNames = batchDirectDependencies(record, batchLookup);
    const requiredNames = [];
    const seenNames = new Set();
    const isJsonTemplate = record.mime_type === 'application/json';
    const templateJson = isJsonTemplate ? JSON.parse(templateRaw) : null;

    if (isJsonTemplate) {
      collectRequiredNames(templateJson, requiredNames, seenNames, tokenEntries);
    }
    for (const name of directDependencyNames) {
      addRequiredName(name, requiredNames, seenNames, tokenEntries);
    }

    const missingDependencies = requiredNames.filter((name) => !isTokenResolved(tokenEntries.get(name)));
    const previous = previousByName.get(record.name) || null;
    const renderedAbs = path.join(renderRoot, record.bundle_path.replace(/^on-chain-modules\//, ''));
    const renderedPath = renderedLogicalPath(renderedAbs);
    const resolutionSignature = createResolutionSignature(requiredNames, tokenEntries);

    if (previous?.inscribed && previous.resolution_signature !== resolutionSignature) {
      throw new Error(`Inscribed catalog resolution drifted: ${record.name}`);
    }

    if (previous?.inscribed && missingDependencies.length > 0) {
      throw new Error(`Resolved dependency data regressed for inscribed catalog: ${record.name}`);
    }

    if (missingDependencies.length > 0) {
      pendingCount += 1;
      if (!previous?.inscribed && await pathExists(renderedAbs)) {
        await fs.rm(renderedAbs, { force: true });
      }

      catalogs.push({
        name: record.name,
        batch_file: batchLookup.get(record.name)?.file || null,
        order: batchLookup.get(record.name)?.artifact.order || null,
        status: 'pending',
        template_path: record.bundle_path,
        template_sha256: record.expected_sha256,
        direct_dependency_names: directDependencyNames,
        direct_dependency_token_ids: directDependencyNames.map((name) => tokenEntries.get(name)?.token_id ?? null),
        resolved_dependency_names: requiredNames,
        missing_dependencies: missingDependencies,
        resolution_signature: resolutionSignature,
        resolved_at: previous?.resolution_signature === resolutionSignature ? previous.resolved_at || null : null,
        rendered_path: previous?.inscribed ? previous.rendered_path || renderedPath : null,
        rendered_sha256: previous?.inscribed ? previous.rendered_sha256 || null : null,
        rendered_bytes: previous?.inscribed ? previous.rendered_bytes || null : null,
        rendered_chunks: previous?.inscribed ? previous.rendered_chunks || null : null,
        rendered_route: previous?.inscribed ? previous.rendered_route || null : null,
        inscribed: previous?.inscribed || null
      });
      continue;
    }

    const reused = Boolean(
      previous &&
      previous.resolution_signature === resolutionSignature &&
      previous.rendered_path &&
      await pathExists(renderedAbs)
    );
    const resolvedAt =
      previous?.resolution_signature === resolutionSignature && previous?.resolved_at
        ? previous.resolved_at
        : generatedAt;
    const resolvedFrom =
      previous?.resolution_signature === resolutionSignature && previous?.resolved_from
        ? previous.resolved_from
        : displayPath(tokenMapPath);

    if (!reused) {
      await ensureDir(path.dirname(renderedAbs));
      if (isJsonTemplate) {
        const renderedJson = resolveNode(templateJson, tokenEntries);
        renderedJson.dependency_token_ids = directDependencyNames.map((name) => tokenEntries.get(name).token_id);
        renderedJson.resolved_dependency_names = requiredNames;
        renderedJson.resolved_at = resolvedAt;
        renderedJson.resolved_from = resolvedFrom;
        await fs.writeFile(renderedAbs, `${JSON.stringify(renderedJson, null, 2)}\n`, 'utf8');
      } else {
        const renderedText = renderTextTemplate(templateRaw, {
          record_name: record.name,
          record_kind: record.kind,
          record_mime_type: record.mime_type,
          resolution_signature: resolutionSignature,
          resolved_at: resolvedAt,
          resolved_from: resolvedFrom,
          direct_dependency_names: directDependencyNames,
          dependency_entries: buildRenderEntries(directDependencyNames, tokenEntries, moduleByName),
          included_entries: buildRenderEntries(requiredNames, tokenEntries, moduleByName)
        });
        await fs.writeFile(renderedAbs, renderedText, 'utf8');
      }
    }

    const metrics = await fileMetrics(renderedAbs);
    const issues = [];
    if (isJsonTemplate) {
      const renderedJson = await readJsonAt(renderedAbs);
      collectResolutionIssues(renderedJson, tokenEntries, issues);
    }

    let status = 'ready';
    if (metrics.route !== record.route) {
      status = 'route-mismatch';
      routeMismatchCount += 1;
    } else if (issues.length > 0) {
      status = 'unresolved';
      unresolvedCount += 1;
    } else {
      readyCount += 1;
    }

    if (previous?.inscribed) {
      inscribedCount += 1;
    }

    catalogs.push({
      name: record.name,
      batch_file: batchLookup.get(record.name)?.file || null,
      order: batchLookup.get(record.name)?.artifact.order || null,
      status,
      template_path: record.bundle_path,
      template_sha256: record.expected_sha256,
      direct_dependency_names: directDependencyNames,
      direct_dependency_token_ids: directDependencyNames.map((name) => tokenEntries.get(name).token_id),
      resolved_dependency_names: requiredNames,
      missing_dependencies: [],
      resolution_signature: resolutionSignature,
      resolved_at: resolvedAt,
      resolved_from: resolvedFrom,
      rendered_path: renderedPath,
      rendered_sha256: metrics.sha256,
      rendered_bytes: metrics.bytes,
      rendered_chunks: metrics.chunks,
      rendered_route: metrics.route,
      route_expected: record.route,
      route_matches_expected: metrics.route === record.route,
      unresolved_paths: issues,
      inscribed: previous?.inscribed || null
    });
  }

  const summary = {
    generated_at: generatedAt,
    token_map: displayPath(tokenMapPath),
    render_root: displayPath(renderRoot),
    catalog_count: catalogRecords.length,
    ready_count: readyCount,
    pending_count: pendingCount,
    route_mismatch_count: routeMismatchCount,
    unresolved_count: unresolvedCount,
    inscribed_count: inscribedCount,
    catalogs
  };

  await writeJsonAt(renderedIndexPath, summary);

  if (routeMismatchCount > 0) {
    throw new Error(`Rendered catalog route drift detected for ${routeMismatchCount} catalog(s).`);
  }
  if (unresolvedCount > 0) {
    throw new Error(`Rendered catalog resolution failed for ${unresolvedCount} catalog(s).`);
  }

  return summary;
}

async function main() {
  const summary = await renderCatalogs(parseArgs(process.argv.slice(2)));
  console.log(
    `Rendered catalog index: ${summary.ready_count} ready, ${summary.pending_count} pending, ${summary.inscribed_count} inscribed.`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
