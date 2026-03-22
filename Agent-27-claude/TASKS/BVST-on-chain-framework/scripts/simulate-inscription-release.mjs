import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bundleRoot,
  defaultTokenTemplatePath,
  loadModuleIndex,
  readJson,
  readJsonAt,
  writeJsonAt
} from './_inscription-helpers.mjs';
import { renderCatalogs } from './render-catalogs.mjs';
import { applyInscriptionResult } from './apply-inscription-result.mjs';

const bundleName = bundleRoot.split('/').pop();

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

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    args[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }
  return args;
}

function txidForToken(tokenId) {
  return `0x${String(tokenId).padStart(64, '0')}`;
}

function blockHeightForToken(tokenId) {
  return 500_000 + tokenId;
}

function firstPredictedTokenId(preflight) {
  const candidate = Number(preflight?.quote?.predictedTokenRange?.start);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : 1;
}

function countNullTokenEntries(tokenMap) {
  return Object.values(tokenMap.entries || {}).filter((entry) => entry.token_id === null).length;
}

export async function simulateInscriptionRelease(options = {}) {
  const preflight = await readJson('verification/preflight.quote.json');
  const moduleCount = Number(preflight?.verification?.moduleCount || 0);
  const steps = Array.isArray(preflight?.execution?.steps) ? preflight.execution.steps : [];
  const expectedCatalogCount = (await loadModuleIndex()).filter((record) => record.kind === 'catalog').length;
  if (steps.length !== moduleCount) {
    throw new Error(`Simulation expected ${moduleCount} execution steps, found ${steps.length}.`);
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bvst-inscription-sim-'));
  const tokenMapPath = path.join(tempRoot, 'token-map.runtime.json');
  const inscriptionLogPath = path.join(tempRoot, 'inscription-log.json');
  const renderedIndexPath = path.join(tempRoot, 'rendered-index.json');
  const renderRoot = path.join(tempRoot, 'rendered');

  const template = await readJsonAt(defaultTokenTemplatePath);
  await writeJsonAt(tokenMapPath, {
    ...template,
    initialized_at: new Date().toISOString(),
    source_template: 'configs/token-map.template.json',
    simulation: true
  });
  await writeJsonAt(inscriptionLogPath, buildLogSkeleton(moduleCount));
  await renderCatalogs({ tokenMapPath, renderRoot, renderedIndexPath });

  const startTokenId = Number(options.startTokenId || firstPredictedTokenId(preflight));
  let nextTokenId = startTokenId;

  for (const step of steps) {
    const renderedIndex = await readJsonAt(renderedIndexPath);
    const renderedEntry = renderedIndex.catalogs.find((entry) => entry.name === step.name) || null;

    if (step.needsRenderedCopy) {
      if (!renderedEntry || renderedEntry.status !== 'ready') {
        throw new Error(`Catalog was not ready during simulation: ${step.name}`);
      }
      if (!renderedEntry.rendered_path || !renderedEntry.rendered_sha256) {
        throw new Error(`Catalog render metadata missing during simulation: ${step.name}`);
      }
    }

    await applyInscriptionResult({
      name: step.name,
      tokenId: nextTokenId,
      txid: txidForToken(nextTokenId),
      blockHeight: blockHeightForToken(nextTokenId),
      tokenMapPath,
      inscriptionLogPath,
      renderedIndexPath,
      renderRoot
    });
    nextTokenId += 1;
  }

  const tokenMap = await readJsonAt(tokenMapPath);
  const inscriptionLog = await readJsonAt(inscriptionLogPath);
  const renderedIndexBefore = await readJsonAt(renderedIndexPath);
  const rerenderSummary = await renderCatalogs({ tokenMapPath, renderRoot, renderedIndexPath });
  const renderedIndexAfter = await readJsonAt(renderedIndexPath);

  if (inscriptionLog.minted_total !== moduleCount) {
    throw new Error(`Simulation log recorded ${inscriptionLog.minted_total} mints; expected ${moduleCount}.`);
  }
  if (countNullTokenEntries(tokenMap) !== 0) {
    throw new Error('Simulation left unresolved token-map entries.');
  }
  if (rerenderSummary.pending_count !== 0 || rerenderSummary.unresolved_count !== 0 || rerenderSummary.route_mismatch_count !== 0) {
    throw new Error('Simulation rerender reported unresolved or route-mismatched catalogs.');
  }
  if (rerenderSummary.inscribed_count !== expectedCatalogCount) {
    throw new Error(`Simulation expected ${expectedCatalogCount} inscribed catalogs, saw ${rerenderSummary.inscribed_count}.`);
  }

  const beforeMap = new Map(renderedIndexBefore.catalogs.map((entry) => [entry.name, entry]));
  for (const afterEntry of renderedIndexAfter.catalogs) {
    const beforeEntry = beforeMap.get(afterEntry.name);
    if (!beforeEntry) {
      throw new Error(`Rendered catalog disappeared during stability check: ${afterEntry.name}`);
    }
    if (beforeEntry.rendered_sha256 !== afterEntry.rendered_sha256) {
      throw new Error(`Rendered catalog hash drifted after rerender: ${afterEntry.name}`);
    }
    if (beforeEntry.resolved_at !== afterEntry.resolved_at) {
      throw new Error(`Rendered catalog resolved_at drifted after rerender: ${afterEntry.name}`);
    }
  }

  return {
    tempRoot,
    startTokenId,
    endTokenId: nextTokenId - 1,
    moduleCount,
    catalogCount: renderedIndexAfter.catalogs.length,
    mintedTotal: inscriptionLog.minted_total,
    nullTokenEntries: countNullTokenEntries(tokenMap),
    renderedReadyCount: rerenderSummary.ready_count,
    renderedInscribedCount: rerenderSummary.inscribed_count
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await simulateInscriptionRelease(args);
  console.log(
    `Simulated inscription release: ${result.mintedTotal} artifacts, tokens ${result.startTokenId}-${result.endTokenId}, ${result.catalogCount} catalogs stable.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
