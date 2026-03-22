import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  absFromLogicalPath,
  bundleRoot,
  defaultBundleRoot,
  defaultInscriptionLogPath,
  defaultRenderedIndexPath,
  defaultTokenMapPath,
  displayPath,
  isTokenResolved,
  loadExecutionBatches,
  loadModuleIndex,
  pathExists,
  readJsonAt,
  toPosix,
  writeJsonAt
} from './_inscription-helpers.mjs';

const applyCommandPrefix = bundleRoot === defaultBundleRoot
  ? ''
  : `XTRATA_BUNDLE_ROOT=${bundleRoot} `;

function parseArgs(argv) {
  const args = {
    tokenMapPath: defaultTokenMapPath,
    inscriptionLogPath: defaultInscriptionLogPath,
    renderedIndexPath: defaultRenderedIndexPath,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    const camelKey = key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[camelKey] = camelKey === 'out' ? path.resolve(value) : path.resolve(value);
    index += 1;
  }

  return args;
}

function compareRecorded(left, right) {
  if (!left || !right) return false;
  return (
    Number(left.token_id) === Number(right.token_id) &&
    left.txid === right.txid &&
    Number(left.block_height) === Number(right.block_height)
  );
}

function plannedFunction(route, dependencyTokenIds) {
  if (route === 'helper') {
    return dependencyTokenIds.length > 0 ? 'mint-small-single-tx-recursive' : 'mint-small-single-tx';
  }
  return dependencyTokenIds.length > 0 ? 'seal-recursive' : 'seal-inscription';
}

function buildApplyCommand(name) {
  return [
    `${applyCommandPrefix}node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs`,
    `  --name ${name}`,
    '  --token-id <token-id>',
    '  --txid <txid>',
    '  --block-height <block-height>'
  ].join(' \\\n');
}

function sourceDetails(step, renderedEntry) {
  if (step.kind === 'catalog') {
    if (!renderedEntry?.rendered_path) return null;
    return {
      logical_path: renderedEntry.rendered_path,
      absolute_path: absFromLogicalPath(renderedEntry.rendered_path),
      bytes: renderedEntry.rendered_bytes,
      chunks: renderedEntry.rendered_chunks,
      sha256: renderedEntry.rendered_sha256,
      route: renderedEntry.rendered_route
    };
  }

  return {
    logical_path: step.path,
    absolute_path: absFromLogicalPath(step.path),
    bytes: step.bytes,
    chunks: step.chunks,
    sha256: step.sha256,
    route: step.route
  };
}

function buildStepItem(step, record, tokenEntries, renderedByName, logByName, completeBatches) {
  const tokenEntry = tokenEntries[step.name] || null;
  const renderedEntry = renderedByName.get(step.name) || null;
  const logEntry = logByName.get(step.name) || null;
  const dependencyNames = [...(step.depends_on || [])];
  const dependencyRecords = dependencyNames.map((name) => {
    const entry = tokenEntries[name] || null;
    return {
      name,
      token_id: entry?.token_id ?? null,
      txid: entry?.txid ?? null,
      block_height: entry?.block_height ?? null,
      resolved: isTokenResolved(entry)
    };
  });
  const missingDependencies = dependencyRecords.filter((entry) => !entry.resolved).map((entry) => entry.name);
  const dependencyTokenIds = dependencyRecords.filter((entry) => entry.resolved).map((entry) => entry.token_id);
  const item = {
    batch: step.batch,
    order: step.order,
    name: step.name,
    kind: step.kind,
    route: step.route,
    mime: step.mime,
    dependency_names: dependencyNames,
    dependency_token_ids: dependencyTokenIds,
    missing_dependencies: missingDependencies,
    token_id: tokenEntry?.token_id ?? null,
    txid: tokenEntry?.txid ?? null,
    block_height: tokenEntry?.block_height ?? null,
    rendered_status: renderedEntry?.status || null,
    rendered_path: renderedEntry?.rendered_path || null,
    resolution_signature: renderedEntry?.resolution_signature || null,
    log_recorded: Boolean(logEntry),
    source: null,
    execution: null,
    notes: []
  };

  if (isTokenResolved(tokenEntry)) {
    if (logEntry && !compareRecorded(tokenEntry, logEntry)) {
      item.status = 'hard-stop';
      item.notes.push('Token map and inscription log disagree for a recorded artifact.');
      return item;
    }
    item.status = 'minted';
    item.source = sourceDetails(step, renderedEntry);
    return item;
  }

  if (logEntry) {
    item.status = 'hard-stop';
    item.notes.push('Inscription log contains this artifact but the token map is still unresolved.');
    return item;
  }

  const incompletePrerequisites = (step.prerequisite_batches || []).filter((batch) => !completeBatches.has(batch));
  if (incompletePrerequisites.length > 0) {
    item.status = 'blocked';
    item.notes.push(`Prerequisite batches are not complete: ${incompletePrerequisites.join(', ')}.`);
    return item;
  }

  if (step.kind === 'catalog') {
    if (!renderedEntry) {
      item.status = 'hard-stop';
      item.notes.push('Rendered index entry is missing for this catalog.');
      return item;
    }
    if (renderedEntry.inscribed) {
      item.status = 'hard-stop';
      item.notes.push('Rendered index says this catalog is inscribed but the token map does not.');
      return item;
    }
    if (renderedEntry.status === 'route-mismatch') {
      item.status = 'hard-stop';
      item.notes.push('Rendered catalog route does not match the frozen batch plan.');
      return item;
    }
    if (renderedEntry.status === 'unresolved') {
      item.status = 'hard-stop';
      item.notes.push('Rendered catalog still contains unresolved dependency fields.');
      return item;
    }
    if (renderedEntry.status !== 'ready') {
      item.status = 'blocked';
      item.notes.push(`Rendered catalog is not ready yet (${renderedEntry.status}).`);
      return item;
    }
  }

  if (missingDependencies.length > 0) {
    item.status = 'blocked';
    item.notes.push('Direct dependencies are not fully resolved yet.');
    return item;
  }

  const source = sourceDetails(step, renderedEntry);
  if (!source?.absolute_path) {
    item.status = 'hard-stop';
    item.notes.push('Mint source path could not be resolved.');
    return item;
  }

  item.status = 'ready';
  item.source = source;
  item.execution = {
    route: source.route || step.route,
    function: plannedFunction(source.route || step.route, dependencyTokenIds),
    recursive_dependencies: dependencyTokenIds,
    apply_result_command: buildApplyCommand(step.name)
  };
  if (record?.dependency_names?.length !== dependencyNames.length) {
    item.notes.push('Batch dependency list differs from module-index dependency list; batch order is treated as canonical.');
  }
  return item;
}

function summarize(items) {
  const summary = {
    total: items.length,
    minted: 0,
    ready: 0,
    blocked: 0,
    hard_stop: 0
  };

  for (const item of items) {
    if (item.status === 'minted') summary.minted += 1;
    else if (item.status === 'ready') summary.ready += 1;
    else if (item.status === 'hard-stop') summary.hard_stop += 1;
    else summary.blocked += 1;
  }

  return summary;
}

async function loadOrderedSteps() {
  const batches = await loadExecutionBatches();
  const steps = [];
  for (const { file, batch } of batches) {
    const artifacts = [...(batch.artifacts || [])].sort((left, right) => left.order - right.order);
    for (const artifact of artifacts) {
      steps.push({
        batch: file,
        prerequisite_batches: [...(batch.prerequisite_batches || [])],
        ...artifact,
        kind: artifact.path.includes('/catalogs/') ? 'catalog' : 'leaf'
      });
    }
  }
  return steps;
}

export async function buildInscriptionStatus(options = {}) {
  const tokenMapPath = path.resolve(options.tokenMapPath || defaultTokenMapPath);
  const inscriptionLogPath = path.resolve(options.inscriptionLogPath || defaultInscriptionLogPath);
  const renderedIndexPath = path.resolve(options.renderedIndexPath || defaultRenderedIndexPath);

  const moduleIndex = await loadModuleIndex();
  const moduleByName = new Map(moduleIndex.map((record) => [record.name, record]));
  const steps = await loadOrderedSteps();
  const tokenMap = await readJsonAt(tokenMapPath);
  const renderedIndex = await readJsonAt(renderedIndexPath);
  const inscriptionLog = (await pathExists(inscriptionLogPath))
    ? await readJsonAt(inscriptionLogPath)
    : { entries: [] };
  const renderedByName = new Map((renderedIndex.catalogs || []).map((entry) => [entry.name, entry]));
  const logByName = new Map((inscriptionLog.entries || []).map((entry) => [entry.name, entry]));
  const batchArtifacts = new Map();
  for (const step of steps) {
    if (!batchArtifacts.has(step.batch)) batchArtifacts.set(step.batch, []);
    batchArtifacts.get(step.batch).push(step.name);
  }
  const completeBatches = new Set(
    [...batchArtifacts.entries()]
      .filter(([, names]) => names.every((name) => isTokenResolved((tokenMap.entries || {})[name])))
      .map(([batch]) => batch)
  );

  const items = steps.map((step) =>
    buildStepItem(
      step,
      moduleByName.get(step.name) || null,
      tokenMap.entries || {},
      renderedByName,
      logByName,
      completeBatches
    )
  );
  const summary = summarize(items);
  const nextReady = items.find((item) => item.status === 'ready') || null;
  const hardStops = items.filter((item) => item.status === 'hard-stop');
  const readyNow = items.filter((item) => item.status === 'ready');

  const report = {
    generated_at: new Date().toISOString(),
    bundle_root: bundleRoot,
    token_map: displayPath(tokenMapPath),
    inscription_log: displayPath(inscriptionLogPath),
    rendered_index: displayPath(renderedIndexPath),
    summary,
    next_ready: nextReady,
    ready_now: readyNow,
    hard_stops: hardStops,
    items
  };

  if (options.out) {
    await writeJsonAt(path.resolve(options.out), report);
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildInscriptionStatus(args);
  console.log(
    `Inscription status: ${report.summary.minted}/${report.summary.total} minted, ${report.summary.ready} ready, ${report.summary.blocked} blocked, ${report.summary.hard_stop} hard-stop.`
  );
  if (report.next_ready) {
    console.log(
      `Next ready artifact: ${report.next_ready.name} (${report.next_ready.kind}, ${report.next_ready.execution.function}) from ${toPosix(report.next_ready.source.absolute_path)}.`
    );
  } else if (report.hard_stops.length > 0) {
    console.log(`Hard stop: ${report.hard_stops[0].name} -> ${report.hard_stops[0].notes[0]}`);
  } else {
    console.log('No ready artifact is currently available.');
  }
  if (args.out) {
    console.log(`Wrote report to ${displayPath(args.out)}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
