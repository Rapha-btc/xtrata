#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  AnchorMode,
  FungibleConditionCode,
  PostConditionMode,
  bufferCV,
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToJSON,
  listCV,
  makeStandardSTXPostCondition,
  makeUnsignedContractCall,
  stringAsciiCV,
  uintCV
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const CHUNK_SIZE = 16_384;
const HELPER_LIMIT = 30;
const CORE_CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CORE_CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const DEFAULT_SENDER = 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ';
const ESTIMATE_PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

function usage() {
  console.error(
    'Usage: node skills/xtrata-release-plan/scripts/xtrata-release-preflight.cjs <bundle-root> [--offline] [--no-dedupe] [--out <file>]'
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { bundleRoot: null, offline: false, dedupe: true, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!args.bundleRoot && !arg.startsWith('--')) {
      args.bundleRoot = path.resolve(arg);
      continue;
    }
    if (arg === '--offline') {
      args.offline = true;
      continue;
    }
    if (arg === '--no-dedupe') {
      args.dedupe = false;
      continue;
    }
    if (arg === '--out') {
      args.out = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }
    usage();
  }
  if (!args.bundleRoot) usage();
  return args;
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function fileMetrics(absPath) {
  const buf = fs.readFileSync(absPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const bytes = buf.length;
  const chunks = bytes === 0 ? 0 : Math.ceil(bytes / CHUNK_SIZE);
  const route = chunks <= HELPER_LIMIT ? 'helper' : 'staged';
  return { sha256, bytes, chunks, route };
}

function resolveBundlePath(bundleRoot, recordPath) {
  return path.join(bundleRoot, recordPath.replace(/^on-chain-modules\//, ''));
}

function chunkBuffer(buf) {
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    chunks.push(buf.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function collectCatalogTemplateInfo(bundleRoot) {
  const catalogRoot = path.join(bundleRoot, 'catalogs');
  const out = new Map();

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const raw = fs.readFileSync(abs, 'utf8');
      const rel = path.relative(bundleRoot, abs).split(path.sep).join(path.posix.sep);
      const nullTokenIds = entry.name.endsWith('.json')
        ? (raw.match(/"token_id"\s*:\s*null/g) || []).length
        : 0;
      const catalogRefs = entry.name.endsWith('.json')
        ? [...raw.matchAll(/"([a-z_]+_catalog)"\s*:\s*"([^"]+)"/g)].map((m) => ({
            field: m[1],
            value: m[2]
          }))
        : [];
      out.set(`on-chain-modules/${rel}`, {
        relativePath: rel,
        nullTokenIds,
        catalogRefs,
        helperHeadroomBytes: CHUNK_SIZE - Buffer.byteLength(raw)
      });
    }
  }

  walk(catalogRoot);
  return out;
}

function verifyModuleIndex(bundleRoot, moduleIndex) {
  const mismatches = [];
  let totalBytes = 0;
  const routeCounts = { helper: 0, staged: 0 };

  for (const record of moduleIndex) {
    const absPath = resolveBundlePath(bundleRoot, record.bundle_path);
    if (!fs.existsSync(absPath)) {
      mismatches.push({ name: record.name, type: 'missing-file', path: absPath });
      continue;
    }
    const stats = fileMetrics(absPath);
    totalBytes += stats.bytes;
    routeCounts[stats.route] = (routeCounts[stats.route] || 0) + 1;
    if (stats.sha256 !== record.expected_sha256) {
      mismatches.push({ name: record.name, type: 'sha256', expected: record.expected_sha256, actual: stats.sha256 });
    }
    if (stats.bytes !== record.bytes) {
      mismatches.push({ name: record.name, type: 'bytes', expected: record.bytes, actual: stats.bytes });
    }
    if (stats.chunks !== record.chunks) {
      mismatches.push({ name: record.name, type: 'chunks', expected: record.chunks, actual: stats.chunks });
    }
    if (stats.route !== record.route) {
      mismatches.push({ name: record.name, type: 'route', expected: record.route, actual: stats.route });
    }
  }

  return { totalBytes, routeCounts, mismatches };
}

function verifyTokenTemplate(bundleRoot, moduleIndex) {
  const tokenMap = readJson(path.join(bundleRoot, 'configs', 'token-map.template.json'));
  const names = Object.keys(tokenMap.entries || {});
  const missing = moduleIndex.filter((record) => !(record.name in tokenMap.entries)).map((record) => record.name);
  return { tokenMap, entryCount: names.length, missing };
}

function loadOrderedBatchFiles(bundleRoot) {
  return fs.readdirSync(path.join(bundleRoot, 'batches'))
    .filter((file) => file.endsWith('.json') && file !== '99-master-release.batch.json')
    .sort();
}

function loadExecutionPlan(bundleRoot, moduleIndex, catalogInfo) {
  const byName = new Map(moduleIndex.map((item) => [item.name, item]));
  const steps = [];
  const minted = new Set();
  const unresolved = [];
  const batchSummaries = [];
  const batchFiles = loadOrderedBatchFiles(bundleRoot);

  for (const file of batchFiles) {
    const batchPath = path.join(bundleRoot, 'batches', file);
    const batch = readJson(batchPath);
    let batchBytes = 0;
    for (const artifact of batch.artifacts || []) {
      const record = byName.get(artifact.name);
      const template = catalogInfo.get(record.bundle_path);
      const needsRenderedCopy = record.kind === 'catalog';
      const missingDeps = (artifact.depends_on || []).filter((dep) => !minted.has(dep));
      if (missingDeps.length) {
        unresolved.push({ batch: file, name: artifact.name, missing: missingDeps });
      }
      const step = {
        batch: file,
        release: batch.release_name,
        order: artifact.order,
        name: artifact.name,
        kind: record.kind,
        route: artifact.route,
        bytes: artifact.bytes,
        chunks: artifact.chunks,
        bundlePath: artifact.path,
        dependsOn: artifact.depends_on || [],
        needsRenderedCopy,
        template: needsRenderedCopy
          ? {
              nullTokenIds: template ? template.nullTokenIds : 0,
              catalogRefs: template ? template.catalogRefs : [],
              helperHeadroomBytes: template ? template.helperHeadroomBytes : null
            }
          : null
      };
      steps.push(step);
      batchBytes += artifact.bytes;
      minted.add(artifact.name);
    }
    batchSummaries.push({
      file,
      release: batch.release_name,
      artifactCount: batch.artifacts.length,
      bytes: batchBytes
    });
  }

  return { steps, unresolved, batchSummaries };
}

function protocolFeeForChunks(chunks, feeUnitMicroStx) {
  const begin = feeUnitMicroStx;
  const seal = feeUnitMicroStx * (1n + ((BigInt(chunks) + 49n) / 50n));
  return begin + seal;
}

function roughUsdForBytes(bytes) {
  return bytes / 1_000_000;
}

async function getTransferFeeRate(network) {
  const response = await network.fetchFn(network.getTransferFeeEstimateApiUrl(), {
    method: 'GET',
    headers: { Accept: 'application/text' }
  });
  if (!response.ok) {
    throw new Error(`Transfer fee-rate fetch failed: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return BigInt(text.trim());
}

async function buildHelperEstimate(step, bundleRoot, feeUnitMicroStx, network) {
  const absPath = resolveBundlePath(bundleRoot, step.bundlePath);
  const buf = fs.readFileSync(absPath);
  const chunks = chunkBuffer(buf);
  const dependencyIds = (step.dependsOn || []).map((_, index) => BigInt(index + 1));
  const tokenUri = step.bundlePath.slice(0, 256);
  const protocolFee = protocolFeeForChunks(step.chunks, feeUnitMicroStx);
  const isRecursive = dependencyIds.length > 0;
  const functionArgs = [
    contractPrincipalCV(CORE_CONTRACT_ADDRESS, CORE_CONTRACT_NAME),
    bufferCV(Buffer.from('00'.repeat(32), 'hex')),
    stringAsciiCV(step.mimeType),
    uintCV(BigInt(buf.length)),
    listCV(chunks.map((chunk) => bufferCV(chunk))),
    stringAsciiCV(tokenUri),
    ...(isRecursive ? [listCV(dependencyIds.map((id) => uintCV(id)))] : [])
  ];

  const tx = await makeUnsignedContractCall({
    publicKey: ESTIMATE_PUBLIC_KEY,
    contractAddress: CORE_CONTRACT_ADDRESS,
    contractName: HELPER_CONTRACT_NAME,
    functionName: isRecursive ? 'mint-small-single-tx-recursive' : 'mint-small-single-tx',
    functionArgs,
    network,
    fee: 0n,
    nonce: 0n,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      makeStandardSTXPostCondition(DEFAULT_SENDER, FungibleConditionCode.LessEqual, protocolFee)
    ]
  });

  return {
    estimatedLen: tx.serialize().byteLength,
    tokenUriBytes: Buffer.byteLength(tokenUri),
    dependencyCount: dependencyIds.length
  };
}

async function estimateMiningFees(bundleRoot, steps, feeUnitMicroStx) {
  const network = new StacksMainnet();
  const roughBytes = steps.reduce((sum, step) => sum + step.bytes, 0);
  const roughUsd = roughUsdForBytes(roughBytes);
  const estimateable = steps.filter((step) => step.route === 'helper');
  const skipped = steps.filter((step) => step.route !== 'helper').map((step) => step.name);

  const rough = {
    model: 'usd-per-mb',
    basis: '$1 per MB using decimal MB (1,000,000 bytes)',
    bytes: roughBytes,
    megabytes: roughBytes / 1_000_000,
    estimatedUsd: Number(roughUsd.toFixed(6))
  };

  try {
    const transferFeeRate = await getTransferFeeRate(network);
    let totalSerializedBytes = 0;
    let maxDependencyCount = 0;
    let maxTokenUriBytes = 0;

    for (const step of estimateable) {
      const estimate = await buildHelperEstimate(step, bundleRoot, feeUnitMicroStx, network);
      totalSerializedBytes += estimate.estimatedLen;
      if (estimate.dependencyCount > maxDependencyCount) {
        maxDependencyCount = estimate.dependencyCount;
      }
      if (estimate.tokenUriBytes > maxTokenUriBytes) {
        maxTokenUriBytes = estimate.tokenUriBytes;
      }
    }

    const transferRateEstimate = transferFeeRate * BigInt(totalSerializedBytes);
    return {
      rough,
      live: {
        available: true,
        model: 'unsigned-helper-contract-call',
        source: '/v2/fees/transfer',
        assumptions: {
          tokenUriStrategy: 'bundlePath',
          dummyDependencyIds: true,
          postConditionIncluded: true,
          estimatedArtifactCount: estimateable.length,
          maxDependencyCount,
          maxTokenUriBytes,
          skippedArtifacts: skipped
        },
        serializedBytesTotal: totalSerializedBytes,
        transferFeeRateMicroStxPerByte: transferFeeRate.toString(),
        estimatedMicroStx: transferRateEstimate.toString(),
        estimatedStx: Number(transferRateEstimate) / 1e6,
        note: 'Live mining-fee estimate uses the current transfer fee-rate endpoint multiplied by accurately serialized unsigned helper transactions.'
      }
    };
  } catch (err) {
    return {
      rough,
      live: {
        available: false,
        error: err.message || String(err),
        note: 'Live mining-fee estimation failed; use the rough size-based estimate.'
      }
    };
  }
}

function summarizeRenderRequirements(steps) {
  const catalogs = steps.filter((step) => step.needsRenderedCopy);
  return {
    count: catalogs.length,
    allRemainHelperEligible: catalogs.every((step) => step.template && step.template.helperHeadroomBytes > 1000),
    catalogs: catalogs.map((step) => ({
      name: step.name,
      batch: step.batch,
      bundlePath: step.bundlePath,
      nullTokenIds: step.template.nullTokenIds,
      catalogRefs: step.template.catalogRefs,
      helperHeadroomBytes: step.template.helperHeadroomBytes
    }))
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callReadOnly(functionName, functionArgs = []) {
  const network = new StacksMainnet();
  const result = await callReadOnlyFunction({
    contractAddress: CORE_CONTRACT_ADDRESS,
    contractName: CORE_CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: DEFAULT_SENDER,
    network
  });
  return cvToJSON(result);
}

async function getLiveChainState() {
  const feeJson = await callReadOnly('get-fee-unit');
  const lastJson = await callReadOnly('get-last-token-id');
  const feeUnit = feeJson?.value ? BigInt(feeJson.value.value) : null;
  const lastTokenId = lastJson?.value ? Number(lastJson.value.value) : null;
  return {
    feeUnitMicroStx: feeUnit,
    lastTokenId,
    coreContractId: `${CORE_CONTRACT_ADDRESS}.${CORE_CONTRACT_NAME}`
  };
}

async function getIdByHash(expectedHashHex, attempt = 1) {
  try {
    const json = await callReadOnly('get-id-by-hash', [bufferCV(Buffer.from(expectedHashHex, 'hex'))]);
    return json?.value ? Number(json.value.value) : null;
  } catch (err) {
    const msg = String(err && (err.stack || err.message || err));
    if ((msg.includes('429') || msg.includes('rate limit')) && attempt <= 5) {
      await sleep(30000);
      return getIdByHash(expectedHashHex, attempt + 1);
    }
    throw err;
  }
}

async function dedupeModuleIndex(moduleIndex) {
  const duplicates = [];
  for (const record of moduleIndex) {
    const tokenId = await getIdByHash(record.expected_sha256);
    if (tokenId !== null) {
      duplicates.push({ name: record.name, tokenId });
    }
    await sleep(800);
  }
  return duplicates;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const moduleIndexPath = path.join(args.bundleRoot, 'verification', 'module-index.json');

  if (!fs.existsSync(moduleIndexPath)) {
    throw new Error(`Missing module index at ${moduleIndexPath}`);
  }

  const moduleIndex = readJson(moduleIndexPath);
  const verify = verifyModuleIndex(args.bundleRoot, moduleIndex);
  const tokenTemplate = verifyTokenTemplate(args.bundleRoot, moduleIndex);
  const catalogInfo = collectCatalogTemplateInfo(args.bundleRoot);
  const execution = loadExecutionPlan(args.bundleRoot, moduleIndex, catalogInfo);
  const renderSummary = summarizeRenderRequirements(execution.steps);

  const result = {
    bundleRoot: args.bundleRoot,
    verifiedAt: new Date().toISOString(),
    verification: {
      moduleCount: moduleIndex.length,
      totalBytes: verify.totalBytes,
      routeCounts: verify.routeCounts,
      mismatchCount: verify.mismatches.length,
      mismatches: verify.mismatches,
      tokenTemplateEntryCount: tokenTemplate.entryCount,
      tokenTemplateMissing: tokenTemplate.missing
    },
    execution: {
      orderedBatches: execution.batchSummaries,
      unresolvedDependenciesInBatchOrder: execution.unresolved,
      steps: execution.steps
    },
    renderSummary,
    quote: {
      live: false,
      feeUnitMicroStx: null,
      feeUnitStx: null,
      protocolFeeMicroStx: null,
      protocolFeeStx: null,
      miningFee: {
        rough: {
          model: 'usd-per-mb',
          basis: '$1 per MB using decimal MB (1,000,000 bytes)',
          bytes: verify.totalBytes,
          megabytes: verify.totalBytes / 1_000_000,
          estimatedUsd: Number(roughUsdForBytes(verify.totalBytes).toFixed(6))
        },
        live: {
          available: false,
          note: 'Offline mode. Live mining-fee estimation requires network access.'
        }
      },
      mintCountAfterDedupe: moduleIndex.length,
      duplicateCount: null,
      predictedTokenRange: null,
      note:
        'Offline mode. Protocol fee requires live get-fee-unit. Rough mining-fee estimate is based on total bytes at $1 per MB.'
    }
  };

  if (!args.offline) {
    const live = await getLiveChainState();
    const duplicates = args.dedupe ? await dedupeModuleIndex(moduleIndex) : [];
    const duplicateNames = new Set(duplicates.map((item) => item.name));
    const toMint = execution.steps.filter((step) => !duplicateNames.has(step.name));
    const protocolFeeMicroStx = toMint.reduce(
      (sum, step) => sum + protocolFeeForChunks(step.chunks, live.feeUnitMicroStx),
      0n
    );
    const miningFee = await estimateMiningFees(args.bundleRoot, toMint.map((step) => ({
      ...step,
      mimeType: moduleIndex.find((record) => record.name === step.name)?.mime_type || 'application/octet-stream'
    })), live.feeUnitMicroStx);
    const predictedStart = live.lastTokenId + 1;
    const predictedEnd = live.lastTokenId + toMint.length;

    result.quote = {
      live: true,
      feeUnitMicroStx: live.feeUnitMicroStx.toString(),
      feeUnitStx: Number(live.feeUnitMicroStx) / 1e6,
      protocolFeeMicroStx: protocolFeeMicroStx.toString(),
      protocolFeeStx: Number(protocolFeeMicroStx) / 1e6,
      mintCountAfterDedupe: toMint.length,
      duplicateCount: duplicates.length,
      duplicates,
      lastTokenId: live.lastTokenId,
      predictedTokenRange: toMint.length > 0 ? { start: predictedStart, end: predictedEnd } : null,
      miningFee,
      note:
        'Protocol fee is exact for this bundle because every artifact remains under 50 chunks and every catalog template is well below the next chunk boundary. Mining-fee output includes a live transaction-estimate model plus a size-based rough fallback.'
    };
  }

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, output);
  }
  process.stdout.write(output);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
