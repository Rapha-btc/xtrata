import { promises as fs } from 'node:fs';
import {
  bundleRoot,
  defaultInscriptionLogPath,
  defaultRenderRoot,
  defaultRenderedIndexPath,
  defaultTokenMapPath,
  defaultTokenTemplatePath,
  ensureDir,
  loadModuleIndex,
  pathExists,
  readJsonAt,
  writeJsonAt
} from './_inscription-helpers.mjs';
import { renderCatalogs } from './render-catalogs.mjs';

const bundleName = bundleRoot.split('/').pop();

function buildInscriptionLog(moduleCount) {
  const now = new Date().toISOString();
  return {
    version: 1,
    bundle: bundleName,
    bundle_root: bundleRoot,
    created_at: now,
    updated_at: now,
    artifact_total: moduleCount,
    minted_total: 0,
    remaining_total: moduleCount,
    entries: []
  };
}

async function ensureTokenMap() {
  if (await pathExists(defaultTokenMapPath)) {
    return false;
  }

  const template = await readJsonAt(defaultTokenTemplatePath);
  const now = new Date().toISOString();
  await writeJsonAt(defaultTokenMapPath, {
    ...template,
    initialized_at: now,
    source_template: 'configs/token-map.template.json'
  });
  return true;
}

async function ensureInscriptionLog() {
  if (await pathExists(defaultInscriptionLogPath)) {
    return false;
  }

  const moduleCount = (await loadModuleIndex()).length;
  await writeJsonAt(defaultInscriptionLogPath, buildInscriptionLog(moduleCount));
  return true;
}

async function main() {
  const tokenMapCreated = await ensureTokenMap();
  const logCreated = await ensureInscriptionLog();
  await ensureDir(defaultRenderRoot);

  if (!await pathExists(defaultRenderedIndexPath)) {
    await ensureDir(defaultRenderRoot);
  }

  const renderSummary = await renderCatalogs({
    tokenMapPath: defaultTokenMapPath,
    renderRoot: defaultRenderRoot,
    renderedIndexPath: defaultRenderedIndexPath
  });

  console.log(
    `Initialized inscription state (${tokenMapCreated ? 'new' : 'existing'} token map, ${logCreated ? 'new' : 'existing'} log).`
  );
  console.log(
    `Catalog readiness: ${renderSummary.ready_count} ready, ${renderSummary.pending_count} pending, ${renderSummary.inscribed_count} inscribed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
