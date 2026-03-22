import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  defaultBundleRoot,
  defaultInscriptionLogPath,
  defaultRenderedIndexPath,
  defaultRenderRoot,
  defaultTokenMapPath,
  displayPath,
  isTokenResolved,
  loadModuleIndex,
  pathExists,
  readJsonAt,
  writeJsonAt
} from './_inscription-helpers.mjs';
import { renderCatalogs } from './render-catalogs.mjs';

const bundleName = bundleRoot.split('/').pop();

function usage() {
  const bundleArgs = bundleRoot === defaultBundleRoot ? '' : `XTRATA_BUNDLE_ROOT=${bundleRoot} `;
  throw new Error(
    `Usage: ${bundleArgs}node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs --name <artifact-name> --token-id <id> --txid <txid> --block-height <height>`
  );
}

function parseArgs(argv) {
  const args = {
    tokenMapPath: defaultTokenMapPath,
    inscriptionLogPath: defaultInscriptionLogPath,
    renderedIndexPath: defaultRenderedIndexPath,
    renderRoot: defaultRenderRoot
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      usage();
    }
    args[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }

  if (!args.name || !args.tokenId || !args.txid || !args.blockHeight) {
    usage();
  }

  const tokenId = Number(args.tokenId);
  const blockHeight = Number(args.blockHeight);
  if (!Number.isInteger(tokenId) || tokenId < 0) {
    throw new Error(`Invalid --token-id value: ${args.tokenId}`);
  }
  if (!Number.isInteger(blockHeight) || blockHeight < 0) {
    throw new Error(`Invalid --block-height value: ${args.blockHeight}`);
  }

  return {
    ...args,
    tokenId,
    blockHeight,
    tokenMapPath: path.resolve(args.tokenMapPath),
    inscriptionLogPath: path.resolve(args.inscriptionLogPath),
    renderedIndexPath: path.resolve(args.renderedIndexPath),
    renderRoot: path.resolve(args.renderRoot)
  };
}

function buildLogSkeleton(moduleCount) {
  const now = new Date().toISOString();
  return {
    version: 1,
    bundle: bundleName,
    created_at: now,
    updated_at: now,
    artifact_total: moduleCount,
    minted_total: 0,
    remaining_total: moduleCount,
    entries: []
  };
}

function ensureResolvedDependencies(names, tokenEntries, context) {
  const values = names.map((name) => {
    const entry = tokenEntries[name];
    if (!isTokenResolved(entry)) {
      throw new Error(`Cannot record ${context}; dependency is unresolved: ${name}`);
    }
    return entry.token_id;
  });
  return values;
}

export async function applyInscriptionResult(args) {
  const moduleIndex = await loadModuleIndex();
  const recordByName = new Map(moduleIndex.map((record) => [record.name, record]));
  const record = recordByName.get(args.name);
  if (!record) {
    throw new Error(`Unknown artifact name: ${args.name}`);
  }

  const tokenMap = await readJsonAt(args.tokenMapPath);
  if (!tokenMap.entries || !tokenMap.entries[args.name]) {
    throw new Error(`Artifact is missing from token map: ${args.name}`);
  }

  const currentTokenEntry = tokenMap.entries[args.name];
  if (isTokenResolved(currentTokenEntry)) {
    const identical =
      Number(currentTokenEntry.token_id) === args.tokenId &&
      currentTokenEntry.txid === args.txid &&
      Number(currentTokenEntry.block_height) === args.blockHeight;
    if (!identical) {
      throw new Error(`Artifact already has a different recorded inscription: ${args.name}`);
    }
  }

  let renderedIndex = (await pathExists(args.renderedIndexPath)) ? await readJsonAt(args.renderedIndexPath) : null;
  const renderedCatalog = renderedIndex?.catalogs?.find((entry) => entry.name === args.name) || null;

  let localSourcePath = record.bundle_path;
  let renderedPath = null;
  let sha256 = record.expected_sha256;
  let bytes = record.bytes;
  let chunks = record.chunks;
  let route = record.route;
  let directDependencyNames = [...(record.dependency_names || [])];
  let dependencyTokenIds = ensureResolvedDependencies(directDependencyNames, tokenMap.entries, record.name);
  let resolutionSignature = null;

  if (record.kind === 'catalog') {
    if (!renderedCatalog) {
      throw new Error(`Rendered catalog entry is missing for ${args.name}. Run render-catalogs first.`);
    }
    if (renderedCatalog.status !== 'ready') {
      throw new Error(`Rendered catalog is not ready for inscription: ${args.name} (${renderedCatalog.status})`);
    }
    if (!renderedCatalog.rendered_path || !renderedCatalog.rendered_sha256) {
      throw new Error(`Rendered catalog metadata is incomplete for ${args.name}.`);
    }

    localSourcePath = renderedCatalog.rendered_path;
    renderedPath = renderedCatalog.rendered_path;
    sha256 = renderedCatalog.rendered_sha256;
    bytes = renderedCatalog.rendered_bytes;
    chunks = renderedCatalog.rendered_chunks;
    route = renderedCatalog.rendered_route;
    directDependencyNames = [...(renderedCatalog.direct_dependency_names || [])];
    dependencyTokenIds = ensureResolvedDependencies(directDependencyNames, tokenMap.entries, `${args.name} rendered catalog`);
    resolutionSignature = renderedCatalog.resolution_signature || null;
  }

  tokenMap.entries[args.name] = {
    token_id: args.tokenId,
    txid: args.txid,
    block_height: args.blockHeight
  };
  tokenMap.updated_at = new Date().toISOString();
  await writeJsonAt(args.tokenMapPath, tokenMap);

  const log = (await pathExists(args.inscriptionLogPath))
    ? await readJsonAt(args.inscriptionLogPath)
    : buildLogSkeleton(moduleIndex.length);
  const recordedAt = new Date().toISOString();
  const logEntry = {
    name: args.name,
    kind: record.kind,
    token_id: args.tokenId,
    txid: args.txid,
    block_height: args.blockHeight,
    sha256,
    bytes,
    chunks,
    route,
    dependency_names: directDependencyNames,
    dependency_token_ids: dependencyTokenIds,
    local_source_path: localSourcePath,
    rendered_path: renderedPath,
    resolution_signature: resolutionSignature,
    recorded_at: recordedAt
  };

  const existingIndex = (log.entries || []).findIndex((entry) => entry.name === args.name);
  if (existingIndex >= 0) {
    const existingEntry = log.entries[existingIndex];
    const identical =
      Number(existingEntry.token_id) === args.tokenId &&
      existingEntry.txid === args.txid &&
      Number(existingEntry.block_height) === args.blockHeight;
    if (!identical) {
      throw new Error(`Inscription log already contains a different record for ${args.name}`);
    }
    log.entries[existingIndex] = logEntry;
  } else {
    log.entries.push(logEntry);
  }

  log.updated_at = recordedAt;
  log.artifact_total = moduleIndex.length;
  log.minted_total = log.entries.length;
  log.remaining_total = moduleIndex.length - log.entries.length;
  await writeJsonAt(args.inscriptionLogPath, log);

  if (renderedIndex && renderedCatalog) {
    renderedCatalog.inscribed = {
      token_id: args.tokenId,
      txid: args.txid,
      block_height: args.blockHeight,
      recorded_at: recordedAt
    };
    await writeJsonAt(args.renderedIndexPath, renderedIndex);
  }

  const renderSummary = await renderCatalogs({
    tokenMapPath: args.tokenMapPath,
    renderRoot: args.renderRoot,
    renderedIndexPath: args.renderedIndexPath
  });

  return {
    record,
    renderSummary,
    logEntry,
    tokenMapPath: args.tokenMapPath,
    inscriptionLogPath: args.inscriptionLogPath,
    renderedIndexPath: args.renderedIndexPath
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await applyInscriptionResult(args);

  console.log(
    `Recorded inscription for ${args.name} -> token ${args.tokenId}. Token map: ${displayPath(args.tokenMapPath)}.`
  );
  console.log(
    `Catalog readiness: ${result.renderSummary.ready_count} ready, ${result.renderSummary.pending_count} pending, ${result.renderSummary.inscribed_count} inscribed.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
