// dashboard/server.js
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const {
  AnchorMode,
  FungibleConditionCode,
  PostConditionMode,
  bufferCV,
  contractPrincipalCV,
  listCV,
  makeStandardSTXPostCondition,
  makeUnsignedContractCall,
  stringAsciiCV,
  uintCV
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const { sseHandler, broadcast } = require('./sse');
const stateManager = require('./state');
const markdown = require('./markdown');
const { initPhases, runPhase, cancelPhase, getPhaseStatus, getLatestDraft } = require('./phases');
const { hasAgent27Signer } = require('../scripts/agent27-signer.cjs');
const {
  initSkillTestRunner,
  getSkillTestStatus,
  getSkillTestRun,
  runSkillTest,
  cancelSkillTest,
  listSkillTests
} = require('./skill-test-runner');
const { initWatcher, stopWatcher } = require('./watcher');
const { startChainPoller, stopChainPoller, getChainData, onAfterPoll } = require('./chain');
const { mount: mountOutreach, syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend } = require('./outreach');
const { startHeartbeatPoller, stopHeartbeatPoller, getHeartbeatStatus, triggerHeartbeat } = require('./heartbeat');
const {
  initAutoConverse,
  getConfig: getAutoConverseConfig,
  updateConfig: updateAutoConverseConfig,
  processNewMessages,
  getReplyQueue: getAutoConverseQueue,
  approveReply,
  dismissReply
} = require('./auto-converse');
const {
  WORKDIR,
  BVST_BUNDLE_DIR,
  XTRATA_CANARY_BUNDLE_DIR,
  AVG_COST_PER_ENTRY,
  REGISTERED_AGENTS_FILE,
  LEGACY_REGISTERED_AGENTS_FILE
} = require('./config');

const app = express();
const PORT = Number(process.env.PORT || 2727);
const LOG_LIMIT = 200;
const XTRATA_CHUNK_SIZE = 16_384;
const XTRATA_CORE_CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const XTRATA_CORE_CONTRACT_NAME = 'xtrata-v2-1-0';
const XTRATA_HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const XTRATA_DEFAULT_SENDER = 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ';
const XTRATA_ESTIMATE_PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const activityLog = [];
const plannerPricingCache = {
  key: null,
  value: null
};
const plannerAutomationState = {
  active: null,
  lastByRelease: {}
};
const PLANNER_RELEASES = {
  'bvst-first-wave': {
    id: 'bvst-first-wave',
    name: 'BVST First-Wave Bundle',
    bundleDir: BVST_BUNDLE_DIR,
    docs: [
      path.join(BVST_BUNDLE_DIR, 'README.md'),
      path.join(BVST_BUNDLE_DIR, 'INSCRIPTION_AUTOMATION.md'),
      path.join(BVST_BUNDLE_DIR, 'on-chain-planning', '04-xtrata-inscription-workflow.md')
    ],
    kind: 'production'
  },
  'xtrata-canary': {
    id: 'xtrata-canary',
    name: 'Xtrata Canary Release',
    bundleDir: XTRATA_CANARY_BUNDLE_DIR,
    docs: [
      path.join(XTRATA_CANARY_BUNDLE_DIR, 'README.md'),
      path.join(XTRATA_CANARY_BUNDLE_DIR, 'INSCRIPTION_AUTOMATION.md')
    ],
    kind: 'canary'
  }
};

function signerConfigured() {
  return hasAgent27Signer();
}

function plannerAutoInscribeScriptPath() {
  return path.join(WORKDIR, 'skills', 'xtrata-release-plan', 'scripts', 'xtrata-auto-inscribe.cjs');
}

function canAutoInscribeRelease(releaseId) {
  return releaseId === 'xtrata-canary' && fs.existsSync(plannerAutoInscribeScriptPath());
}

function readPlannerRunLog(bundleDir) {
  const runLogPath = path.join(bundleDir, 'verification', 'auto-inscribe-run.json');
  return {
    path: runLogPath,
    data: safeReadJson(runLogPath)
  };
}

function readJsonLinesTail(absPath, limit = 25) {
  try {
    if (!fs.existsSync(absPath)) return [];
    const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { raw: line, error: err.message || String(err) };
      }
    });
  } catch (err) {
    return [{ error: err.message || String(err), path: absPath }];
  }
}

function readPlannerTraceArtifacts(bundleDir) {
  const eventLogPath = path.join(bundleDir, 'verification', 'auto-inscribe-events.jsonl');
  const chainLogPath = path.join(bundleDir, 'verification', 'auto-inscribe-chain.jsonl');
  const failureSnapshotPath = path.join(bundleDir, 'verification', 'auto-inscribe-failure.json');
  return {
    eventLogPath,
    chainLogPath,
    failureSnapshotPath,
    eventTail: readJsonLinesTail(eventLogPath),
    chainTail: readJsonLinesTail(chainLogPath),
    failureSnapshot: safeReadJson(failureSnapshotPath)
  };
}

function sanitizePlannerRun(run) {
  if (!run) return null;
  return {
    releaseId: run.releaseId,
    bundleDir: run.bundleDir ? toRelative(run.bundleDir) : null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    status: run.status,
    pid: run.pid || null,
    command: run.command || null,
    recentLogs: Array.isArray(run.recentLogs) ? run.recentLogs.slice(-30) : []
  };
}

function pushPlannerRunLog(run, stream, line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;
  const entry = {
    at: new Date().toISOString(),
    stream,
    line: trimmed
  };
  run.recentLogs.push(entry);
  if (run.recentLogs.length > 80) {
    run.recentLogs.shift();
  }
  broadcast({
    event: 'planner-run',
    data: {
      releaseId: run.releaseId,
      status: run.status,
      log: entry
    }
  });
}

function watchPlannerRunStream(run, stream, input) {
  let buffer = '';
  input.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      pushPlannerRunLog(run, stream, line);
    }
  });
  input.on('end', () => {
    if (buffer.trim()) {
      pushPlannerRunLog(run, stream, buffer);
    }
  });
}

function startPlannerAutoRun(releaseConfig) {
  if (plannerAutomationState.active) {
    throw new Error(`Another planner automation run is already active for ${plannerAutomationState.active.releaseId}.`);
  }

  const scriptPath = plannerAutoInscribeScriptPath();
  const child = spawn(process.execPath, [scriptPath, releaseConfig.bundleDir], {
    cwd: WORKDIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const run = {
    releaseId: releaseConfig.id,
    bundleDir: releaseConfig.bundleDir,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    pid: child.pid,
    command: `node ${toRelative(scriptPath)} ${toRelative(releaseConfig.bundleDir)}`,
    recentLogs: [],
    child
  };

  plannerAutomationState.active = run;
  watchPlannerRunStream(run, 'stdout', child.stdout);
  watchPlannerRunStream(run, 'stderr', child.stderr);
  addLog('start', `[planner-auto] started ${releaseConfig.id} (${child.pid})`);
  broadcast({
    event: 'planner-run',
    data: {
      releaseId: run.releaseId,
      status: run.status,
      startedAt: run.startedAt
    }
  });

  child.on('close', (code) => {
    run.finishedAt = new Date().toISOString();
    run.status = code === 0 ? 'completed' : 'failed';
    const snapshot = sanitizePlannerRun(run);
    plannerAutomationState.lastByRelease[releaseConfig.id] = snapshot;
    plannerAutomationState.active = null;
    addLog('stop', `[planner-auto] ${releaseConfig.id} ${run.status} (${code})`);
    broadcast({
      event: 'planner-run',
      data: {
        releaseId: releaseConfig.id,
        status: run.status,
        finishedAt: run.finishedAt
      }
    });
  });

  child.on('error', (err) => {
    pushPlannerRunLog(run, 'stderr', err.message || String(err));
  });

  return sanitizePlannerRun(run);
}

function addLog(type, line) {
  const entry = { timestamp: new Date().toISOString(), type, line };
  activityLog.push(entry);
  if (activityLog.length > LOG_LIMIT) activityLog.shift();
  broadcast({ event: 'log', data: entry });
  return entry;
}

function getMetricValue(rows, metricName) {
  const row = rows.find((item) => {
    if (!item.metric) return false;
    return item.metric.toLowerCase() === metricName.toLowerCase();
  });
  return row ? row.value : null;
}

function parseNumber(value) {
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function safeReadJson(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    return { __error: err.message || String(err), __path: absPath };
  }
}

function toRelative(absPath) {
  return path.relative(WORKDIR, absPath).split(path.sep).join(path.posix.sep);
}

function getMtimeMs(absPath) {
  try {
    return fs.statSync(absPath).mtimeMs;
  } catch (err) {
    return 0;
  }
}

function getPlannerReleaseConfig(releaseId) {
  return PLANNER_RELEASES[releaseId] || PLANNER_RELEASES['bvst-first-wave'];
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function protocolFeeForChunks(chunks, feeUnitMicroStx) {
  const begin = feeUnitMicroStx;
  const seal = feeUnitMicroStx * (1n + ((BigInt(chunks) + 49n) / 50n));
  return begin + seal;
}

function resolveBundlePath(bundleRoot, recordPath) {
  return path.join(bundleRoot, recordPath.replace(/^on-chain-modules\//, ''));
}

function chunkBuffer(buf) {
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += XTRATA_CHUNK_SIZE) {
    chunks.push(buf.subarray(offset, offset + XTRATA_CHUNK_SIZE));
  }
  return chunks;
}

async function buildHelperEstimate(step, bundleRoot, feeUnitMicroStx, mimeType) {
  const absPath = resolveBundlePath(bundleRoot, step.bundlePath);
  const buf = fs.readFileSync(absPath);
  const chunks = chunkBuffer(buf);
  const dependencyIds = (step.dependsOn || []).map((_, index) => BigInt(index + 1));
  const tokenUri = step.bundlePath.slice(0, 256);
  const protocolFee = protocolFeeForChunks(step.chunks, feeUnitMicroStx);
  const isRecursive = dependencyIds.length > 0;
  const functionArgs = [
    contractPrincipalCV(XTRATA_CORE_CONTRACT_ADDRESS, XTRATA_CORE_CONTRACT_NAME),
    bufferCV(Buffer.from('00'.repeat(32), 'hex')),
    stringAsciiCV(mimeType),
    uintCV(BigInt(buf.length)),
    listCV(chunks.map((chunk) => bufferCV(chunk))),
    stringAsciiCV(tokenUri),
    ...(isRecursive ? [listCV(dependencyIds.map((id) => uintCV(id)))] : [])
  ];

  const tx = await makeUnsignedContractCall({
    publicKey: XTRATA_ESTIMATE_PUBLIC_KEY,
    contractAddress: XTRATA_CORE_CONTRACT_ADDRESS,
    contractName: XTRATA_HELPER_CONTRACT_NAME,
    functionName: isRecursive ? 'mint-small-single-tx-recursive' : 'mint-small-single-tx',
    functionArgs,
    network: new StacksMainnet(),
    fee: 0n,
    nonce: 0n,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      makeStandardSTXPostCondition(XTRATA_DEFAULT_SENDER, FungibleConditionCode.LessEqual, protocolFee)
    ]
  });

  return {
    estimatedLen: tx.serialize().byteLength,
    dependencyCount: dependencyIds.length
  };
}

async function derivePricing({ bundleRoot, quote, status, moduleIndex, fallbackQuote = null }) {
  const steps = Array.isArray(quote?.execution?.steps) ? quote.execution.steps : [];
  const liveQuote = quote?.quote?.live ? quote.quote : (fallbackQuote?.quote?.live ? fallbackQuote.quote : (quote?.quote || {}));
  const liveMining = liveQuote?.miningFee?.live || {};
  const feeUnitMicroStx = liveQuote?.feeUnitMicroStx ? BigInt(liveQuote.feeUnitMicroStx) : null;
  const transferFeeRate = liveMining?.available && liveMining.transferFeeRateMicroStxPerByte
    ? BigInt(liveMining.transferFeeRateMicroStxPerByte)
    : null;
  const statusItems = Array.isArray(status?.items) ? status.items : [];
  const statusByName = new Map(statusItems.map((item) => [item.name, item]));
  const moduleIndexByName = new Map(
    Array.isArray(moduleIndex)
      ? moduleIndex.map((item) => [item.name, item])
      : []
  );

  const artifacts = [];
  for (const step of steps) {
    const protocolFeeMicroStx = feeUnitMicroStx ? protocolFeeForChunks(step.chunks, feeUnitMicroStx) : null;
    const protocolFeeStx = protocolFeeMicroStx === null ? null : Number(protocolFeeMicroStx) / 1e6;
    const statusItem = statusByName.get(step.name);
    const mimeType = statusItem?.mime || moduleIndexByName.get(step.name)?.mime_type || 'application/octet-stream';
    const artifact = {
      name: step.name,
      batch: step.batch,
      route: step.route,
      protocolFeeMicroStx: protocolFeeMicroStx === null ? null : protocolFeeMicroStx.toString(),
      protocolFeeStx,
      liveMiningMicroStx: null,
      liveMiningStx: null,
      serializedBytes: null,
      totalProjectedStx: protocolFeeStx,
      liveEstimateAvailable: false,
      note: null
    };

    if (step.route !== 'helper') {
      artifact.note = 'Live mining estimate currently models helper-route transactions only.';
      artifacts.push(artifact);
      continue;
    }
    if (!transferFeeRate || !feeUnitMicroStx) {
      artifact.note = 'Live mining estimate unavailable in the current quote snapshot.';
      artifacts.push(artifact);
      continue;
    }

    const estimate = await buildHelperEstimate(step, bundleRoot, feeUnitMicroStx, mimeType);
    const miningMicroStx = transferFeeRate * BigInt(estimate.estimatedLen);
    artifact.liveMiningMicroStx = miningMicroStx.toString();
    artifact.liveMiningStx = Number(miningMicroStx) / 1e6;
    artifact.serializedBytes = estimate.estimatedLen;
    artifact.totalProjectedStx = (artifact.protocolFeeStx || 0) + artifact.liveMiningStx;
    artifact.liveEstimateAvailable = true;
    artifacts.push(artifact);
  }

  const artifactsByName = Object.fromEntries(artifacts.map((item) => [item.name, item]));
  const batches = {};
  for (const step of steps) {
    if (!batches[step.batch]) {
      batches[step.batch] = {
        batch: step.batch,
        artifactCount: 0,
        protocolFeeStx: 0,
        liveMiningStx: 0,
        totalProjectedStx: 0,
        liveEstimatedCount: 0,
        nonLiveCount: 0,
        serializedBytes: 0
      };
    }
    const batch = batches[step.batch];
    const artifact = artifactsByName[step.name];
    batch.artifactCount += 1;
    batch.protocolFeeStx += artifact?.protocolFeeStx || 0;
    batch.liveMiningStx += artifact?.liveMiningStx || 0;
    batch.totalProjectedStx += artifact?.totalProjectedStx || 0;
    batch.serializedBytes += artifact?.serializedBytes || 0;
    if (artifact?.liveEstimateAvailable) {
      batch.liveEstimatedCount += 1;
    } else {
      batch.nonLiveCount += 1;
    }
  }

  for (const batch of Object.values(batches)) {
    batch.liveEstimateCoverage = batch.artifactCount === 0
      ? 0
      : batch.liveEstimatedCount / batch.artifactCount;
  }

  return {
    contextSource: quote?.quote?.live ? 'bundle-quote' : (fallbackQuote?.quote?.live ? 'bvst-production-fallback' : 'none'),
    liveFeeRateMicroStxPerByte: transferFeeRate ? transferFeeRate.toString() : null,
    feeUnitMicroStx: feeUnitMicroStx ? feeUnitMicroStx.toString() : null,
    feeUnitStx: feeUnitMicroStx ? Number(feeUnitMicroStx) / 1e6 : null,
    artifactsByName,
    batchesByName: batches
  };
}

async function loadInscriptionPlannerData(releaseId = 'bvst-first-wave') {
  const releaseConfig = getPlannerReleaseConfig(releaseId);
  const bundleDir = releaseConfig.bundleDir;
  const quotePath = path.join(bundleDir, 'verification', 'preflight.quote.json');
  const statusPath = path.join(bundleDir, 'verification', 'inscription-status.json');
  const safetyPath = path.join(bundleDir, 'verification', 'pre-inscription.report.json');
  const moduleIndexPath = path.join(bundleDir, 'verification', 'module-index.json');
  const renderedIndexPath = path.join(bundleDir, 'verification', 'rendered-index.json');
  const tokenMapPath = path.join(bundleDir, 'configs', 'token-map.runtime.json');
  const logPath = path.join(bundleDir, 'verification', 'inscription-log.json');
  const fallbackQuote = releaseConfig.id === 'bvst-first-wave'
    ? null
    : safeReadJson(path.join(BVST_BUNDLE_DIR, 'verification', 'preflight.quote.json'));

  const quote = safeReadJson(quotePath);
  const status = safeReadJson(statusPath);
  const safety = safeReadJson(safetyPath);
  const moduleIndex = safeReadJson(moduleIndexPath);
  const renderedIndex = safeReadJson(renderedIndexPath);
  const tokenMap = safeReadJson(tokenMapPath);
  const inscriptionLog = safeReadJson(logPath);
  const runLog = readPlannerRunLog(bundleDir);
  const traceArtifacts = readPlannerTraceArtifacts(bundleDir);
  const activeRun = plannerAutomationState.active?.releaseId === releaseConfig.id
    ? sanitizePlannerRun(plannerAutomationState.active)
    : null;
  const lastRun = plannerAutomationState.lastByRelease[releaseConfig.id] || null;
  const pricingCacheKey = [
    bundleDir,
    getMtimeMs(quotePath),
    getMtimeMs(statusPath),
    getMtimeMs(moduleIndexPath)
  ].join(':');
  let pricing = plannerPricingCache.key === pricingCacheKey ? plannerPricingCache.value : null;
  if (!pricing) {
    try {
      pricing = await derivePricing({
        bundleRoot: bundleDir,
        quote,
        status,
        moduleIndex,
        fallbackQuote
      });
      plannerPricingCache.key = pricingCacheKey;
      plannerPricingCache.value = pricing;
    } catch (err) {
      pricing = {
        error: err.message || String(err),
        liveFeeRateMicroStxPerByte: null,
        feeUnitMicroStx: null,
        feeUnitStx: null,
        artifactsByName: {},
        batchesByName: {}
      };
    }
  }

  const steps = Array.isArray(quote?.execution?.steps) ? quote.execution.steps : [];
  const leafCount = steps.filter(step => step.kind === 'leaf').length;
  const catalogCount = steps.filter(step => step.kind === 'catalog').length;
  const helperCount = steps.filter(step => step.route === 'helper').length;
  const stagedCount = steps.filter(step => step.route === 'staged').length;

  return {
    generatedAt: new Date().toISOString(),
    releases: Object.values(PLANNER_RELEASES).map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind
    })),
    selectedRelease: releaseConfig.id,
    currentRelease: {
      id: releaseConfig.id,
      name: releaseConfig.name,
      kind: releaseConfig.kind,
      bundleRoot: toRelative(bundleDir),
      artifactCount: steps.length || null,
      leafCount,
      catalogCount,
      helperCount,
      stagedCount
    },
    quote,
    status,
    safety,
    pricing,
    moduleIndex,
    renderedIndex,
    tokenMap,
    inscriptionLog,
    automation: {
      signerConfigured: signerConfigured(),
      activeRun,
      lastRun,
      runLogPath: toRelative(runLog.path),
      runLog: runLog.data,
      eventLogPath: toRelative(traceArtifacts.eventLogPath),
      chainLogPath: toRelative(traceArtifacts.chainLogPath),
      failureSnapshotPath: toRelative(traceArtifacts.failureSnapshotPath),
      eventTail: traceArtifacts.eventTail,
      chainTail: traceArtifacts.chainTail,
      failureSnapshot: traceArtifacts.failureSnapshot
    },
    paths: {
      quote: toRelative(quotePath),
      status: toRelative(statusPath),
      safety: toRelative(safetyPath),
      moduleIndex: toRelative(moduleIndexPath),
      renderedIndex: toRelative(renderedIndexPath),
      tokenMap: toRelative(tokenMapPath),
      inscriptionLog: toRelative(logPath),
      autoRunLog: toRelative(runLog.path),
      autoEventLog: toRelative(traceArtifacts.eventLogPath),
      autoChainLog: toRelative(traceArtifacts.chainLogPath),
      autoFailureSnapshot: toRelative(traceArtifacts.failureSnapshotPath)
    },
    runtimeFiles: [
      toRelative(tokenMapPath),
      toRelative(logPath),
      toRelative(renderedIndexPath),
      toRelative(statusPath)
    ],
    docs: releaseConfig.docs.filter((docPath) => fs.existsSync(docPath)).map((docPath) => toRelative(docPath)),
    intakeChecklist: [
      'Files or directory to inscribe',
      'Planning brief or dependency manifest',
      'Optional existing token-map/runtime state',
      'Target network and contract deployment'
    ],
    plannerActions: {
      canaryRunnable: fs.existsSync(path.join(XTRATA_CANARY_BUNDLE_DIR, 'scripts', 'run-canary-gate.mjs')),
      canaryInscribeAvailable: canAutoInscribeRelease(releaseConfig.id),
      canaryInscribeEnabled: canAutoInscribeRelease(releaseConfig.id) && signerConfigured() && !plannerAutomationState.active
    }
  };
}

// Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - start}ms)`;
    console.log(`[${new Date().toISOString()}] ${line}`);
    addLog('http', line);
  });
  next();
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// --- API Routes ---

app.get('/api/status', (req, res) => {
  res.json(stateManager.getState());
});

app.get('/api/research', (req, res) => {
  res.json(markdown.parseResearchBuffer());
});

app.get('/api/ideas', (req, res) => {
  res.json(markdown.parseIdeas());
});

app.get('/api/ledger', (req, res) => {
  res.json(markdown.parseLedger());
});

app.get('/api/agents', (req, res) => {
  res.json(markdown.parseAgents());
});

app.get('/api/evolution', (req, res) => {
  res.json(markdown.parseEvolution());
});

app.post('/api/save/:docId', (req, res) => {
  const { docId } = req.params;
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ ok: false, error: 'content required' });
  }
  const result = markdown.saveDocument(docId, content);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get('/api/log', (req, res) => {
  res.json(activityLog);
});

app.get('/api/chain', (req, res) => {
  const ledger = markdown.parseLedger();
  const runningTotals = ledger.runningTotals || [];
  const state = stateManager.getState();
  const live = getChainData();

  const stxRemainingLabel = getMetricValue(runningTotals, 'STX remaining');
  const daysOfLifeLabel = getMetricValue(runningTotals, 'Days of on-chain life');
  const stxSpentLabel = getMetricValue(runningTotals, 'STX spent (total)');
  const inscriptionsLabel = getMetricValue(runningTotals, 'Inscriptions sealed');
  const researchCyclesLabel = getMetricValue(runningTotals, 'Research cycles run');

  const stxRemaining = live.stxBalance !== null ? live.stxBalance : parseNumber(stxRemainingLabel);
  const daysOfLife = stxRemaining !== null ? Math.floor(stxRemaining / AVG_COST_PER_ENTRY) : parseNumber(daysOfLifeLabel);
  const stxSpent = parseNumber(stxSpentLabel);
  const initialBudget = 10;
  const reservePercent = stxRemaining === null
    ? null
    : Math.max(0, Math.min(100, (stxRemaining / initialBudget) * 100));

  res.json({
    stxRemaining,
    stxRemainingLabel: live.stxBalance !== null ? `${live.stxBalance.toFixed(6)} STX` : stxRemainingLabel,
    sbtcBalance: live.sbtcBalance,
    sbtcRemainingLabel: live.sbtcBalance !== null ? `${(live.sbtcBalance / 100_000_000).toFixed(8)} sBTC` : '--',
    daysOfLife,
    daysOfLifeLabel: daysOfLife !== null ? `~${daysOfLife} days` : daysOfLifeLabel,
    stxSpent,
    stxSpentLabel,
    inscriptionsLabel,
    researchCyclesLabel,
    reservePercent,
    initialBudget,
    graphSize: live.graphSize,
    feeUnit: live.feeUnit,
    transactions: live.transactions,
    lastPoll: live.lastPoll,
    lastInscription: state.lastInscription,
    errors: state.errors || []
  });
});

// --- Phase routes (replaces scheduler) ---

app.get('/api/phase-status', (req, res) => {
  res.json(getPhaseStatus());
});

app.get('/api/draft', (req, res) => {
  const draft = getLatestDraft();
  res.json(draft || { name: null });
});

app.post('/api/run/:phaseId', (req, res) => {
  const { model } = req.body || {};
  console.log(`[server] POST /api/run/${req.params.phaseId} received (model: ${model || 'default'})`);

  const skillTestStatus = getSkillTestStatus();
  if (skillTestStatus.running) {
    const error = `Skills Lab run "${skillTestStatus.running.runId}" is active`;
    addLog('error', `Run rejected: ${error}`);
    return res.status(409).json({ ok: false, error });
  }

  const result = runPhase(req.params.phaseId, { model });
  if (result.ok) {
    addLog('start', `Run: ${req.params.phaseId} (${model || 'default model'})`);
    console.log(`[server] Phase ${req.params.phaseId} dispatched successfully`);
  } else {
    addLog('error', `Run rejected: ${result.error}`);
    console.log(`[server] Phase ${req.params.phaseId} rejected: ${result.error}`);
  }
  res.json(result);
});

app.post('/api/cancel', (req, res) => {
  const result = cancelPhase();
  if (result.ok) {
    addLog('stop', 'Phase cancelled by user');
  }
  res.json(result);
});

// --- Skills Lab Routes ---

app.get('/api/skill-tests', (req, res) => {
  res.json({
    skills: listSkillTests(),
    status: getSkillTestStatus()
  });
});

app.get('/api/skill-tests/status', (req, res) => {
  res.json(getSkillTestStatus());
});

app.get('/api/skill-tests/runs/:runId', (req, res) => {
  const run = getSkillTestRun(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

app.post('/api/skill-tests/run', (req, res) => {
  const { skillId, scenarioId, mode, model, budget } = req.body || {};
  if (!skillId || !scenarioId) {
    return res.status(400).json({ ok: false, error: 'skillId and scenarioId are required' });
  }

  const phaseStatus = getPhaseStatus();
  if (phaseStatus.running) {
    return res.status(409).json({ ok: false, error: `Production phase "${phaseStatus.running.phaseId}" is active` });
  }

  const result = runSkillTest({ skillId, scenarioId, mode, model, budget });
  if (result.ok) {
    addLog('start', `Skills Lab: ${skillId}/${scenarioId}`);
  } else {
    addLog('error', `Skills Lab rejected: ${result.error}`);
  }

  res.json(result);
});

app.post('/api/skill-tests/cancel', (req, res) => {
  const result = cancelSkillTest();
  if (result.ok) {
    addLog('stop', 'Skills Lab run cancelled');
  }
  res.json(result);
});

// --- Outreach Routes (delegated to outreach.js) ---
app.use('/api/outreach', mountOutreach({
  addLog,
  broadcast,
  registryFile: REGISTERED_AGENTS_FILE,
  legacyRegistryFile: LEGACY_REGISTERED_AGENTS_FILE
}));

// --- Heartbeat Routes ---

app.get('/api/heartbeat/status', (req, res) => {
  res.json(getHeartbeatStatus());
});

app.post('/api/heartbeat/trigger', async (req, res) => {
  try {
    const status = await triggerHeartbeat();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Auto-Converse Routes ---

app.get('/api/auto-converse', (req, res) => {
  res.json(getAutoConverseConfig());
});

app.post('/api/auto-converse', (req, res) => {
  const config = updateAutoConverseConfig(req.body);
  addLog('start', `Auto-converse config updated: enabled=${config.enabled}, mode=${config.mode}, autoSend=${config.autoSend}`);
  res.json({ ok: true, config });
});

app.get('/api/auto-converse/queue', (req, res) => {
  res.json(getAutoConverseQueue());
});

app.post('/api/auto-converse/approve', (req, res) => {
  const { agentId, message } = req.body || {};
  if (!agentId || !message) return res.status(400).json({ ok: false, error: 'agentId and message required' });
  const result = approveReply(agentId, message);
  if (result.ok) addLog('start', `Auto-converse: approved send to ${result.agent}`);
  res.json(result);
});

app.post('/api/auto-converse/dismiss', (req, res) => {
  const { agentId, message } = req.body || {};
  if (!agentId || !message) return res.status(400).json({ ok: false, error: 'agentId and message required' });
  const result = dismissReply(agentId, message);
  res.json(result);
});

// --- SSE Route ---
app.get('/events', sseHandler);

app.get('/api/inscription-planner/current-release', (req, res) => {
  try {
    Promise.resolve(loadInscriptionPlannerData(req.query.release))
      .then((data) => res.json(data))
      .catch((err) => res.status(500).json({ ok: false, error: err.message }));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/inscription-planner/canary/run', async (req, res) => {
  try {
    await execFileAsync(process.execPath, ['TASKS/xtrata-canary-release/scripts/run-canary-gate.mjs'], {
      cwd: WORKDIR
    });
    const data = await loadInscriptionPlannerData('xtrata-canary');
    res.json({ ok: true, releaseId: 'xtrata-canary', data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/inscription-planner/canary/inscribe', async (req, res) => {
  try {
    if (!canAutoInscribeRelease('xtrata-canary')) {
      return res.status(404).json({ ok: false, error: 'Canary auto-inscribe runner is not installed.' });
    }
    if (!signerConfigured()) {
      return res.status(400).json({ ok: false, error: 'Agent 27 signer path is unavailable. Restore the configured signer before starting auto-inscription.' });
    }
    if (plannerAutomationState.active) {
      return res.status(409).json({
        ok: false,
        error: `Automation run already active for ${plannerAutomationState.active.releaseId}.`
      });
    }

    const run = startPlannerAutoRun(getPlannerReleaseConfig('xtrata-canary'));
    const data = await loadInscriptionPlannerData('xtrata-canary');
    res.json({ ok: true, releaseId: 'xtrata-canary', run, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Main Route ---
app.get('/inscription-planner', (req, res) => {
  res.sendFile(path.join(__dirname, 'inscription-planner.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

const server = app.listen(PORT, () => {
  const line = `Agent 27 Dashboard server running at http://localhost:${PORT}`;
  console.log(line);
  addLog('start', line);

  initPhases(WORKDIR, broadcast, addLog);
  initSkillTestRunner(broadcast);
  initWatcher(WORKDIR, broadcast);
  startChainPoller(broadcast);
  startHeartbeatPoller(broadcast, addLog);

  // Init auto-converse with outreach functions
  initAutoConverse({
    addLog, broadcast,
    outreach: { syncInbox, buildOutreachContext, loadAgentsRegistry, executeSend }
  });

  // Register inbox auto-sync as a post-poll hook (runs every 5 min with chain poll)
  onAfterPoll(async (_chainData, bc) => {
    try {
      const result = await syncInbox();
      if (result.newCount > 0) {
        addLog('start', `[inbox-sync] ${result.newCount} new message(s)`);
        bc({ event: 'inbox-synced', data: result });
        // Feed new messages to auto-converse
        await processNewMessages(result);
      }
    } catch (err) {
      // Inbox sync is non-critical — log and continue
      console.error('[inbox-sync] Error:', err.message);
    }
  });

  if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to another value and restart.`);
  } else {
    console.error('Dashboard server failed to start:', err);
  }
  process.exit(1);
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('\nShutting down Agent 27 Dashboard...');
  addLog('stop', 'Dashboard shutdown requested.');
  stopWatcher();
  stopChainPoller();
  stopHeartbeatPoller();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  addLog('error', `Uncaught exception: ${err.message}`);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  addLog('error', `Unhandled rejection: ${reason}`);
});
