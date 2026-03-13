#!/usr/bin/env node
/**
 * Xtrata Batch Mint
 *
 * Deterministic batch mint runner for up to 50 non-recursive files.
 *
 * Usage:
 *   SENDER_KEY=<hex-private-key> node skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs ./drop.json
 *
 * Optional:
 *   XTRATA_MNEMONIC="..."      Derive SENDER_KEY from m/44'/5757'/0'/0/0 if SENDER_KEY is not set
 *
 * Manifest schema:
 * {
 *   "mode": "core-batch-seal" | "collection-batch-seal",
 *   "network": "mainnet" | "testnet",
 *   "xtrataContractId": "SP...xtrata-v2-1-0",
 *   "collectionContractId": "SP...xtrata-collection-...",
 *   "items": [
 *     {
 *       "file": "./assets/loot-01.png",
 *       "mimeType": "image/png",
 *       "tokenUri": "ipfs://example-01",
 *       "dependencies": []
 *     }
 *   ]
 * }
 *
 * Notes:
 * - Batch recursive minting is not supported.
 * - Small helper calls are single-item only and are intentionally not used here.
 * - In collection mode, if a duplicate race is detected after reservations are created,
 *   the script aborts before batch seal because reservation cleanup is config-admin only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const {
  AnchorMode,
  FungibleConditionCode,
  PostConditionMode,
  TransactionVersion,
  broadcastTransaction,
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
  principalCV,
  stringAsciiCV,
  tupleCV,
  uintCV,
  validateStacksAddress
} = require('@stacks/transactions');
const { StacksMainnet, StacksTestnet } = require('@stacks/network');

const DEFAULT_XTRATA_CONTRACT_ID = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
const DERIVATION_PATH = "m/44'/5757'/0'/0/0";
const CHUNK_SIZE = 16_384;
const MAX_CHUNKS_PER_UPLOAD = 2_048;
const MAX_CHUNK_BATCH_SIZE = 50;
const MAX_BATCH_ITEMS = 50;
const MAX_MIME_LENGTH = 64;
const MAX_TOKEN_URI_LENGTH = 256;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 60;
const STX_FEE = 250_000n; // 0.25 STX safety cap

function usage() {
  console.error('Usage: SENDER_KEY=<hex> node skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs <manifest.json> [--dry-run]');
  console.error('       node skills/xtrata-batch-mint/scripts/xtrata-batch-mint.cjs --print-template core|collection');
}

function buildTemplate(kind) {
  if (kind === 'core') {
    return {
      mode: 'core-batch-seal',
      network: 'mainnet',
      xtrataContractId: DEFAULT_XTRATA_CONTRACT_ID,
      items: [
        {
          file: './files/loot-01.png',
          mimeType: 'image/png',
          tokenUri: 'ipfs://your-drop/loot-01',
          dependencies: []
        },
        {
          file: './files/loot-02.png',
          mimeType: 'image/png',
          tokenUri: 'ipfs://your-drop/loot-02',
          dependencies: []
        }
      ]
    };
  }
  if (kind === 'collection') {
    return {
      mode: 'collection-batch-seal',
      network: 'mainnet',
      xtrataContractId: DEFAULT_XTRATA_CONTRACT_ID,
      collectionContractId: 'SPYOURADDRESS.xtrata-collection-your-drop',
      items: [
        {
          file: './files/reward-01.png',
          mimeType: 'image/png',
          tokenUri: 'ipfs://your-drop/reward-01',
          dependencies: []
        },
        {
          file: './files/reward-02.png',
          mimeType: 'image/png',
          tokenUri: 'ipfs://your-drop/reward-02',
          dependencies: []
        }
      ]
    };
  }
  throw new Error(`Unknown template kind: ${kind}`);
}

function parseArgs(argv) {
  const args = { manifestPath: null, dryRun: false, printTemplate: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--print-template') {
      const kind = argv[i + 1];
      if (!kind) {
        usage();
        throw new Error('Template kind is required after --print-template.');
      }
      args.printTemplate = kind;
      i += 1;
      continue;
    }
    if (arg.startsWith('--print-template=')) {
      args.printTemplate = arg.split('=', 2)[1];
      continue;
    }
    if (!args.manifestPath) {
      args.manifestPath = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.printTemplate && !args.manifestPath) {
    usage();
    throw new Error('Manifest path is required.');
  }
  return args;
}

function ensureAscii(value, field) {
  if (!/^[\x00-\x7F]*$/.test(value)) {
    throw new Error(`${field} must be ASCII.`);
  }
}

function inferNetworkFromAddress(address) {
  return address.startsWith('ST') || address.startsWith('SN') ? 'testnet' : 'mainnet';
}

function resolveNetwork(networkName) {
  if (networkName === 'mainnet') return new StacksMainnet();
  if (networkName === 'testnet') return new StacksTestnet();
  throw new Error(`Unsupported network: ${networkName}`);
}

function resolveTxVersion(networkName) {
  return networkName === 'testnet' ? TransactionVersion.Testnet : TransactionVersion.Mainnet;
}

function parseContractId(contractId) {
  if (typeof contractId !== 'string' || !contractId.trim()) {
    throw new Error('Contract ID is required.');
  }
  const trimmed = contractId.trim();
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    throw new Error(`Invalid contract ID: ${contractId}`);
  }
  const address = trimmed.slice(0, dotIndex);
  const contractName = trimmed.slice(dotIndex + 1);
  if (!validateStacksAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return {
    address,
    contractName,
    contractId: `${address}.${contractName}`,
    network: inferNetworkFromAddress(address)
  };
}

function chunkBytes(data) {
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    chunks.push(data.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks;
}

function batchChunks(chunks) {
  const batches = [];
  for (let offset = 0; offset < chunks.length; offset += MAX_CHUNK_BATCH_SIZE) {
    batches.push(chunks.slice(offset, offset + MAX_CHUNK_BATCH_SIZE));
  }
  return batches;
}

function computeExpectedHash(chunks) {
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running;
}

function toJsonValue(responseJson) {
  if (!responseJson || responseJson.success === false) return null;
  return responseJson.value;
}

function parseOptional(value) {
  if (!value) return null;
  if (value.type && value.type.startsWith('(optional')) {
    return value.value ?? null;
  }
  return value;
}

function parseUint(value) {
  if (!value) return null;
  if (value.type === 'uint') return BigInt(value.value);
  if (value.value && value.value.type === 'uint') return BigInt(value.value.value);
  return null;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.value)) return value.value;
  return [];
}

function parseUploadState(responseJson) {
  const optional = parseOptional(toJsonValue(responseJson));
  if (!optional) return null;
  const state = optional.value || {};
  return {
    mimeType: state['mime-type']?.value,
    totalSize: BigInt(state['total-size']?.value ?? '0'),
    totalChunks: Number(state['total-chunks']?.value ?? '0'),
    currentIndex: Number(state['current-index']?.value ?? '0')
  };
}

function parseReservation(responseJson) {
  const optional = parseOptional(toJsonValue(responseJson));
  if (!optional) return null;
  const state = optional.value || {};
  return {
    feePaid: state['fee-paid']?.value === true,
    phaseId: BigInt(state['phase-id']?.value ?? '0'),
    mintPrice: BigInt(state['mint-price']?.value ?? '0'),
    createdAt: BigInt(state['created-at']?.value ?? '0')
  };
}

function parsePhase(responseJson) {
  const optional = parseOptional(toJsonValue(responseJson));
  if (!optional) return null;
  const state = optional.value || {};
  return {
    enabled: state.enabled?.value === true,
    mintPrice: BigInt(state['mint-price']?.value ?? '0')
  };
}

function parseBatchSealResult(txData) {
  const txResultHex = txData?.tx_result?.hex || txData?.tx_result_hex;
  if (!txResultHex) {
    throw new Error('Batch seal result hex missing.');
  }
  const json = cvToJSON(hexToCV(txResultHex));
  if (!json.success) {
    throw new Error(`Batch seal failed: ${JSON.stringify(json)}`);
  }
  const tuple = json.value?.value || {};
  return {
    start: BigInt(tuple.start?.value ?? '0'),
    count: BigInt(tuple.count?.value ?? '0')
  };
}

function parseBeginOrGetResult(txData) {
  const txResultHex = txData?.tx_result?.hex || txData?.tx_result_hex;
  if (!txResultHex) return null;
  const json = cvToJSON(hexToCV(txResultHex));
  return parseOptional(json.value);
}

function readManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const manifestDir = path.dirname(absolutePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error('Manifest must contain a non-empty items array.');
  }
  if (manifest.items.length > MAX_BATCH_ITEMS) {
    throw new Error(`Manifest exceeds max batch size (${MAX_BATCH_ITEMS}).`);
  }
  const xtrataContract = parseContractId(manifest.xtrataContractId || DEFAULT_XTRATA_CONTRACT_ID);
  const mode = manifest.mode || (manifest.collectionContractId ? 'collection-batch-seal' : 'core-batch-seal');
  if (!['core-batch-seal', 'collection-batch-seal'].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  const collectionContract =
    mode === 'collection-batch-seal'
      ? parseContractId(manifest.collectionContractId)
      : null;
  const networkName = manifest.network || xtrataContract.network || (collectionContract ? collectionContract.network : null);
  if (!networkName) {
    throw new Error('Could not infer network from manifest contracts.');
  }
  if (xtrataContract.network !== networkName) {
    throw new Error(`xtrataContractId network mismatch: expected ${networkName}, got ${xtrataContract.network}`);
  }
  if (collectionContract && collectionContract.network !== networkName) {
    throw new Error(`collectionContractId network mismatch: expected ${networkName}, got ${collectionContract.network}`);
  }

  const items = manifest.items.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Manifest item ${index + 1} must be an object.`);
    }
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new Error(`Manifest item ${index + 1} file is required.`);
    }
    if (typeof entry.mimeType !== 'string' || !entry.mimeType.trim()) {
      throw new Error(`Manifest item ${index + 1} mimeType is required.`);
    }
    if (typeof entry.tokenUri !== 'string' || !entry.tokenUri.trim()) {
      throw new Error(`Manifest item ${index + 1} tokenUri is required.`);
    }
    ensureAscii(entry.mimeType, `Manifest item ${index + 1} mimeType`);
    ensureAscii(entry.tokenUri, `Manifest item ${index + 1} tokenUri`);
    if (entry.mimeType.length > MAX_MIME_LENGTH) {
      throw new Error(`Manifest item ${index + 1} mimeType exceeds ${MAX_MIME_LENGTH} chars.`);
    }
    if (entry.tokenUri.length > MAX_TOKEN_URI_LENGTH) {
      throw new Error(`Manifest item ${index + 1} tokenUri exceeds ${MAX_TOKEN_URI_LENGTH} chars.`);
    }

    const filePath = path.resolve(manifestDir, entry.file);
    const fileData = fs.readFileSync(filePath);
    const chunks = chunkBytes(fileData);
    if (chunks.length <= 0) {
      throw new Error(`Manifest item ${index + 1} has no bytes.`);
    }
    if (chunks.length > MAX_CHUNKS_PER_UPLOAD) {
      throw new Error(`Manifest item ${index + 1} exceeds max chunk count (${MAX_CHUNKS_PER_UPLOAD}).`);
    }
    const expectedHash = computeExpectedHash(chunks);
    return {
      index,
      label: entry.label || path.basename(filePath),
      filePath,
      mimeType: entry.mimeType,
      tokenUri: entry.tokenUri,
      dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : [],
      fileData,
      chunks,
      totalSize: BigInt(fileData.length),
      totalChunks: BigInt(chunks.length),
      expectedHash,
      hashHex: expectedHash.toString('hex'),
      requestDuplicateOf: null,
      recursiveSkipped: false,
      existingTokenId: null,
      mintedTokenId: null,
      raceDuplicateTokenId: null,
      uploadState: null,
      reservation: null,
      collectionMintPrice: null,
      beginNeeded: true,
      chunkBatchCount: batchChunks(chunks).length,
      txids: []
    };
  });

  return {
    manifestPath: absolutePath,
    mode,
    networkName,
    xtrataContract,
    collectionContract,
    items
  };
}

function deriveSenderKey(networkName) {
  if (process.env.SENDER_KEY) {
    return process.env.SENDER_KEY.trim();
  }
  if (process.env.XTRATA_MNEMONIC) {
    const seed = mnemonicToSeedSync(process.env.XTRATA_MNEMONIC.trim());
    const master = HDKey.fromMasterSeed(seed);
    const child = master.derive(DERIVATION_PATH);
    return Buffer.from(child.privateKey).toString('hex') + '01';
  }
  throw new Error('Set SENDER_KEY or XTRATA_MNEMONIC before running batch mint.');
}

function validateUploadStateAgainstItem(uploadState, item) {
  if (!uploadState) {
    throw new Error(`Upload state missing for ${item.label}.`);
  }
  if (uploadState.mimeType !== item.mimeType) {
    throw new Error(`${item.label} upload mime mismatch: ${uploadState.mimeType} vs ${item.mimeType}`);
  }
  if (uploadState.totalSize !== item.totalSize) {
    throw new Error(`${item.label} upload size mismatch.`);
  }
  if (uploadState.totalChunks !== Number(item.totalChunks)) {
    throw new Error(`${item.label} upload chunk count mismatch.`);
  }
  if (!Number.isSafeInteger(uploadState.currentIndex) || uploadState.currentIndex < 0 || uploadState.currentIndex > item.chunks.length) {
    throw new Error(`${item.label} upload current-index is invalid.`);
  }
  return uploadState.currentIndex;
}

function toStx(amount) {
  return `${(Number(amount) / 1_000_000).toFixed(6)} STX`;
}

function computeSealFee(feeUnit, totalChunks) {
  const chunkCount = BigInt(totalChunks);
  return feeUnit * (1n + ((chunkCount + 49n) / 50n));
}

function computeBatchSealFee(feeUnit, items) {
  return items.reduce((sum, item) => sum + computeSealFee(feeUnit, item.totalChunks), 0n);
}

async function readOnly(contract, functionName, functionArgs, senderAddress, network) {
  const result = await callReadOnlyFunction({
    contractAddress: contract.address,
    contractName: contract.contractName,
    functionName,
    functionArgs,
    senderAddress,
    network
  });
  return cvToJSON(result);
}

async function getFeeUnit(context) {
  const json = await readOnly(context.xtrataContract, 'get-fee-unit', [], context.senderAddress, context.network);
  const feeUnit = parseUint(toJsonValue(json));
  if (feeUnit === null) {
    throw new Error('Failed to read get-fee-unit.');
  }
  return feeUnit;
}

async function getIdByHash(context, hash) {
  const json = await readOnly(
    context.xtrataContract,
    'get-id-by-hash',
    [bufferCV(hash)],
    context.senderAddress,
    context.network
  );
  return parseUint(toJsonValue(json));
}

async function getUploadState(context, hash) {
  const json = await readOnly(
    context.xtrataContract,
    'get-upload-state',
    [bufferCV(hash), principalCV(context.senderAddress)],
    context.senderAddress,
    context.network
  );
  return parseUploadState(json);
}

async function getCollectionReservation(context, hash) {
  const json = await readOnly(
    context.collectionContract,
    'get-reservation',
    [principalCV(context.senderAddress), bufferCV(hash)],
    context.senderAddress,
    context.network
  );
  return parseReservation(json);
}

async function getCollectionDefaultDependencies(context) {
  const json = await readOnly(
    context.collectionContract,
    'get-default-dependencies',
    [],
    context.senderAddress,
    context.network
  );
  const list = parseList(toJsonValue(json));
  return list.length;
}

async function getCollectionEffectiveMintPrice(context) {
  const baseMintJson = await readOnly(
    context.collectionContract,
    'get-mint-price',
    [],
    context.senderAddress,
    context.network
  );
  let effectiveMintPrice = parseUint(toJsonValue(baseMintJson));
  if (effectiveMintPrice === null) {
    throw new Error('Failed to read collection mint price.');
  }

  const activePhaseJson = await readOnly(
    context.collectionContract,
    'get-active-phase',
    [],
    context.senderAddress,
    context.network
  );
  const activePhaseId = parseUint(toJsonValue(activePhaseJson));
  if (activePhaseId !== null && activePhaseId > 0n) {
    const phaseJson = await readOnly(
      context.collectionContract,
      'get-phase',
      [uintCV(activePhaseId)],
      context.senderAddress,
      context.network
    );
    const phase = parsePhase(phaseJson);
    if (phase && phase.enabled) {
      effectiveMintPrice = phase.mintPrice;
    }
  }

  return effectiveMintPrice;
}

async function pollTx(txid, network) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (
      data.tx_status === 'success' ||
      data.tx_status === 'abort_by_response' ||
      data.tx_status === 'abort_by_post_condition'
    ) {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Transaction ${txid} did not confirm in time.`);
}

async function broadcastAndConfirm(tx, context, label) {
  const result = await broadcastTransaction(tx, context.network);
  if (result.error) {
    throw new Error(`${label} broadcast failed: ${result.error} — ${result.reason}`);
  }
  const txid = result.txid || result;
  console.log(`${label}: ${txid}`);
  const txData = await pollTx(txid, context.network);
  context.txids.push(txid);
  context.nonce += 1n;
  return { txid, txData };
}

function buildBeginCoreTx(context, item) {
  return makeContractCall({
    contractAddress: context.xtrataContract.address,
    contractName: context.xtrataContract.contractName,
    functionName: 'begin-or-get',
    functionArgs: [
      bufferCV(item.expectedHash),
      stringAsciiCV(item.mimeType),
      uintCV(item.totalSize),
      uintCV(item.totalChunks)
    ],
    senderKey: context.senderKey,
    network: context.network,
    nonce: context.nonce,
    fee: STX_FEE,
    postConditions: [
      makeStandardSTXPostCondition(
        context.senderAddress,
        FungibleConditionCode.LessEqual,
        context.feeUnit
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}

function buildBeginCollectionTx(context, item) {
  return makeContractCall({
    contractAddress: context.collectionContract.address,
    contractName: context.collectionContract.contractName,
    functionName: 'mint-begin',
    functionArgs: [
      contractPrincipalCV(context.xtrataContract.address, context.xtrataContract.contractName),
      bufferCV(item.expectedHash),
      stringAsciiCV(item.mimeType),
      uintCV(item.totalSize),
      uintCV(item.totalChunks)
    ],
    senderKey: context.senderKey,
    network: context.network,
    nonce: context.nonce,
    fee: STX_FEE,
    postConditions: [
      makeStandardSTXPostCondition(
        context.senderAddress,
        FungibleConditionCode.LessEqual,
        context.feeUnit
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}

function buildChunkTx(context, item, chunks) {
  const common = {
    senderKey: context.senderKey,
    network: context.network,
    nonce: context.nonce,
    fee: STX_FEE,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  };
  if (context.mode === 'collection-batch-seal') {
    return makeContractCall({
      contractAddress: context.collectionContract.address,
      contractName: context.collectionContract.contractName,
      functionName: 'mint-add-chunk-batch',
      functionArgs: [
        contractPrincipalCV(context.xtrataContract.address, context.xtrataContract.contractName),
        bufferCV(item.expectedHash),
        listCV(chunks.map((chunk) => bufferCV(chunk)))
      ],
      ...common
    });
  }
  return makeContractCall({
    contractAddress: context.xtrataContract.address,
    contractName: context.xtrataContract.contractName,
    functionName: 'add-chunk-batch',
    functionArgs: [
      bufferCV(item.expectedHash),
      listCV(chunks.map((chunk) => bufferCV(chunk)))
    ],
    ...common
  });
}

function buildBatchSealTx(context, items) {
  const tupleItems = listCV(
    items.map((item) =>
      tupleCV({
        hash: bufferCV(item.expectedHash),
        'token-uri': stringAsciiCV(item.tokenUri)
      })
    )
  );
  if (context.mode === 'collection-batch-seal') {
    const totalMintPrice = items.reduce((sum, item) => sum + item.collectionMintPrice, 0n);
    const totalSealFee = computeBatchSealFee(context.feeUnit, items);
    return makeContractCall({
      contractAddress: context.collectionContract.address,
      contractName: context.collectionContract.contractName,
      functionName: 'mint-seal-batch',
      functionArgs: [
        contractPrincipalCV(context.xtrataContract.address, context.xtrataContract.contractName),
        tupleItems
      ],
      senderKey: context.senderKey,
      network: context.network,
      nonce: context.nonce,
      fee: STX_FEE,
      postConditions: [
        makeStandardSTXPostCondition(
          context.senderAddress,
          FungibleConditionCode.LessEqual,
          totalMintPrice + totalSealFee
        )
      ],
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any
    });
  }
  return makeContractCall({
    contractAddress: context.xtrataContract.address,
    contractName: context.xtrataContract.contractName,
    functionName: 'seal-inscription-batch',
    functionArgs: [tupleItems],
    senderKey: context.senderKey,
    network: context.network,
    nonce: context.nonce,
    fee: STX_FEE,
    postConditions: [
      makeStandardSTXPostCondition(
        context.senderAddress,
        FungibleConditionCode.LessEqual,
        computeBatchSealFee(context.feeUnit, items)
      )
    ],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });
}

async function preflight(context) {
  if (context.mode === 'collection-batch-seal') {
    const dependencyCount = await getCollectionDefaultDependencies(context);
    if (dependencyCount > 0) {
      throw new Error('Collection contract has default dependencies enabled; batch seal is unsupported.');
    }
    context.collectionEffectiveMintPrice = await getCollectionEffectiveMintPrice(context);
  }

  const seenHashes = new Map();
  for (const item of context.items) {
    if (Array.isArray(item.dependencies) && item.dependencies.length > 0) {
      item.recursiveSkipped = true;
      continue;
    }
    if (seenHashes.has(item.hashHex)) {
      item.requestDuplicateOf = seenHashes.get(item.hashHex);
      continue;
    }
    seenHashes.set(item.hashHex, item.index);

    item.existingTokenId = await getIdByHash(context, item.expectedHash);
    if (item.existingTokenId !== null) {
      continue;
    }

    item.uploadState = await getUploadState(context, item.expectedHash);
    if (context.mode === 'collection-batch-seal') {
      item.reservation = await getCollectionReservation(context, item.expectedHash);
      item.beginNeeded = !(item.uploadState && item.reservation);
      item.collectionMintPrice = item.reservation
        ? item.reservation.mintPrice
        : context.collectionEffectiveMintPrice;
    } else {
      item.beginNeeded = !item.uploadState;
    }
  }
}

function buildPlan(context) {
  let plannedBeginTxs = 0;
  let plannedChunkTxs = 0;
  let estimatedMintPriceMicroStx = 0n;

  for (const item of context.items) {
    if (item.recursiveSkipped || item.requestDuplicateOf !== null || item.existingTokenId !== null) {
      continue;
    }
    if (item.beginNeeded) {
      plannedBeginTxs += 1;
    }
    const currentIndex = item.uploadState ? validateUploadStateAgainstItem(item.uploadState, item) : 0;
    plannedChunkTxs += batchChunks(item.chunks.slice(currentIndex)).length;
    if (context.mode === 'collection-batch-seal') {
      estimatedMintPriceMicroStx += item.collectionMintPrice;
    }
  }

  const sealCandidates = context.items.filter(
    (item) =>
      !item.recursiveSkipped &&
      item.requestDuplicateOf === null &&
      item.existingTokenId === null
  );
  const plannedSealTxs = sealCandidates.length > 0 ? 1 : 0;
  const plannedSealFee = computeBatchSealFee(context.feeUnit, sealCandidates);
  const plannedBeginFee = context.feeUnit * BigInt(plannedBeginTxs);

  return {
    requestedCount: context.items.length,
    firstOccurrenceCount: context.items.filter((item) => item.requestDuplicateOf === null).length,
    duplicateInRequestCount: context.items.filter((item) => item.requestDuplicateOf !== null).length,
    recursiveSkippedCount: context.items.filter((item) => item.recursiveSkipped).length,
    existingCount: context.items.filter((item) => item.existingTokenId !== null).length,
    plannedBeginTxs,
    plannedChunkTxs,
    plannedSealTxs,
    plannedTxCount: plannedBeginTxs + plannedChunkTxs + plannedSealTxs,
    plannedBeginFee,
    plannedSealFee,
    plannedMintPrice: estimatedMintPriceMicroStx,
    plannedMaxProtocolSpend: plannedBeginFee + plannedSealFee,
    plannedMaxSpend:
      context.mode === 'collection-batch-seal'
        ? plannedBeginFee + plannedSealFee + estimatedMintPriceMicroStx
        : plannedBeginFee + plannedSealFee
  };
}

async function stageItem(context, item) {
  if (item.recursiveSkipped || item.requestDuplicateOf !== null || item.existingTokenId !== null) {
    return;
  }

  if (item.beginNeeded) {
    const beginTx =
      context.mode === 'collection-batch-seal'
        ? buildBeginCollectionTx(context, item)
        : buildBeginCoreTx(context, item);
    const { txid, txData } = await broadcastAndConfirm(beginTx, context, `[begin] ${item.label}`);
    item.txids.push(txid);

    if (txData.tx_status !== 'success') {
      const existingId = await getIdByHash(context, item.expectedHash);
      if (existingId !== null) {
        item.existingTokenId = existingId;
        item.raceDuplicateTokenId = existingId;
        return;
      }
      throw new Error(`[begin] ${item.label} failed with ${txData.tx_status}`);
    }

    if (context.mode === 'core-batch-seal') {
      const beginResult = parseBeginOrGetResult(txData);
      const existingId = parseUint(beginResult);
      if (existingId !== null) {
        item.existingTokenId = existingId;
        item.raceDuplicateTokenId = existingId;
        return;
      }
    }
  }

  item.uploadState = await getUploadState(context, item.expectedHash);
  const currentIndex = validateUploadStateAgainstItem(item.uploadState, item);

  if (context.mode === 'collection-batch-seal') {
    item.reservation = await getCollectionReservation(context, item.expectedHash);
    if (!item.reservation) {
      throw new Error(`Collection reservation missing for ${item.label}.`);
    }
    item.collectionMintPrice = item.reservation.mintPrice;
  }

  if (currentIndex >= item.chunks.length) {
    return;
  }

  const remainingBatches = batchChunks(item.chunks.slice(currentIndex));
  for (let i = 0; i < remainingBatches.length; i++) {
    const chunkTx = buildChunkTx(context, item, remainingBatches[i]);
    const { txid, txData } = await broadcastAndConfirm(
      chunkTx,
      context,
      `[chunk ${i + 1}/${remainingBatches.length}] ${item.label}`
    );
    item.txids.push(txid);
    if (txData.tx_status !== 'success') {
      throw new Error(`[chunk] ${item.label} failed with ${txData.tx_status}`);
    }
  }
}

async function stageAll(context) {
  for (const item of context.items) {
    await stageItem(context, item);
  }
}

async function reconcileBeforeSeal(context) {
  const sealCandidates = [];
  const raceDuplicates = [];

  for (const item of context.items) {
    if (item.recursiveSkipped || item.requestDuplicateOf !== null) continue;
    if (item.existingTokenId !== null) continue;

    const existingId = await getIdByHash(context, item.expectedHash);
    if (existingId !== null) {
      item.existingTokenId = existingId;
      item.raceDuplicateTokenId = existingId;
      raceDuplicates.push(item);
      continue;
    }

    sealCandidates.push(item);
  }

  return { sealCandidates, raceDuplicates };
}

function propagateRequestDuplicates(items) {
  for (const item of items) {
    if (item.requestDuplicateOf === null) continue;
    const source = items[item.requestDuplicateOf];
    item.existingTokenId = source.mintedTokenId ?? source.existingTokenId ?? source.raceDuplicateTokenId ?? null;
  }
}

function buildSummary(context, plan, batchResult) {
  propagateRequestDuplicates(context.items);
  const allResolvedTokenIds = context.items
    .map((item) => item.mintedTokenId ?? item.existingTokenId ?? item.raceDuplicateTokenId ?? null)
    .filter((value) => value !== null)
    .map((value) => value.toString());

  return {
    route: context.mode,
    requestedCount: context.items.length,
    uniqueRequestedCount: context.items.filter((item) => item.requestDuplicateOf === null).length,
    mintedCount: context.items.filter((item) => item.mintedTokenId !== null).length,
    existingCount: context.items.filter((item) => item.existingTokenId !== null && item.mintedTokenId === null).length,
    duplicateInRequestCount: context.items.filter((item) => item.requestDuplicateOf !== null).length,
    skippedRecursiveCount: context.items.filter((item) => item.recursiveSkipped).length,
    txids: context.txids,
    batchSealRange: batchResult
      ? { start: batchResult.start.toString(), count: batchResult.count.toString() }
      : null,
    tokenIds: allResolvedTokenIds,
    plannedTxCount: plan.plannedTxCount,
    plannedMaxProtocolSpendMicroStx: plan.plannedMaxProtocolSpend.toString(),
    plannedMaxSpendMicroStx: plan.plannedMaxSpend.toString(),
    items: context.items.map((item) => ({
      index: item.index,
      label: item.label,
      file: item.filePath,
      hash: item.hashHex,
      status: item.recursiveSkipped
        ? 'recursive-skipped'
        : item.requestDuplicateOf !== null
          ? 'duplicate-in-request'
          : item.mintedTokenId !== null
            ? 'minted'
            : item.existingTokenId !== null
              ? 'reused-existing'
              : 'pending',
      duplicateOf: item.requestDuplicateOf,
      tokenId: (item.mintedTokenId ?? item.existingTokenId ?? item.raceDuplicateTokenId)?.toString() ?? null,
      txids: item.txids
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printTemplate) {
    console.log(JSON.stringify(buildTemplate(args.printTemplate), null, 2));
    return;
  }
  const manifest = readManifest(args.manifestPath);
  const senderKey = deriveSenderKey(manifest.networkName);
  const senderAddress = getAddressFromPrivateKey(senderKey, resolveTxVersion(manifest.networkName));
  const network = resolveNetwork(manifest.networkName);
  if (inferNetworkFromAddress(senderAddress) !== manifest.networkName) {
    throw new Error(`Sender address network mismatch: ${senderAddress}`);
  }

  const context = {
    ...manifest,
    senderKey,
    senderAddress,
    network,
    nonce: await getNonce(senderAddress, network),
    txids: [],
    feeUnit: null,
    collectionEffectiveMintPrice: 0n
  };

  context.feeUnit = await getFeeUnit(context);

  console.log(`Route: ${context.mode}`);
  console.log(`Sender: ${context.senderAddress}`);
  console.log(`Manifest: ${context.manifestPath}`);
  console.log(`Fee unit: ${context.feeUnit} microSTX (${toStx(context.feeUnit)})`);

  await preflight(context);
  const plan = buildPlan(context);

  console.log(`Requested items: ${plan.requestedCount}`);
  console.log(`Unique first-occurrence items: ${plan.firstOccurrenceCount}`);
  console.log(`Existing on-chain: ${plan.existingCount}`);
  console.log(`Duplicate-in-request: ${plan.duplicateInRequestCount}`);
  console.log(`Recursive skipped: ${plan.recursiveSkippedCount}`);
  console.log(`Planned txs: ${plan.plannedTxCount} (begin ${plan.plannedBeginTxs}, chunk ${plan.plannedChunkTxs}, seal ${plan.plannedSealTxs})`);
  console.log(`Planned max protocol spend: ${plan.plannedMaxProtocolSpend.toString()} microSTX (${toStx(plan.plannedMaxProtocolSpend)})`);
  if (context.mode === 'collection-batch-seal') {
    console.log(`Planned collection mint spend: ${plan.plannedMintPrice.toString()} microSTX (${toStx(plan.plannedMintPrice)})`);
  }
  console.log(`Planned max total spend: ${plan.plannedMaxSpend.toString()} microSTX (${toStx(plan.plannedMaxSpend)})`);

  if (args.dryRun) {
    console.log(JSON.stringify(buildSummary(context, plan, null), null, 2));
    return;
  }

  await stageAll(context);
  const { sealCandidates, raceDuplicates } = await reconcileBeforeSeal(context);

  if (context.mode === 'collection-batch-seal' && raceDuplicates.length > 0) {
    const labels = raceDuplicates.map((item) => item.label).join(', ');
    throw new Error(
      `Collection batch seal aborted. Duplicate race detected after staging: ${labels}. Reservations may require config-admin cleanup.`
    );
  }

  let batchResult = null;
  if (sealCandidates.length > 0) {
    const sealTx = buildBatchSealTx(context, sealCandidates);
    const { txid, txData } = await broadcastAndConfirm(sealTx, context, '[seal-batch]');
    if (txData.tx_status !== 'success') {
      throw new Error(`[seal-batch] failed with ${txData.tx_status}`);
    }
    batchResult = parseBatchSealResult(txData);
    if (batchResult.count !== BigInt(sealCandidates.length)) {
      throw new Error(`Batch seal count mismatch: expected ${sealCandidates.length}, got ${batchResult.count.toString()}`);
    }
    let nextTokenId = batchResult.start;
    for (const item of sealCandidates) {
      item.mintedTokenId = nextTokenId;
      item.txids.push(txid);
      nextTokenId += 1n;
    }
  }

  console.log(JSON.stringify(buildSummary(context, plan, batchResult), null, 2));
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
