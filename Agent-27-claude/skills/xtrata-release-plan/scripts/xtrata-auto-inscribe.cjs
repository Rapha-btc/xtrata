#!/usr/bin/env node

try {
  require('dotenv').config();
} catch {
  // dotenv is optional; use process env directly when unavailable.
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
  AnchorMode,
  FungibleConditionCode,
  PostConditionMode,
  bufferCV,
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToJSON,
  getAddressFromPrivateKey,
  getNonce,
  hexToCV,
  listCV,
  makeContractCall,
  makeStandardSTXPostCondition,
  stringAsciiCV,
  TransactionVersion,
  uintCV,
  broadcastTransaction
} = require('@stacks/transactions');
const { StacksMainnet, StacksTestnet } = require('@stacks/network');
const { getAgent27SignerSource } = require('../../../scripts/agent27-signer.cjs');

const execFileAsync = promisify(execFile);

const CHUNK_SIZE = 16_384;
const HELPER_LIMIT = 30;
const MAX_POLLS = 90;
const POLL_INTERVAL_MS = 10_000;
const READ_ONLY_MAX_ATTEMPTS = 5;
const FEE_MARGIN_NUMERATOR = 115n;
const FEE_MARGIN_DENOMINATOR = 100n;
const FALLBACK_TX_FEE = 250_000n;

function usage() {
  throw new Error(
    'Usage: node skills/xtrata-release-plan/scripts/xtrata-auto-inscribe.cjs <bundle-root> [--run-log <path>] [--status-out <path>] [--event-log <path>] [--chain-log <path>] [--failure-snapshot <path>] [--max-items <count>]'
  );
}

function parseArgs(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    usage();
  }

  const args = {
    bundleRoot: path.resolve(argv[0]),
    runLogPath: null,
    statusOutPath: null,
    eventLogPath: null,
    chainLogPath: null,
    failureSnapshotPath: null,
    testMode: null,
    testFailStage: null,
    maxItems: null
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      usage();
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      usage();
    }
    if (key === 'run-log') {
      args.runLogPath = path.resolve(value);
    } else if (key === 'status-out') {
      args.statusOutPath = path.resolve(value);
    } else if (key === 'event-log') {
      args.eventLogPath = path.resolve(value);
    } else if (key === 'chain-log') {
      args.chainLogPath = path.resolve(value);
    } else if (key === 'failure-snapshot') {
      args.failureSnapshotPath = path.resolve(value);
    } else if (key === 'test-mode') {
      args.testMode = value;
    } else if (key === 'test-fail-stage') {
      args.testFailStage = value;
    } else if (key === 'max-items') {
      args.maxItems = Number(value);
    } else {
      usage();
    }
    index += 1;
  }

  if (args.maxItems !== null && (!Number.isFinite(args.maxItems) || args.maxItems <= 0)) {
    throw new Error(`Invalid --max-items value: ${args.maxItems}`);
  }

  if (args.maxItems === null) {
    args.maxItems = Number.POSITIVE_INFINITY;
  }

  if (!args.runLogPath) {
    args.runLogPath = path.join(args.bundleRoot, 'verification', 'auto-inscribe-run.json');
  }
  if (!args.statusOutPath) {
    args.statusOutPath = path.join(args.bundleRoot, 'verification', 'inscription-status.json');
  }
  if (!args.eventLogPath) {
    args.eventLogPath = path.join(args.bundleRoot, 'verification', 'auto-inscribe-events.jsonl');
  }
  if (!args.chainLogPath) {
    args.chainLogPath = path.join(args.bundleRoot, 'verification', 'auto-inscribe-chain.jsonl');
  }
  if (!args.failureSnapshotPath) {
    args.failureSnapshotPath = path.join(args.bundleRoot, 'verification', 'auto-inscribe-failure.json');
  }

  return args;
}

function log(line) {
  console.log(line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferNetworkNameFromAddress(address) {
  if (address.startsWith('SP') || address.startsWith('SM')) return 'mainnet';
  if (address.startsWith('ST') || address.startsWith('SN')) return 'testnet';
  return 'unknown';
}

function resolveSignerSource(context = null) {
  if (isLocalDryRun(context) || process.env.XTRATA_AUTO_INSCRIBE_TEST_MODE === 'local-dry-run') {
    return {
      type: 'local-dry-run',
      senderKey: `${'11'.repeat(32)}01`
    };
  }
  const signerSource = getAgent27SignerSource();
  if (!signerSource?.senderKey) {
    throw new Error('No usable Agent 27 signer source is available for automated inscription.');
  }
  return signerSource;
}

function deriveSenderKey(context = null) {
  return resolveSignerSource(context).senderKey;
}

function parseContractId(value, label) {
  if (typeof value !== 'string' || !value.includes('.')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  const [address, contractName] = value.split('.');
  if (!address || !contractName) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return { address, contractName };
}

function normalizeNetworkName(value) {
  if (value === 'mainnet' || value === 'stacks-mainnet') return 'mainnet';
  if (value === 'testnet' || value === 'stacks-testnet') return 'testnet';
  throw new Error(`Unsupported network in bundle config: ${value}`);
}

function isLocalDryRun(context) {
  return context?.testMode === 'local-dry-run';
}

function maybeFailAtStage(context, stage, payload = {}) {
  if (context?.testFailStage !== stage) return;
  emitTraceEvent(context, 'test-fail', `Intentional test failure at ${stage}`, payload);
  throw new Error(`Intentional test failure at ${stage}.`);
}

function resolveNetwork(networkName) {
  if (networkName === 'mainnet') {
    return {
      txVersion: TransactionVersion.Mainnet,
      network: new StacksMainnet()
    };
  }
  if (networkName === 'testnet') {
    return {
      txVersion: TransactionVersion.Testnet,
      network: new StacksTestnet()
    };
  }
  throw new Error(`Unsupported network in bundle config: ${networkName}`);
}

function chunkBuffer(buf) {
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    chunks.push(buf.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function computeContentHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizeHexString(value) {
  if (typeof value !== 'string') return value;
  return value.startsWith('0x') ? value.slice(2) : value;
}

function protocolFeeForChunks(chunks, feeUnit) {
  return feeUnit + (feeUnit * (1n + ((BigInt(chunks) + 49n) / 50n)));
}

function ceilMulDiv(value, numerator, denominator) {
  return (value * numerator + (denominator - 1n)) / denominator;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function writeJson(absPath, value) {
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toSerializable(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map((entry) => toSerializable(entry));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue;
    out[key] = toSerializable(entry);
  }
  return out;
}

function appendJsonLine(absPath, value) {
  ensureDir(path.dirname(absPath));
  fs.appendFileSync(absPath, `${JSON.stringify(toSerializable(value))}\n`, 'utf8');
}

function initializeTraceFiles(args) {
  const trace = {
    runId: `run-${new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}`,
    eventLogPath: args.eventLogPath,
    chainLogPath: args.chainLogPath,
    failureSnapshotPath: args.failureSnapshotPath,
    eventCount: 0,
    chainCount: 0
  };
  for (const absPath of [trace.eventLogPath, trace.chainLogPath]) {
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, '', 'utf8');
  }
  if (fs.existsSync(trace.failureSnapshotPath)) {
    fs.rmSync(trace.failureSnapshotPath, { force: true });
  }
  return trace;
}

function emitTraceEvent(context, type, summary, payload = {}) {
  if (!context?.trace) return;
  const event = {
    run_id: context.trace.runId,
    at: new Date().toISOString(),
    type,
    summary,
    artifact: payload.artifact || context.currentArtifact || null,
    payload
  };
  appendJsonLine(context.trace.eventLogPath, event);
  context.trace.eventCount += 1;
}

function recordChainObservation(context, type, summary, payload = {}) {
  if (!context?.trace) return;
  const observation = {
    run_id: context.trace.runId,
    at: new Date().toISOString(),
    type,
    summary,
    artifact: payload.artifact || context.currentArtifact || null,
    payload
  };
  appendJsonLine(context.trace.chainLogPath, observation);
  context.trace.chainCount += 1;
}

function fileSnapshot(absPath) {
  if (!absPath || !fs.existsSync(absPath)) {
    return {
      path: absPath || null,
      exists: false
    };
  }
  const stats = fs.statSync(absPath);
  const buf = fs.readFileSync(absPath);
  return {
    path: absPath,
    exists: true,
    bytes: buf.length,
    sha256: sha256Hex(buf),
    updated_at: stats.mtime.toISOString()
  };
}

function readJsonLinesTail(absPath, limit = 20) {
  if (!absPath || !fs.existsSync(absPath)) return [];
  const lines = fs.readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

function countJsonLines(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return 0;
  return fs.readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .length;
}

function writeFailureSnapshot(args, context, runState, error) {
  const snapshot = {
    generated_at: new Date().toISOString(),
    run_id: context?.trace?.runId || null,
    bundle_root: args.bundleRoot,
    error: {
      message: error?.message || String(error),
      stack: error?.stack || null
    },
    current_artifact: context?.currentArtifact || null,
    run_status: runState?.status || 'failed',
    run_summary: runState?.summary || null,
    debug_paths: {
      run_log: args.runLogPath,
      event_log: args.eventLogPath,
      chain_log: args.chainLogPath,
      failure_snapshot: args.failureSnapshotPath,
      status: args.statusOutPath
    },
    state_files: {
      run_log: fileSnapshot(args.runLogPath),
      event_log: fileSnapshot(args.eventLogPath),
      chain_log: fileSnapshot(args.chainLogPath),
      status: fileSnapshot(args.statusOutPath),
      token_map: fileSnapshot(path.join(args.bundleRoot, 'configs', 'token-map.runtime.json')),
      rendered_index: fileSnapshot(path.join(args.bundleRoot, 'verification', 'rendered-index.json')),
      inscription_log: fileSnapshot(path.join(args.bundleRoot, 'verification', 'inscription-log.json'))
    },
    recent_events: readJsonLinesTail(args.eventLogPath, 20),
    recent_chain_observations: readJsonLinesTail(args.chainLogPath, 20),
    last_entry: runState?.entries?.length ? runState.entries[runState.entries.length - 1] : null
  };
  writeJson(args.failureSnapshotPath, snapshot);
}

async function runNodeScript(scriptPath, args, options = {}) {
  return execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env }
  });
}

async function initializeRuntimeState(bundleRoot) {
  await runNodeScript(
    'TASKS/BVST-on-chain-framework/scripts/init-inscription-state.mjs',
    [],
    {
      cwd: path.resolve(__dirname, '../../..'),
      env: { XTRATA_BUNDLE_ROOT: bundleRoot }
    }
  );
}

async function rebuildStatus(bundleRoot, statusOutPath) {
  await runNodeScript(
    'TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs',
    ['--out', statusOutPath],
    {
      cwd: path.resolve(__dirname, '../../..'),
      env: { XTRATA_BUNDLE_ROOT: bundleRoot }
    }
  );
  return readJson(statusOutPath);
}

async function applyInscriptionResult(bundleRoot, name, tokenId, txid, blockHeight) {
  await runNodeScript(
    'TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs',
    ['--name', name, '--token-id', String(tokenId), '--txid', txid, '--block-height', String(blockHeight)],
    {
      cwd: path.resolve(__dirname, '../../..'),
      env: { XTRATA_BUNDLE_ROOT: bundleRoot }
    }
  );
}

function parseOptionalUint(json) {
  if (!json || !json.value || json.value.type !== 'uint') return null;
  return BigInt(json.value.value);
}

function parseResponseBool(json) {
  if (!json || json.success !== true || !json.value) return null;
  if (json.value.type !== 'bool') return null;
  return Boolean(json.value.value);
}

function parseOptionalStringResponse(json) {
  if (!json || json.success !== true || !json.value || !json.value.value) return null;
  const optional = json.value;
  if (optional.value && typeof optional.value.value === 'string') {
    return optional.value.value;
  }
  if (typeof optional.value === 'string') {
    return optional.value;
  }
  return null;
}

function parseOptionalTuple(json) {
  if (!json || !json.value || json.type === 'none') return null;
  return json.value.value || null;
}

function parseHelperTokenId(resultJson) {
  const tokenField = resultJson?.success ? resultJson.value?.value?.['token-id'] : null;
  if (!tokenField) return null;
  if (tokenField.type === 'uint') return BigInt(tokenField.value);
  if (tokenField.value?.type === 'uint') return BigInt(tokenField.value.value);
  return null;
}

function parseHelperExisted(resultJson) {
  return resultJson?.success ? resultJson.value?.value?.existed?.value === true : false;
}

function parseTxResultJson(txData) {
  const hex = txData?.tx_result?.hex || txData?.tx_result_hex;
  return hex ? cvToJSON(hexToCV(hex)) : null;
}

async function readOnly(context, contract, functionName, functionArgs, debugMeta = {}) {
  for (let attempt = 1; attempt <= READ_ONLY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await callReadOnlyFunction({
        contractAddress: contract.address,
        contractName: contract.contractName,
        functionName,
        functionArgs,
        senderAddress: context.senderAddress,
        network: context.network
      });
      const json = cvToJSON(result);
      recordChainObservation(context, 'read-only', `${contract.contractName}.${functionName}`, {
        contract: `${contract.address}.${contract.contractName}`,
        function: functionName,
        meta: {
          ...debugMeta,
          attempt
        },
        response: json
      });
      return json;
    } catch (error) {
      const message = error?.message || String(error);
      const rateLimitMatch = message.match(/try again in (\d+) seconds/i);
      const isRateLimit = message.includes('Response 429') || message.includes('Too Many Requests');
      const isTransient = isRateLimit
        || message.includes('Response 502')
        || message.includes('Response 503')
        || message.includes('Response 504')
        || message.includes('ETIMEDOUT')
        || message.includes('ECONNRESET');
      recordChainObservation(context, 'read-only-error', `${contract.contractName}.${functionName}`, {
        contract: `${contract.address}.${contract.contractName}`,
        function: functionName,
        meta: {
          ...debugMeta,
          attempt
        },
        error: message,
        retryable: isTransient
      });
      if (!isTransient || attempt === READ_ONLY_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = isRateLimit
        ? ((rateLimitMatch ? Number(rateLimitMatch[1]) : 5) * 1000) + 1000
        : 2000 * attempt;
      await sleep(delayMs);
    }
  }
  throw new Error(`Read-only call ${contract.contractName}.${functionName} exhausted retries.`);
}

async function getFeeUnit(context) {
  if (isLocalDryRun(context)) {
    const value = 1000n;
    recordChainObservation(context, 'mock-read-only', 'mock get-fee-unit', {
      value: value.toString()
    });
    return value;
  }
  const json = await readOnly(context, context.coreContract, 'get-fee-unit', [], { label: 'fee-unit' });
  return BigInt(json.value.value);
}

async function getIdByHash(context, expectedHash) {
  if (isLocalDryRun(context)) {
    recordChainObservation(context, 'mock-read-only', 'mock get-id-by-hash', {
      contentHashHex: Buffer.from(expectedHash).toString('hex'),
      value: null
    });
    return null;
  }
  const json = await readOnly(context, context.coreContract, 'get-id-by-hash', [bufferCV(expectedHash)], {
    contentHashHex: Buffer.from(expectedHash).toString('hex')
  });
  return parseOptionalUint(json);
}

async function isPaused(context) {
  if (isLocalDryRun(context)) {
    recordChainObservation(context, 'mock-read-only', 'mock is-paused', {
      value: false
    });
    return false;
  }
  const json = await readOnly(context, context.coreContract, 'is-paused', [], { label: 'pause-state' });
  return parseResponseBool(json);
}

async function getDependencies(context, tokenId) {
  const json = await readOnly(context, context.coreContract, 'get-dependencies', [uintCV(BigInt(tokenId))], {
    tokenId: tokenId.toString()
  });
  return Array.isArray(json?.value)
    ? json.value.map((entry) => BigInt(entry.value))
    : [];
}

async function getTokenUri(context, tokenId) {
  const json = await readOnly(context, context.coreContract, 'get-token-uri', [uintCV(BigInt(tokenId))], {
    tokenId: tokenId.toString()
  });
  return parseOptionalStringResponse(json);
}

async function getInscriptionMeta(context, tokenId) {
  const json = await readOnly(context, context.coreContract, 'get-inscription-meta', [uintCV(BigInt(tokenId))], {
    tokenId: tokenId.toString()
  });
  const tuple = parseOptionalTuple(json);
  if (!tuple) return null;
  return {
    creator: tuple.creator?.value || null,
    mimeType: tuple['mime-type']?.value || null,
    totalSize: tuple['total-size']?.value ? BigInt(tuple['total-size'].value) : null,
    totalChunks: tuple['total-chunks']?.value ? BigInt(tuple['total-chunks'].value) : null,
    sealed: tuple.sealed?.value === true,
    finalHashHex: tuple['final-hash']?.value || null
  };
}

async function getTransferFeeRate(context) {
  if (isLocalDryRun(context)) {
    const value = 31n;
    recordChainObservation(context, 'mock-http', 'mock transfer-fee-rate', {
      value: value.toString()
    });
    return value;
  }
  const response = await fetch(`${context.network.coreApiUrl}/v2/fees/transfer`);
  if (!response.ok) {
    throw new Error(`Transfer fee lookup failed (${response.status})`);
  }
  const body = await response.json();
  recordChainObservation(context, 'http', 'transfer-fee-rate', {
    url: `${context.network.coreApiUrl}/v2/fees/transfer`,
    response: body
  });
  if (body === null || body === undefined || Number.isNaN(Number(body))) {
    throw new Error(`Unexpected transfer fee response: ${JSON.stringify(body)}`);
  }
  return BigInt(body);
}

async function pollTx(context, txid) {
  const url = `${context.network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    const response = await fetch(url);
    if (!response.ok) {
      if ([404, 408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        recordChainObservation(context, 'tx-status-pending-http', `tx ${txid} poll ${poll + 1}`, {
          txid,
          poll: poll + 1,
          status_code: response.status
        });
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      throw new Error(`TX status lookup failed for ${txid} (${response.status})`);
    }
    const txData = await response.json();
    recordChainObservation(context, 'tx-status', `tx ${txid} poll ${poll + 1}`, {
      txid,
      poll: poll + 1,
      status: txData.tx_status,
      block_height: txData.block_height ?? null
    });
    if (txData.tx_status === 'success') {
      return txData;
    }
    if (txData.tx_status === 'abort_by_response' || txData.tx_status === 'abort_by_post_condition') {
      throw new Error(`Transaction ${txid} failed with status ${txData.tx_status}`);
    }
    if (txData.tx_status === 'dropped_replace_by_fee' || txData.tx_status === 'dropped_stale_garbage_collect') {
      throw new Error(`Transaction ${txid} dropped from mempool (${txData.tx_status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Transaction ${txid} did not confirm in time.`);
}

async function broadcastAndConfirm(context, tx, name) {
  const result = await broadcastTransaction(tx, context.network);
  if (result?.error) {
    throw new Error(`${name} broadcast failed: ${result.error} — ${result.reason || 'unknown reason'}`);
  }
  const txid = result.txid || result;
  emitTraceEvent(context, 'tx-broadcast', `Broadcast ${name}`, {
    artifact: name,
    txid
  });
  log(`Broadcast ${name}: ${txid}`);
  const txData = await pollTx(context, txid);
  recordChainObservation(context, 'tx-confirmed', `Transaction ${txid} confirmed`, {
    artifact: name,
    txid,
    block_height: txData.block_height ?? null,
    tx_status: txData.tx_status
  });
  return { txid, txData };
}

function loadBundleContext(bundleRoot) {
  const networkPath = path.join(bundleRoot, 'configs', 'xtrata-network.template.json');
  const networkConfig = readJson(networkPath);
  const coreContractValue = networkConfig.core_contract || networkConfig.xtrata_core_contract;
  const helperContractValue = networkConfig.helper_contract || networkConfig.xtrata_helper_contract;
  const networkName = normalizeNetworkName(networkConfig.network || 'mainnet');
  const coreContract = parseContractId(coreContractValue, 'core_contract');
  const helperContract = parseContractId(helperContractValue, 'helper_contract');
  const moduleIndex = readJson(path.join(bundleRoot, 'verification', 'module-index.json'));
  const safety = fs.existsSync(path.join(bundleRoot, 'verification', 'pre-inscription.report.json'))
    ? readJson(path.join(bundleRoot, 'verification', 'pre-inscription.report.json'))
    : null;
  return {
    networkName,
    coreContract,
    helperContract,
    moduleIndex,
    safety
  };
}

function verifyLocalSource(item) {
  const absPath = item?.source?.absolute_path;
  if (!absPath || !fs.existsSync(absPath)) {
    throw new Error(`Mint source is missing for ${item?.name || 'unknown item'}: ${absPath || 'unknown path'}`);
  }

  const buf = fs.readFileSync(absPath);
  const directSha256 = sha256Hex(buf);
  const chunks = chunkBuffer(buf);
  const contentHash = computeContentHash(chunks);
  const expectedChunks = Number(item?.source?.chunks || 0);
  const expectedBytes = Number(item?.source?.bytes || 0);

  if (item?.source?.sha256 && directSha256 !== item.source.sha256) {
    throw new Error(`Local file hash drift detected for ${item.name}`);
  }
  if (expectedBytes !== buf.length) {
    throw new Error(`Local file size drift detected for ${item.name}`);
  }
  if (expectedChunks !== chunks.length) {
    throw new Error(`Local chunk count drift detected for ${item.name}`);
  }
  if (chunks.length === 0 || chunks.length > HELPER_LIMIT) {
    throw new Error(`Auto-inscribe helper runner only supports helper-eligible artifacts. ${item.name} requires ${chunks.length} chunks.`);
  }

  return {
    buf,
    chunks,
    totalSize: BigInt(buf.length),
    totalChunks: BigInt(chunks.length),
    directSha256,
    contentHash,
    contentHashHex: contentHash.toString('hex')
  };
}

function buildTokenUri(moduleRecord) {
  const tokenUri = moduleRecord?.bundle_path || moduleRecord?.source_repo_path;
  if (!tokenUri) {
    throw new Error(`Missing token-uri source for ${moduleRecord?.name || 'unknown artifact'}`);
  }
  return tokenUri.slice(0, 256);
}

async function estimateTransactionFee(context, buildTx) {
  if (!context.transferFeeRate) {
    return { txFee: FALLBACK_TX_FEE, serializedBytes: null, usedFallback: true };
  }
  const estimateTx = await buildTx(0n);
  const serializedBytes = estimateTx.serialize().byteLength;
  const rawFee = context.transferFeeRate * BigInt(serializedBytes);
  const txFee = ceilMulDiv(rawFee, FEE_MARGIN_NUMERATOR, FEE_MARGIN_DENOMINATOR);
  return { txFee, serializedBytes, usedFallback: false };
}

async function verifyDependenciesExist(context, dependencyIds) {
  for (const dependencyId of dependencyIds) {
    const meta = await getInscriptionMeta(context, dependencyId);
    if (!meta) {
      throw new Error(`Dependency token ${dependencyId.toString()} is not readable on-chain.`);
    }
  }
}

async function verifyMintedArtifact(context, tokenId, expected) {
  const meta = await getInscriptionMeta(context, tokenId);
  if (!meta) {
    throw new Error(`Token ${tokenId.toString()} is not readable after mint.`);
  }
  if (meta.mimeType !== expected.mimeType) {
    throw new Error(`On-chain mime mismatch for token ${tokenId.toString()}: ${meta.mimeType} vs ${expected.mimeType}`);
  }
  if (meta.totalSize !== expected.totalSize) {
    throw new Error(`On-chain size mismatch for token ${tokenId.toString()}.`);
  }
  if (meta.totalChunks !== expected.totalChunks) {
    throw new Error(`On-chain chunk-count mismatch for token ${tokenId.toString()}.`);
  }
  if (!meta.sealed) {
    throw new Error(`Token ${tokenId.toString()} is not sealed on-chain.`);
  }
  if (normalizeHexString(meta.finalHashHex) !== normalizeHexString(expected.contentHashHex)) {
    throw new Error(`On-chain final hash mismatch for token ${tokenId.toString()}.`);
  }

  const dependencyIds = await getDependencies(context, tokenId);
  const actualDependencies = dependencyIds.map((value) => value.toString());
  const expectedDependencies = expected.dependencyIds.map((value) => value.toString());
  if (JSON.stringify(actualDependencies) !== JSON.stringify(expectedDependencies)) {
    throw new Error(`On-chain dependency mismatch for token ${tokenId.toString()}.`);
  }

  const tokenUri = await getTokenUri(context, tokenId);
  if (tokenUri !== expected.tokenUri) {
    throw new Error(`On-chain token-uri mismatch for token ${tokenId.toString()}.`);
  }

  const canonicalId = await getIdByHash(context, expected.contentHash);
  if (canonicalId === null || canonicalId.toString() !== tokenId.toString()) {
    throw new Error(`Canonical hash lookup does not resolve to minted token ${tokenId.toString()}.`);
  }

  return {
    creator: meta.creator,
    mimeType: meta.mimeType,
    totalSize: meta.totalSize.toString(),
    totalChunks: meta.totalChunks.toString(),
    tokenUri,
    dependencyIds: actualDependencies
  };
}

function createRunState(args, context) {
  const now = new Date().toISOString();
  return {
    version: 1,
    bundle_root: args.bundleRoot,
    status: 'running',
    started_at: now,
    updated_at: now,
    finished_at: null,
    network: context.networkName,
    sender_address: context.senderAddress,
    signer_source: context.signerSource || null,
    core_contract: `${context.coreContract.address}.${context.coreContract.contractName}`,
    helper_contract: `${context.helperContract.address}.${context.helperContract.contractName}`,
    test_mode: args.testMode || null,
    test_fail_stage: args.testFailStage || null,
    fee_rate_microstx_per_byte: context.transferFeeRate ? context.transferFeeRate.toString() : null,
    tx_fee_strategy: context.transferFeeRate ? 'live-transfer-fee-rate-plus-15pct' : 'fixed-fallback-250000',
    debug: {
      run_id: context.trace?.runId || null,
      event_log: args.eventLogPath,
      chain_log: args.chainLogPath,
      failure_snapshot: args.failureSnapshotPath,
      events_logged: 0,
      chain_observations_logged: 0
    },
    summary: {
      attempted: 0,
      minted: 0,
      remaining: null
    },
    entries: [],
    errors: []
  };
}

function persistRunState(runLogPath, runState) {
  if (runState?.debug && runState._trace) {
    runState.debug.events_logged = runState._trace.eventCount;
    runState.debug.chain_observations_logged = runState._trace.chainCount;
  }
  runState.updated_at = new Date().toISOString();
  writeJson(runLogPath, runState);
}

async function mintReadyArtifact(context, item, moduleRecord) {
  if (!item?.execution || item.execution.route !== 'helper') {
    throw new Error(`Auto-inscribe helper runner only supports helper items. ${item?.name || 'unknown'} is ${item?.execution?.route || item?.route}.`);
  }

  emitTraceEvent(context, 'mint-start', `Preparing ${item.name}`, {
    artifact: item.name,
    batch: item.batch,
    route: item.execution.route,
    function: item.execution.function,
    dependencies: item.execution.recursive_dependencies || []
  });
  const verified = verifyLocalSource(item);
  emitTraceEvent(context, 'source-verified', `Verified local source for ${item.name}`, {
    artifact: item.name,
    source: {
      path: item.source?.absolute_path || null,
      bytes: verified.buf.length,
      chunks: verified.chunks.length,
      sha256: verified.directSha256,
      content_hash: verified.contentHashHex
    }
  });
  const onChainExisting = await getIdByHash(context, verified.contentHash);
  emitTraceEvent(context, 'dedupe-check', `Checked canonical hash for ${item.name}`, {
    artifact: item.name,
    content_hash: verified.contentHashHex,
    existing_token_id: onChainExisting === null ? null : onChainExisting.toString()
  });
  if (onChainExisting !== null) {
    throw new Error(
      `Artifact ${item.name} already exists on-chain as token ${onChainExisting.toString()}. Automatic provenance adoption is intentionally blocked.`
    );
  }

  await verifyDependenciesExist(context, item.execution.recursive_dependencies || []);
  emitTraceEvent(context, 'dependencies-verified', `Verified recursive dependencies for ${item.name}`, {
    artifact: item.name,
    dependencies: item.execution.recursive_dependencies || []
  });

  const feeUnit = await getFeeUnit(context);
  const protocolFee = protocolFeeForChunks(verified.chunks.length, feeUnit);
  const tokenUri = buildTokenUri(moduleRecord);
  emitTraceEvent(context, 'fee-context', `Loaded fee context for ${item.name}`, {
    artifact: item.name,
    fee_unit_microstx: feeUnit.toString(),
    protocol_fee_microstx: protocolFee.toString(),
    token_uri: tokenUri
  });
  const buildTx = async (fee) =>
    makeContractCall({
      contractAddress: context.helperContract.address,
      contractName: context.helperContract.contractName,
      functionName: item.execution.function,
      functionArgs: [
        contractPrincipalCV(context.coreContract.address, context.coreContract.contractName),
        bufferCV(verified.contentHash),
        stringAsciiCV(item.mime),
        uintCV(verified.totalSize),
        listCV(verified.chunks.map((chunk) => bufferCV(chunk))),
        stringAsciiCV(tokenUri),
        ...(item.execution.recursive_dependencies?.length
          ? [listCV(item.execution.recursive_dependencies.map((id) => uintCV(BigInt(id))))]
          : [])
      ],
      senderKey: context.senderKey,
      network: context.network,
      nonce: isLocalDryRun(context) ? 0n : await getNonce(context.senderAddress, context.network),
      fee,
      postConditions: [
        makeStandardSTXPostCondition(
          context.senderAddress,
          FungibleConditionCode.LessEqual,
          protocolFee
        )
      ],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });

  const feeEstimate = await estimateTransactionFee(context, buildTx);
  emitTraceEvent(context, 'tx-estimated', `Estimated helper transaction for ${item.name}`, {
    artifact: item.name,
    tx_fee_microstx: feeEstimate.txFee.toString(),
    serialized_bytes: feeEstimate.serializedBytes,
    used_fallback_tx_fee: feeEstimate.usedFallback
  });
  maybeFailAtStage(context, 'before-broadcast', {
    artifact: item.name,
    serialized_bytes: feeEstimate.serializedBytes,
    tx_fee_microstx: feeEstimate.txFee.toString()
  });
  const tx = await buildTx(feeEstimate.txFee);
  const { txid, txData } = await broadcastAndConfirm(context, tx, item.name);
  const helperJson = parseTxResultJson(txData);
  const existed = parseHelperExisted(helperJson);
  const tokenId = parseHelperTokenId(helperJson) || await getIdByHash(context, verified.contentHash);
  emitTraceEvent(context, 'helper-result', `Helper returned result for ${item.name}`, {
    artifact: item.name,
    txid,
    block_height: txData.block_height ?? null,
    existed,
    token_id: tokenId === null ? null : tokenId.toString()
  });

  if (tokenId === null) {
    throw new Error(`Minted token ID could not be resolved for ${item.name}.`);
  }
  if (existed) {
    throw new Error(
      `Helper reported existing token reuse for ${item.name}. Automatic provenance adoption is blocked until original mint tx lookup is implemented.`
    );
  }
  if (!Number.isInteger(txData.block_height) || txData.block_height < 0) {
    throw new Error(`Missing block height for confirmed transaction ${txid}.`);
  }

  const verification = await verifyMintedArtifact(context, tokenId, {
    mimeType: item.mime,
    totalSize: verified.totalSize,
    totalChunks: verified.totalChunks,
    contentHash: verified.contentHash,
    contentHashHex: verified.contentHashHex,
    dependencyIds: (item.execution.recursive_dependencies || []).map((value) => BigInt(value)),
    tokenUri
  });
  emitTraceEvent(context, 'mint-verified', `Verified ${item.name} on-chain`, {
    artifact: item.name,
    token_id: tokenId.toString(),
    txid,
    verification
  });
  recordChainObservation(context, 'verification', `Verified token ${tokenId.toString()} on-chain`, {
    artifact: item.name,
    token_id: tokenId.toString(),
    txid,
    verification
  });

  return {
    name: item.name,
    tokenId: tokenId.toString(),
    txid,
    blockHeight: txData.block_height,
    directSha256: verified.directSha256,
    contentHashHex: verified.contentHashHex,
    bytes: verified.buf.length,
    chunks: verified.chunks.length,
    tokenUri,
    feeUnitMicroStx: feeUnit.toString(),
    protocolFeeMicroStx: protocolFee.toString(),
    txFeeMicroStx: feeEstimate.txFee.toString(),
    serializedBytes: feeEstimate.serializedBytes,
    usedFallbackTxFee: feeEstimate.usedFallback,
    verification
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.testMode) {
    process.env.XTRATA_AUTO_INSCRIBE_TEST_MODE = args.testMode;
  }
  const bundleContext = loadBundleContext(args.bundleRoot);
  const senderSource = resolveSignerSource({ testMode: args.testMode || null });
  const senderKey = deriveSenderKey({ testMode: args.testMode || null });
  const { txVersion, network } = resolveNetwork(bundleContext.networkName);
  const senderAddress = getAddressFromPrivateKey(senderKey, txVersion);
  if (inferNetworkNameFromAddress(senderAddress) !== bundleContext.networkName) {
    throw new Error(`Signer address network mismatch: ${senderAddress}`);
  }

  const trace = initializeTraceFiles(args);
  const context = {
    ...bundleContext,
    senderKey,
    senderAddress,
    signerSource: senderSource.type,
    network,
    transferFeeRate: null,
    trace,
    currentArtifact: null,
    testMode: args.testMode || null,
    testFailStage: args.testFailStage || null
  };
  emitTraceEvent(context, 'run-start', `Starting auto-inscribe for ${args.bundleRoot}`, {
    bundle_root: args.bundleRoot,
    network: bundleContext.networkName,
    sender_address: senderAddress,
    signer_source: senderSource.type,
    test_mode: args.testMode || null,
    test_fail_stage: args.testFailStage || null
  });

  try {
    context.transferFeeRate = await getTransferFeeRate(context);
    emitTraceEvent(
      context,
      'fee-rate-loaded',
      isLocalDryRun(context) ? 'Loaded mock transfer fee rate' : 'Loaded live transfer fee rate',
      {
        fee_rate_microstx_per_byte: context.transferFeeRate.toString()
      }
    );
  } catch (err) {
    log(`Transfer fee lookup failed, falling back to fixed tx fee: ${err.message}`);
    emitTraceEvent(context, 'fee-rate-fallback', 'Falling back to fixed tx fee', {
      error: err.message || String(err),
      fallback_tx_fee_microstx: FALLBACK_TX_FEE.toString()
    });
  }

  const runState = createRunState(args, context);
  Object.defineProperty(runState, '_trace', {
    value: trace,
    enumerable: false,
    configurable: true
  });
  persistRunState(args.runLogPath, runState);

  if (context.safety?.summary?.failed > 0) {
    emitTraceEvent(context, 'safety-failed', 'Safety report has failed checks', {
      summary: context.safety.summary
    });
    throw new Error('Pre-inscription safety report contains failed checks. Resolve them before auto-inscribing.');
  }
  emitTraceEvent(context, 'safety-passed', 'Safety report is clear for auto-inscription', {
    summary: context.safety?.summary || null
  });

  const paused = await isPaused(context);
  if (paused) {
    emitTraceEvent(context, 'paused', 'Xtrata writes are paused on-chain');
    throw new Error('Xtrata writes are currently paused on-chain.');
  }
  emitTraceEvent(
    context,
    'pause-check',
    isLocalDryRun(context) ? 'Mock pause check passed' : 'Xtrata writes are active on-chain'
  );

  await initializeRuntimeState(args.bundleRoot);
  emitTraceEvent(context, 'runtime-init', 'Initialized runtime inscription state');
  let status = await rebuildStatus(args.bundleRoot, args.statusOutPath);
  emitTraceEvent(context, 'status-rebuilt', 'Rebuilt inscription status', {
    summary: status.summary,
    next_ready: status.next_ready
      ? {
          name: status.next_ready.name,
          batch: status.next_ready.batch,
          function: status.next_ready.execution?.function || null
        }
      : null
  });

  if ((status.summary?.hard_stop || 0) > 0) {
    emitTraceEvent(context, 'hard-stop', 'Release contains hard-stop items before minting', {
      summary: status.summary
    });
    throw new Error(`Release has ${status.summary.hard_stop} hard-stop items. Auto-inscribe will not proceed.`);
  }

  const moduleByName = new Map((context.moduleIndex || []).map((record) => [record.name, record]));
  let processed = 0;

  while (status.next_ready && processed < args.maxItems) {
    const item = status.next_ready;
    context.currentArtifact = item.name;
    const moduleRecord = moduleByName.get(item.name);
    if (!moduleRecord) {
      throw new Error(`Missing module-index record for ${item.name}.`);
    }

    const entry = {
      name: item.name,
      batch: item.batch,
      route: item.execution?.route || item.route,
      function: item.execution?.function || null,
      started_at: new Date().toISOString(),
      status: 'running',
      dependencies: item.execution?.recursive_dependencies || [],
      source: {
        path: item.source?.logical_path || null,
        bytes: item.source?.bytes || null,
        chunks: item.source?.chunks || null
      }
    };
    runState.entries.push(entry);
    runState.summary.attempted += 1;
    emitTraceEvent(context, 'item-selected', `Selected ${item.name} for minting`, {
      artifact: item.name,
      batch: item.batch,
      route: entry.route,
      function: entry.function,
      dependencies: entry.dependencies
    });
    persistRunState(args.runLogPath, runState);
    log(`Minting ${item.name} (${entry.function})`);

    try {
      const minted = await mintReadyArtifact(context, item, moduleRecord);
      emitTraceEvent(context, 'apply-result-start', `Applying inscription result for ${item.name}`, {
        artifact: item.name,
        token_id: minted.tokenId,
        txid: minted.txid,
        block_height: minted.blockHeight
      });
      await applyInscriptionResult(args.bundleRoot, item.name, minted.tokenId, minted.txid, minted.blockHeight);
      status = await rebuildStatus(args.bundleRoot, args.statusOutPath);
      emitTraceEvent(context, 'status-rebuilt', `Rebuilt status after ${item.name}`, {
        artifact: item.name,
        summary: status.summary,
        next_ready: status.next_ready
          ? {
              name: status.next_ready.name,
              batch: status.next_ready.batch,
              function: status.next_ready.execution?.function || null
            }
          : null
      });

      entry.status = 'minted';
      entry.finished_at = new Date().toISOString();
      entry.token_id = minted.tokenId;
      entry.txid = minted.txid;
      entry.block_height = minted.blockHeight;
      entry.direct_sha256 = minted.directSha256;
      entry.content_hash = minted.contentHashHex;
      entry.token_uri = minted.tokenUri;
      entry.fee_unit_microstx = minted.feeUnitMicroStx;
      entry.protocol_fee_microstx = minted.protocolFeeMicroStx;
      entry.tx_fee_microstx = minted.txFeeMicroStx;
      entry.serialized_bytes = minted.serializedBytes;
      entry.used_fallback_tx_fee = minted.usedFallbackTxFee;
      entry.on_chain_verification = minted.verification;
      runState.summary.minted += 1;
      runState.summary.remaining = Math.max(0, (status.summary?.total || 0) - (status.summary?.minted || 0));
      persistRunState(args.runLogPath, runState);
      emitTraceEvent(context, 'item-complete', `Recorded ${item.name} as token ${minted.tokenId}`, {
        artifact: item.name,
        token_id: minted.tokenId,
        txid: minted.txid,
        block_height: minted.blockHeight,
        remaining: runState.summary.remaining
      });
      log(`Recorded ${item.name} as token ${minted.tokenId}`);
    } catch (err) {
      entry.status = 'failed';
      entry.finished_at = new Date().toISOString();
      entry.error = err.message || String(err);
      emitTraceEvent(context, 'item-failed', `Failed while minting ${item.name}`, {
        artifact: item.name,
        error: entry.error
      });
      runState.errors.push({
        name: item.name,
        at: entry.finished_at,
        error: entry.error
      });
      persistRunState(args.runLogPath, runState);
      throw err;
    }

    if ((status.summary?.hard_stop || 0) > 0) {
      emitTraceEvent(context, 'hard-stop', `Release entered hard-stop after ${item.name}`, {
        artifact: item.name,
        summary: status.summary
      });
      throw new Error(`Release entered hard-stop state after minting ${item.name}.`);
    }
    processed += 1;
  }

  runState.summary.remaining = Math.max(0, (status.summary?.total || 0) - (status.summary?.minted || 0));
  runState.status = status.summary?.minted === status.summary?.total ? 'completed' : 'stopped';
  runState.finished_at = new Date().toISOString();
  emitTraceEvent(context, 'run-complete', `Auto-inscribe ${runState.status}`, {
    summary: runState.summary,
    minted_total: status.summary?.minted || 0,
    total: status.summary?.total || 0
  });
  persistRunState(args.runLogPath, runState);
  log(`Auto-inscribe ${runState.status}: ${status.summary?.minted || 0}/${status.summary?.total || 0} minted.`);
}

main().catch((err) => {
  const argv = process.argv.slice(2);
  let parsed = null;
  try {
    if (argv.length > 0) {
      parsed = parseArgs(argv);
    }
  } catch {
    // ignore secondary parse errors
  }
  if (parsed?.runLogPath && fs.existsSync(parsed.runLogPath)) {
    const state = readJson(parsed.runLogPath);
    state.status = 'failed';
    state.finished_at = new Date().toISOString();
    state.updated_at = state.finished_at;
    state.errors = state.errors || [];
    state.errors.push({
      at: state.finished_at,
      error: err.message || String(err)
    });
    writeJson(parsed.runLogPath, state);
    const traceContext = {
      trace: {
        runId: state.debug?.run_id || null,
        eventLogPath: parsed.eventLogPath,
        chainLogPath: parsed.chainLogPath,
        failureSnapshotPath: parsed.failureSnapshotPath,
        eventCount: countJsonLines(parsed.eventLogPath),
        chainCount: countJsonLines(parsed.chainLogPath)
      },
      currentArtifact: state.entries?.length ? state.entries[state.entries.length - 1].name : null
    };
    emitTraceEvent(traceContext, 'run-failed', 'Auto-inscribe run failed', {
      error: err.message || String(err)
    });
    state.debug = state.debug || {};
    state.debug.events_logged = traceContext.trace.eventCount;
    state.debug.chain_observations_logged = traceContext.trace.chainCount;
    writeJson(parsed.runLogPath, state);
    writeFailureSnapshot(parsed, traceContext, state, err);
  }
  console.error(err.message || String(err));
  process.exitCode = 1;
});
