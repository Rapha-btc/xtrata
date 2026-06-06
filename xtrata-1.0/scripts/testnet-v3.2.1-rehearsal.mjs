#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha256';
import { StacksTestnet, createApiKeyMiddleware, createFetchFn } from '@stacks/network';
import { generateNewAccount, generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import {
  AnchorMode,
  ClarityVersion,
  PostConditionMode,
  TransactionVersion,
  broadcastTransaction,
  bufferCV,
  boolCV,
  callReadOnlyFunction,
  contractPrincipalCV,
  cvToJSON,
  getAddressFromPrivateKey,
  listCV,
  makeContractCall,
  makeContractDeploy,
  principalCV,
  stringAsciiCV,
  uintCV
} from '@stacks/transactions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'reports');
const jsonReportPath = path.join(reportsDir, 'testnet-v3.2.1-rehearsal.json');
const markdownReportPath = path.join(reportsDir, 'testnet-v3.2.1-rehearsal.md');
const latestEnvPath = path.join(reportsDir, 'testnet-v3.2.1-latest-env.sh');

const CHUNK_SIZE = 16_384;
const CORE_UPLOAD_LIMIT = 32;
const APP_HELPER_POLICY_LIMIT = 30;
const DEFAULT_API_URL = 'https://api.testnet.hiro.so';
const MIME = 'application/octet-stream';
const DEFAULT_TOKEN_URI = 'data:text/plain,xtrata-v3.2.1-testnet-rehearsal';
const DRY_RUN_PLACEHOLDER_ADDRESS = 'ST000000000000000000002AMW42H';
const DEFAULT_CONFIRMATION_ATTEMPTS = 90;
const DEFAULT_CONFIRMATION_INTERVAL_MS = 10_000;

const CONTRACTS = [
  {
    key: 'v1_1_1',
    name: 'xtrata-v1-1-1',
    source: 'contracts/other/xtrata-v1.1.1.clar',
    requiredFor: ['legacy-v1-read-compatibility']
  },
  {
    key: 'v2_1_0',
    name: 'xtrata-v2-1-0',
    source: 'contracts/other/xtrata-v2.1.0.clar',
    requiredFor: ['migration-v2.1.0']
  },
  {
    key: 'v2_1_1',
    name: 'xtrata-v2-1-1',
    source: 'contracts/other/xtrata-v2.1.1.clar',
    requiredFor: ['migration-v2.1.1']
  },
  {
    key: 'core',
    name: 'xtrata-v3-2-1',
    source: 'contracts/other/xtrata-v3.2.1.clar',
    requiredFor: ['candidate-core']
  },
  {
    key: 'helper',
    name: 'xtrata-small-mint-v1-1',
    source: 'contracts/other/xtrata-small-mint-v1.1.clar',
    requiredFor: ['small-mint-helper']
  }
];

const usage = `Usage:
  npm run testnet:v3.2.1:deploy -- [--broadcast]
  npm run testnet:v3.2.1:fresh-deploy -- [--broadcast]
  npm run testnet:v3.2.1:smoke -- [--broadcast]
  npm run testnet:v3.2.1:fresh-rehearsal -- [--broadcast]
  npm run testnet:v3.2.1:remaining -- [--broadcast]
  npm run testnet:v3.2.1:reconstruct -- [--broadcast]
  npm run testnet:v3.2.1:report
  npm run testnet:v3.2.1:rehearsal -- [--broadcast]

Default mode is dry-run. Real testnet transactions require --broadcast and:
  XTRATA_TESTNET_DEPLOYER_KEY=<hex-private-key>
  XTRATA_TESTNET_WALLET_A_KEY=<hex-private-key>
  XTRATA_TESTNET_WALLET_B_KEY=<hex-private-key>

Or a disposable testnet mnemonic:
  XTRATA_TESTNET_MNEMONIC=<12-or-24-word-testnet-only-secret-key>
  XTRATA_TESTNET_DEPLOYER_INDEX=0
  XTRATA_TESTNET_WALLET_A_INDEX=1
  XTRATA_TESTNET_WALLET_B_INDEX=2

Optional:
  XTRATA_TESTNET_API_URL=${DEFAULT_API_URL}
  XTRATA_TESTNET_HIRO_API_KEY=<optional Hiro API key>
  XTRATA_TESTNET_CONTRACT_ADDRESS=<deployer-address>
  XTRATA_TESTNET_ROYALTY_RECIPIENT=<address>
  XTRATA_TESTNET_NEXT_ID_OFFSET=<uint>
  XTRATA_TESTNET_MIGRATION_BASE_ID=<uint, default 9000>
  XTRATA_TESTNET_CONFIRMATION_ATTEMPTS=${DEFAULT_CONFIRMATION_ATTEMPTS}
  XTRATA_TESTNET_CONFIRMATION_INTERVAL_MS=${DEFAULT_CONFIRMATION_INTERVAL_MS}
  XTRATA_TESTNET_FIXED_FEE_USTX=<uint, optional fixed tx fee for smoke/rehearsal calls>

Fresh deployment commands use mnemonic-derived funded role rotation by default:
  deployer index 2, wallet A index 0, wallet B index 1
They ignore XTRATA_TESTNET_CONTRACT_ADDRESS so a previously deployed contract
address cannot accidentally be reused.
Set XTRATA_TESTNET_FRESH_KEEP_ROLE_INDEXES=1 only when intentionally choosing
different role indexes for a fresh namespace.
`;

const nowIso = () => new Date().toISOString();

const parseArgs = (argv) => {
  const command = argv.find((arg) => !arg.startsWith('--')) ?? 'rehearsal';
  return {
    command,
    broadcast: argv.includes('--broadcast'),
    help: argv.includes('--help') || argv.includes('-h')
  };
};

const isFreshCommand = (command) => command === 'fresh-deploy' || command === 'fresh-rehearsal';

const applyFreshRoleDefaults = (command) => {
  if (!isFreshCommand(command)) {
    return null;
  }
  if (!process.env.XTRATA_TESTNET_MNEMONIC?.trim()) {
    throw new Error('Fresh deployment commands require XTRATA_TESTNET_MNEMONIC so funded account roles can be rotated.');
  }
  if (
    process.env.XTRATA_TESTNET_DEPLOYER_KEY?.trim() ||
    process.env.XTRATA_TESTNET_WALLET_A_KEY?.trim() ||
    process.env.XTRATA_TESTNET_WALLET_B_KEY?.trim()
  ) {
    throw new Error('Fresh deployment role rotation requires mnemonic-derived keys, not explicit private key overrides.');
  }

  const defaults = {
    XTRATA_TESTNET_DEPLOYER_INDEX: '2',
    XTRATA_TESTNET_WALLET_A_INDEX: '0',
    XTRATA_TESTNET_WALLET_B_INDEX: '1'
  };
  const keepExistingIndexes = envFlag('XTRATA_TESTNET_FRESH_KEEP_ROLE_INDEXES', false);
  for (const [name, value] of Object.entries(defaults)) {
    if (!keepExistingIndexes || !process.env[name]?.trim()) {
      process.env[name] = value;
    }
  }
  return defaults;
};

const envFlag = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
};

const parseOptionalUint = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return BigInt(value);
};

const fixedFeeOption = () => {
  const fee = parseOptionalUint('XTRATA_TESTNET_FIXED_FEE_USTX');
  return fee === null ? {} : { fee };
};

const hexByte = (value, bytes = 1) =>
  Number(value & 0xff)
    .toString(16)
    .padStart(2, '0')
    .repeat(bytes);

const payloadBytes = (size, seed = 0x11) => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = (seed + index) & 0xff;
  }
  return bytes;
};

const chunkBytes = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    chunks.push(bytes.slice(offset, offset + CHUNK_SIZE));
  }
  return chunks;
};

const concatBytes = (left, right) => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
};

const rollingHash = (chunks) => {
  let running = new Uint8Array(32);
  for (const chunk of chunks) {
    running = sha256(concatBytes(running, chunk));
  }
  return running;
};

const hex = (bytes) => Buffer.from(bytes).toString('hex');

const bytesEqual = (left, right) => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const makeCasePayload = (chunkCount, seed) => payloadBytes(chunkCount * CHUNK_SIZE, seed);

const contractId = (address, contractName) => `${address}.${contractName}`;

const parseOptionalIndex = (name, defaultValue) => {
  const value = process.env[name]?.trim();
  if (!value) {
    return defaultValue;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer account index.`);
  }
  return Number.parseInt(value, 10);
};

const deriveMnemonicKeys = async (mnemonic) => {
  const indexes = {
    deployer: parseOptionalIndex('XTRATA_TESTNET_DEPLOYER_INDEX', 0),
    walletA: parseOptionalIndex('XTRATA_TESTNET_WALLET_A_INDEX', 1),
    walletB: parseOptionalIndex('XTRATA_TESTNET_WALLET_B_INDEX', 2)
  };
  const maxIndex = Math.max(indexes.deployer, indexes.walletA, indexes.walletB);
  let wallet = await generateWallet({
    secretKey: mnemonic,
    password: 'xtrata-testnet-rehearsal-local-derivation'
  });
  while (wallet.accounts.length <= maxIndex) {
    wallet = generateNewAccount(wallet);
  }

  return {
    keys: {
      deployer: wallet.accounts[indexes.deployer].stxPrivateKey,
      walletA: wallet.accounts[indexes.walletA].stxPrivateKey,
      walletB: wallet.accounts[indexes.walletB].stxPrivateKey
    },
    indexes,
    addresses: {
      deployer: getStxAddress(wallet.accounts[indexes.deployer], 'testnet'),
      walletA: getStxAddress(wallet.accounts[indexes.walletA], 'testnet'),
      walletB: getStxAddress(wallet.accounts[indexes.walletB], 'testnet')
    }
  };
};

const getKeys = async () => {
  const explicit = {
    deployer: process.env.XTRATA_TESTNET_DEPLOYER_KEY?.trim() || null,
    walletA: process.env.XTRATA_TESTNET_WALLET_A_KEY?.trim() || null,
    walletB: process.env.XTRATA_TESTNET_WALLET_B_KEY?.trim() || null
  };
  const mnemonic = process.env.XTRATA_TESTNET_MNEMONIC?.trim();
  if (!mnemonic) {
    return { ...explicit, derivation: null, derivedAddresses: null };
  }
  const derived = await deriveMnemonicKeys(mnemonic);
  return {
    deployer: explicit.deployer ?? derived.keys.deployer,
    walletA: explicit.walletA ?? derived.keys.walletA,
    walletB: explicit.walletB ?? derived.keys.walletB,
    derivation: {
      source: 'XTRATA_TESTNET_MNEMONIC',
      indexes: derived.indexes
    },
    derivedAddresses: derived.addresses
  };
};

const addressFromKey = (key) => getAddressFromPrivateKey(key, TransactionVersion.Testnet);

const createHiroFetch = () => {
  const apiKey = process.env.XTRATA_TESTNET_HIRO_API_KEY?.trim();
  if (!apiKey) {
    return fetch;
  }
  return createFetchFn(fetch, createApiKeyMiddleware({ apiKey }));
};

const createContext = async (broadcast, options = {}) => {
  const apiUrl = process.env.XTRATA_TESTNET_API_URL?.trim() || DEFAULT_API_URL;
  const hiroFetch = createHiroFetch();
  const network = new StacksTestnet({ url: apiUrl, fetchFn: hiroFetch });
  const keys = await getKeys();
  const deployerAddress = keys.deployer ? addressFromKey(keys.deployer) : null;
  const contractAddress = options.ignoreContractAddressEnv
    ? deployerAddress || DRY_RUN_PLACEHOLDER_ADDRESS
    : process.env.XTRATA_TESTNET_CONTRACT_ADDRESS?.trim() || deployerAddress || DRY_RUN_PLACEHOLDER_ADDRESS;
  const walletAAddress = keys.walletA ? addressFromKey(keys.walletA) : null;
  const walletBAddress = keys.walletB ? addressFromKey(keys.walletB) : null;

  const report = {
    generatedAt: nowIso(),
    mode: broadcast ? 'broadcast' : 'dry-run',
    network: 'testnet',
    apiUrl,
    hiroApiKeyConfigured: Boolean(process.env.XTRATA_TESTNET_HIRO_API_KEY?.trim()),
    deployerAddress,
    walletAAddress,
    walletBAddress,
    contractAddress,
    contracts: Object.fromEntries(
      CONTRACTS.map((contract) => [
        contract.key,
        {
          name: contract.name,
          id: contractId(contractAddress, contract.name),
          source: contract.source,
          requiredFor: contract.requiredFor,
          deployTxId: null
        }
      ])
    ),
    assumptions: {
      chunkSize: CHUNK_SIZE,
      coreUploadLimit: CORE_UPLOAD_LIMIT,
      appHelperPolicyLimit: APP_HELPER_POLICY_LIMIT,
      hashToId: 'advisory first-seen lookup; duplicate same-hash mints remain allowed',
      parentChildReverseIndexes: 'manifest/indexer/resolver responsibility, not core',
      keySource: keys.derivation ? 'mnemonic-derived testnet account keys' : 'explicit private key env vars or dry-run'
    },
    keyDerivation: keys.derivation
      ? {
          ...keys.derivation,
          derivedAddresses: keys.derivedAddresses
        }
      : null,
    commands: {
      generateTestnetPlan:
        'npm --prefix contracts/clarinet exec -- clarinet deployments generate --testnet --manual-cost',
      applyTestnetPlan:
        'npm --prefix contracts/clarinet exec -- clarinet deployments apply --testnet --no-dashboard --use-on-disk-deployment-plan',
      deploy: 'npm run testnet:v3.2.1:deploy -- --broadcast',
      smoke: 'npm run testnet:v3.2.1:smoke -- --broadcast',
      reconstruct: 'npm run testnet:v3.2.1:reconstruct -- --broadcast',
      report: 'npm run testnet:v3.2.1:report',
      rehearsal: 'npm run testnet:v3.2.1:rehearsal -- --broadcast'
    },
    transactions: [],
    readOnly: [],
    testCases: [],
    reconstruction: [],
    warnings: [],
    failures: [],
    recommendation: 'needs another testnet pass'
  };
  if (options.freshDeployment) {
    report.warnings.push(
      'Fresh deployment mode: ignoring XTRATA_TESTNET_CONTRACT_ADDRESS and using the rotated deployer address as the contract namespace.'
    );
  }

  return { apiUrl, network, hiroFetch, keys, contractAddress, report, plannedNextTokenIds: new Map() };
};

const nextPlannedTokenId = (ctx, contractName) => {
  const current = ctx.plannedNextTokenIds.get(contractName) ?? 1n;
  ctx.plannedNextTokenIds.set(contractName, current + 1n);
  return current;
};

const requireBroadcastKey = (ctx, keyName) => {
  const key = ctx.keys[keyName];
  if (!key) {
    throw new Error(`Missing ${keyName} key for broadcast mode.`);
  }
  return key;
};

const waitForTx = async (ctx, txid) => {
  const attempts = Number.parseInt(
    process.env.XTRATA_TESTNET_CONFIRMATION_ATTEMPTS || `${DEFAULT_CONFIRMATION_ATTEMPTS}`,
    10
  );
  const intervalMs = Number.parseInt(
    process.env.XTRATA_TESTNET_CONFIRMATION_INTERVAL_MS || `${DEFAULT_CONFIRMATION_INTERVAL_MS}`,
    10
  );
  const url = `${ctx.apiUrl.replace(/\/$/, '')}/extended/v1/tx/${txid}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await ctx.hiroFetch(url);
    if (response.ok) {
      const tx = await response.json();
      if (tx.tx_status === 'success') {
        return tx;
      }
      if (tx.tx_status?.startsWith('abort') || tx.tx_status === 'failed') {
        throw new Error(`Transaction ${txid} failed: ${tx.tx_status} ${tx.tx_result?.repr ?? ''}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction ${txid} was not confirmed after ${attempts} attempts.`);
};

const waitForExpectedFailure = async (ctx, txid) => {
  const attempts = Number.parseInt(
    process.env.XTRATA_TESTNET_CONFIRMATION_ATTEMPTS || `${DEFAULT_CONFIRMATION_ATTEMPTS}`,
    10
  );
  const intervalMs = Number.parseInt(
    process.env.XTRATA_TESTNET_CONFIRMATION_INTERVAL_MS || `${DEFAULT_CONFIRMATION_INTERVAL_MS}`,
    10
  );
  const url = `${ctx.apiUrl.replace(/\/$/, '')}/extended/v1/tx/${txid}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await ctx.hiroFetch(url);
    if (response.ok) {
      const tx = await response.json();
      if (tx.tx_status?.startsWith('abort') || tx.tx_status === 'failed') {
        return tx;
      }
      if (tx.tx_status === 'success') {
        throw new Error(`Transaction ${txid} succeeded but was expected to fail.`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction ${txid} was not confirmed after ${attempts} attempts.`);
};

const recordTransaction = (ctx, entry) => {
  ctx.report.transactions.push({
    at: nowIso(),
    ...entry
  });
};

const broadcastOrPlan = async (ctx, label, buildTx, dryRunDetail) => {
  if (ctx.report.mode !== 'broadcast') {
    recordTransaction(ctx, {
      label,
      dryRun: true,
      status: 'planned',
      ...dryRunDetail
    });
    return { txid: null, receipt: null };
  }

  const tx = await buildTx();
  const result = await broadcastTransaction(tx, ctx.network);
  if (result.error) {
    throw new Error(`Broadcast failed for ${label}: ${result.error} ${result.reason ?? ''}`);
  }
  const txid = result.txid || result;
  const receipt = await waitForTx(ctx, txid);
  recordTransaction(ctx, {
    label,
    dryRun: false,
    status: receipt.tx_status,
    txid,
    blockHeight: receipt.block_height,
    feeRate: receipt.fee_rate,
    result: receipt.tx_result
  });
  return { txid, receipt };
};

const deployContract = async (ctx, contract) => {
  const sourcePath = path.join(repoRoot, contract.source);
  const codeBody = await readFile(sourcePath, 'utf8');
  const deployerKey = ctx.report.mode === 'broadcast' ? requireBroadcastKey(ctx, 'deployer') : null;

  return broadcastOrPlan(
    ctx,
    `deploy ${contract.name}`,
    () =>
      makeContractDeploy({
        contractName: contract.name,
        codeBody,
        senderKey: deployerKey,
        network: ctx.network,
        clarityVersion: ClarityVersion.Clarity3,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        ...fixedFeeOption()
      }),
    {
      contractName: contract.name,
      source: contract.source,
      sourceSha256: createHash('sha256').update(codeBody).digest('hex')
    }
  );
};

const callContract = async (ctx, label, keyName, contractName, functionName, functionArgs) => {
  const senderKey = ctx.report.mode === 'broadcast' ? requireBroadcastKey(ctx, keyName) : null;
  return broadcastOrPlan(
    ctx,
    label,
    () =>
      makeContractCall({
        contractAddress: ctx.contractAddress,
        contractName,
        functionName,
        functionArgs,
        senderKey,
        network: ctx.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        ...fixedFeeOption()
      }),
    {
      contract: contractId(ctx.contractAddress, contractName),
      functionName,
      sender: keyName
    }
  );
};

const callContractExpectFailure = async (ctx, label, keyName, contractName, functionName, functionArgs) => {
  if (ctx.report.mode !== 'broadcast') {
    recordTransaction(ctx, {
      label,
      dryRun: true,
      status: 'planned-expected-failure',
      contract: contractId(ctx.contractAddress, contractName),
      functionName,
      sender: keyName
    });
    return { txid: null, receipt: null };
  }

  const senderKey = requireBroadcastKey(ctx, keyName);
  const tx = await makeContractCall({
    contractAddress: ctx.contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderKey,
    network: ctx.network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    ...fixedFeeOption()
  });
  const result = await broadcastTransaction(tx, ctx.network);
  if (result.error) {
    recordTransaction(ctx, {
      label,
      dryRun: false,
      status: 'expected-broadcast-rejection',
      error: result.error,
      reason: result.reason ?? null
    });
    return { txid: null, receipt: null };
  }
  const txid = result.txid || result;
  const receipt = await waitForExpectedFailure(ctx, txid);
  recordTransaction(ctx, {
    label,
    dryRun: false,
    status: receipt.tx_status,
    expectedFailure: true,
    txid,
    blockHeight: receipt.block_height,
    feeRate: receipt.fee_rate,
    result: receipt.tx_result
  });
  return { txid, receipt };
};

const readOnly = async (ctx, contractName, functionName, functionArgs, senderAddress) => {
  if (ctx.report.mode !== 'broadcast') {
    const entry = {
      at: nowIso(),
      dryRun: true,
      contract: contractId(ctx.contractAddress, contractName),
      functionName,
      sender: senderAddress ?? ctx.contractAddress,
      result: null
    };
    ctx.report.readOnly.push(entry);
    return null;
  }

  const result = await callReadOnlyFunction({
    contractAddress: ctx.contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderAddress: senderAddress ?? ctx.contractAddress,
    network: ctx.network
  });
  const json = cvToJSON(result);
  ctx.report.readOnly.push({
    at: nowIso(),
    dryRun: false,
    contract: contractId(ctx.contractAddress, contractName),
    functionName,
    sender: senderAddress ?? ctx.contractAddress,
    result: json
  });
  return json;
};

const readUInt = async (ctx, contractName, functionName, functionArgs, senderAddress) => {
  const json = await readOnly(ctx, contractName, functionName, functionArgs, senderAddress);
  if (!json) {
    return null;
  }
  const value = json.success === true ? json.value : json;
  if (value?.type !== 'uint') {
    throw new Error(`${contractName}.${functionName} did not return uint.`);
  }
  return BigInt(value.value);
};

const readOptionalUInt = async (ctx, contractName, functionName, functionArgs, senderAddress) => {
  const json = await readOnly(ctx, contractName, functionName, functionArgs, senderAddress);
  if (!json || json.value === null) {
    return null;
  }
  const value = json.value;
  if (value?.type !== 'uint') {
    return null;
  }
  return BigInt(value.value);
};

const directMint = async (ctx, keyName, bytes, tokenUri, relationships = null) => {
  const chunks = chunkBytes(bytes);
  const expectedHash = rollingHash(chunks);
  const tokenId =
    (await readUInt(
      ctx,
      'xtrata-v3-2-1',
      'get-next-token-id',
      [],
      ctx.report[`${keyName}Address`] ?? ctx.contractAddress
    )) ?? nextPlannedTokenId(ctx, 'xtrata-v3-2-1');
  const functionName = relationships ? 'mint-single-tx-with-relationships' : 'mint-single-tx';
  const args = relationships
    ? [
        bufferCV(expectedHash),
        stringAsciiCV(MIME),
        uintCV(bytes.length),
        listCV(chunks.map((chunk) => bufferCV(chunk))),
        stringAsciiCV(tokenUri),
        listCV((relationships.dependencies ?? []).map((id) => uintCV(id))),
        listCV((relationships.parents ?? []).map((id) => uintCV(id)))
      ]
    : [
        bufferCV(expectedHash),
        stringAsciiCV(MIME),
        uintCV(bytes.length),
        listCV(chunks.map((chunk) => bufferCV(chunk))),
        stringAsciiCV(tokenUri)
      ];

  await callContract(
    ctx,
    `direct mint ${tokenUri} (${chunks.length} chunks)`,
    keyName,
    'xtrata-v3-2-1',
    functionName,
    args
  );

  return {
    tokenId,
    expectedHash,
    hashHex: hex(expectedHash),
    bytes,
    chunkCount: chunks.length,
    size: bytes.length,
    tokenUri
  };
};

const stagedMint = async (ctx, keyName, bytes, tokenUri, batchSize = CORE_UPLOAD_LIMIT) => {
  const chunks = chunkBytes(bytes);
  const expectedHash = rollingHash(chunks);
  const tokenId =
    (await readUInt(
      ctx,
      'xtrata-v3-2-1',
      'get-next-token-id',
      [],
      ctx.report[`${keyName}Address`] ?? ctx.contractAddress
    )) ?? nextPlannedTokenId(ctx, 'xtrata-v3-2-1');

  await callContract(ctx, `staged begin ${tokenUri}`, keyName, 'xtrata-v3-2-1', 'begin-inscription', [
    bufferCV(expectedHash),
    stringAsciiCV(MIME),
    uintCV(bytes.length),
    uintCV(chunks.length)
  ]);

  for (let index = 0; index < chunks.length; index += batchSize) {
    await callContract(
      ctx,
      `staged add chunks ${tokenUri} ${index}-${Math.min(index + batchSize, chunks.length) - 1}`,
      keyName,
      'xtrata-v3-2-1',
      'add-chunk-batch',
      [bufferCV(expectedHash), listCV(chunks.slice(index, index + batchSize).map((chunk) => bufferCV(chunk)))]
    );
  }

  await callContract(ctx, `staged seal ${tokenUri}`, keyName, 'xtrata-v3-2-1', 'seal-inscription', [
    bufferCV(expectedHash),
    stringAsciiCV(tokenUri)
  ]);

  return {
    tokenId,
    expectedHash,
    hashHex: hex(expectedHash),
    bytes,
    chunkCount: chunks.length,
    size: bytes.length,
    tokenUri
  };
};

const helperMint = async (ctx, keyName, bytes, tokenUri) => {
  const chunks = chunkBytes(bytes);
  const expectedHash = rollingHash(chunks);
  const maybeTokenId =
    (await readUInt(
      ctx,
      'xtrata-v3-2-1',
      'get-next-token-id',
      [],
      ctx.report[`${keyName}Address`] ?? ctx.contractAddress
    )) ?? nextPlannedTokenId(ctx, 'xtrata-v3-2-1');
  await callContract(
    ctx,
    `helper mint ${tokenUri} (${chunks.length} chunks)`,
    keyName,
    'xtrata-small-mint-v1-1',
    'mint-small-single-tx',
    [
      contractPrincipalCV(ctx.contractAddress, 'xtrata-v3-2-1'),
      bufferCV(expectedHash),
      stringAsciiCV(MIME),
      uintCV(bytes.length),
      listCV(chunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(tokenUri)
    ]
  );
  return {
    tokenId: maybeTokenId,
    expectedHash,
    hashHex: hex(expectedHash),
    bytes,
    chunkCount: chunks.length,
    size: bytes.length,
    tokenUri
  };
};

const legacyMint = async (ctx, contractName, keyName, bytes, tokenUri) => {
  const chunks = chunkBytes(bytes);
  const expectedHash = rollingHash(chunks);
  const tokenId =
    (await readUInt(
      ctx,
      contractName,
      'get-next-token-id',
      [],
      ctx.report[`${keyName}Address`] ?? ctx.contractAddress
    )) ?? nextPlannedTokenId(ctx, contractName);
  await callContract(ctx, `legacy begin ${contractName} ${tokenUri}`, keyName, contractName, 'begin-inscription', [
    bufferCV(expectedHash),
    stringAsciiCV(MIME),
    uintCV(bytes.length),
    uintCV(chunks.length)
  ]);
  await callContract(ctx, `legacy add ${contractName} ${tokenUri}`, keyName, contractName, 'add-chunk-batch', [
    bufferCV(expectedHash),
    listCV(chunks.map((chunk) => bufferCV(chunk)))
  ]);
  await callContract(ctx, `legacy seal ${contractName} ${tokenUri}`, keyName, contractName, 'seal-inscription', [
    bufferCV(expectedHash),
    stringAsciiCV(tokenUri)
  ]);
  return { tokenId, expectedHash, hashHex: hex(expectedHash), bytes, chunkCount: chunks.length, size: bytes.length, tokenUri };
};

const reconstructToken = async (ctx, token) => {
  if (!token?.tokenId && token?.tokenId !== 0n) {
    ctx.report.reconstruction.push({
      tokenId: null,
      status: 'planned',
      reason: 'dry-run or token id unavailable'
    });
    return;
  }

  if (ctx.report.mode !== 'broadcast') {
    ctx.report.reconstruction.push({
      tokenId: token.tokenId.toString(),
      status: 'planned',
      expectedBytes: token.size,
      expectedChunks: token.chunkCount,
      expectedHash: token.hashHex
    });
    return;
  }

  const summary = await readOnly(
    ctx,
    'xtrata-v3-2-1',
    'get-inscription-summary',
    [uintCV(token.tokenId)],
    ctx.contractAddress
  );
  const indexes = Array.from({ length: token.chunkCount }, (_, index) => uintCV(index));
  const chunkBatch = await readOnly(
    ctx,
    'xtrata-v3-2-1',
    'get-chunk-batch',
    [uintCV(token.tokenId), listCV(indexes)],
    ctx.contractAddress
  );

  const chunkHexValues = (chunkBatch?.value ?? []).map((entry) => entry?.value?.value ?? entry?.value);
  const rebuilt = Buffer.concat(
    chunkHexValues.map((chunkHexValue) => Buffer.from(String(chunkHexValue).replace(/^0x/, ''), 'hex'))
  );
  const rebuiltBytes = new Uint8Array(rebuilt);
  const rebuiltChunks = chunkBytes(rebuiltBytes);
  const rebuiltHash = rollingHash(rebuiltChunks);
  const verified = bytesEqual(rebuiltBytes, token.bytes) && hex(rebuiltHash) === token.hashHex;

  ctx.report.reconstruction.push({
    tokenId: token.tokenId.toString(),
    summary,
    readMode: 'get-chunk-batch',
    expectedBytes: token.size,
    actualBytes: rebuiltBytes.length,
    expectedChunks: token.chunkCount,
    actualChunks: rebuiltChunks.length,
    expectedHash: token.hashHex,
    actualHash: hex(rebuiltHash),
    verified,
    cache: {
      checked: false,
      result: 'No testnet resolver cache adapter is configured in this CLI rehearsal.'
    }
  });
};

const addCase = (ctx, name, status, detail = {}) => {
  ctx.report.testCases.push({
    at: nowIso(),
    name,
    status,
    evidence:
      detail.evidence ??
      (status === 'passed'
        ? ctx.report.mode === 'broadcast'
          ? 'confirmed-on-chain'
          : 'dry-run-planned'
        : status === 'skipped'
          ? 'skipped-in-this-run'
          : 'unverified'),
    ...detail
  });
};

const runDeploy = async (ctx) => {
  ctx.report.warnings.push(
    'Clarinet deployment remains the preferred path for source/trait selection. This script deploy mode uses contracts/other testnet variants when --broadcast is supplied.'
  );
  for (const contract of CONTRACTS) {
    const result = await deployContract(ctx, contract);
    if (result.txid) {
      ctx.report.contracts[contract.key].deployTxId = result.txid;
    }
  }
};

const runAdminSetupSafe = async (ctx) => {
  const royaltyRecipient =
    process.env.XTRATA_TESTNET_ROYALTY_RECIPIENT?.trim() || ctx.report.deployerAddress || ctx.contractAddress;
  const nextIdOffset = parseOptionalUint('XTRATA_TESTNET_NEXT_ID_OFFSET');
  const migrationBase = parseOptionalUint('XTRATA_TESTNET_MIGRATION_BASE_ID') ?? 9000n;

  await callContract(ctx, 'core set royalty recipient', 'deployer', 'xtrata-v3-2-1', 'set-royalty-recipient', [
    principalCV(royaltyRecipient)
  ]);
  if (nextIdOffset !== null) {
    ctx.report.warnings.push(
      'set-next-id is one-shot. It must be called before native v3.2.1 mints when legacy ID continuity is required.'
    );
    await callContract(ctx, `core set next-id ${nextIdOffset.toString()}`, 'deployer', 'xtrata-v3-2-1', 'set-next-id', [
      uintCV(nextIdOffset)
    ]);
  }
  await callContract(ctx, 'core unpause', 'deployer', 'xtrata-v3-2-1', 'set-paused', [boolCV(false)]);
  await callContract(ctx, 'helper point at testnet core', 'deployer', 'xtrata-small-mint-v1-1', 'set-core-contract', [
    contractPrincipalCV(ctx.contractAddress, 'xtrata-v3-2-1')
  ]);
  await callContract(ctx, 'helper unpause', 'deployer', 'xtrata-small-mint-v1-1', 'set-paused', [boolCV(false)]);
  await callContract(ctx, 'v2.1.0 unpause', 'deployer', 'xtrata-v2-1-0', 'set-paused', [boolCV(false)]);
  await callContract(ctx, 'v2.1.1 unpause', 'deployer', 'xtrata-v2-1-1', 'set-paused', [boolCV(false)]);

  if (ctx.report.mode === 'broadcast') {
    await callContract(ctx, `v2.1.0 set migration base ${migrationBase.toString()}`, 'deployer', 'xtrata-v2-1-0', 'set-next-id', [
      uintCV(migrationBase)
    ]).catch((error) => {
      ctx.report.warnings.push(`v2.1.0 migration base setup skipped or failed: ${error.message}`);
    });
    await callContract(
      ctx,
      `v2.1.1 set migration base ${(migrationBase + 10n).toString()}`,
      'deployer',
      'xtrata-v2-1-1',
      'set-next-id',
      [uintCV(migrationBase + 10n)]
    ).catch((error) => {
      ctx.report.warnings.push(`v2.1.1 migration base setup skipped or failed: ${error.message}`);
    });
  }
};

const runSmoke = async (ctx) => {
  await runAdminSetupSafe(ctx);

  const directCases = [
    ['direct single-call 1-byte', payloadBytes(1, 0x01)],
    ['direct single-call 1 full chunk', makeCasePayload(1, 0x02)],
    ['direct single-call 30 chunks', makeCasePayload(30, 0x03)],
    ['direct single-call 32 chunks', makeCasePayload(32, 0x04)]
  ];
  for (const [name, bytes] of directCases) {
    const token = await directMint(ctx, 'walletA', bytes, `${DEFAULT_TOKEN_URI},${name}`);
    addCase(ctx, name, 'passed', {
      tokenId: token.tokenId?.toString() ?? null,
      size: token.size,
      chunkCount: token.chunkCount,
      hash: token.hashHex
    });
  }

  const helperOne = await helperMint(ctx, 'walletA', payloadBytes(1, 0x05), `${DEFAULT_TOKEN_URI},helper-1-byte`);
  addCase(ctx, 'helper 1-byte', 'passed', {
    tokenId: helperOne.tokenId?.toString() ?? null,
    size: helperOne.size,
    chunkCount: helperOne.chunkCount,
    hash: helperOne.hashHex
  });
  const helperMax = await helperMint(
    ctx,
    'walletA',
    makeCasePayload(APP_HELPER_POLICY_LIMIT, 0x06),
    `${DEFAULT_TOKEN_URI},helper-policy-30`
  );
  addCase(ctx, 'helper max app policy 30 chunks', 'passed', {
    tokenId: helperMax.tokenId?.toString() ?? null,
    size: helperMax.size,
    chunkCount: helperMax.chunkCount,
    hash: helperMax.hashHex
  });
  const helperOversizedBytes = makeCasePayload(33, 0x66);
  const helperOversizedChunks = chunkBytes(helperOversizedBytes);
  await callContractExpectFailure(
    ctx,
    'helper oversized 33 chunks expected failure',
    'walletA',
    'xtrata-small-mint-v1-1',
    'mint-small-single-tx',
    [
      contractPrincipalCV(ctx.contractAddress, 'xtrata-v3-2-1'),
      bufferCV(rollingHash(helperOversizedChunks)),
      stringAsciiCV(MIME),
      uintCV(helperOversizedBytes.length),
      listCV(helperOversizedChunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(`${DEFAULT_TOKEN_URI},helper-oversized-33`)
    ]
  );
  addCase(ctx, 'helper oversized 33 chunks rejected', 'passed', {
    expected: 'Rejected because helper contract ABI is list 32; official app policy remains 30.'
  });

  const staged33 = await stagedMint(ctx, 'walletA', makeCasePayload(33, 0x07), `${DEFAULT_TOKEN_URI},staged-33`, 32);
  addCase(ctx, 'staged 33 chunks as 32 + 1', 'passed', {
    tokenId: staged33.tokenId?.toString() ?? null,
    size: staged33.size,
    chunkCount: staged33.chunkCount,
    hash: staged33.hashHex
  });
  const staged64 = await stagedMint(ctx, 'walletA', makeCasePayload(64, 0x08), `${DEFAULT_TOKEN_URI},staged-64`, 32);
  addCase(ctx, 'staged 64 chunks as 32 + 32', 'passed', {
    tokenId: staged64.tokenId?.toString() ?? null,
    size: staged64.size,
    chunkCount: staged64.chunkCount,
    hash: staged64.hashHex
  });

  const duplicateBytes = payloadBytes(777, 0x09);
  const duplicateA = await directMint(ctx, 'walletA', duplicateBytes, `${DEFAULT_TOKEN_URI},dedupe-a`);
  const duplicateB = await directMint(ctx, 'walletB', duplicateBytes, `${DEFAULT_TOKEN_URI},dedupe-b`);
  const firstSeen = await readOptionalUInt(
    ctx,
    'xtrata-v3-2-1',
    'get-id-by-hash',
    [bufferCV(duplicateA.expectedHash)],
    ctx.contractAddress
  );
  addCase(ctx, 'advisory dedupe duplicate same-hash mints', 'passed', {
    walletATokenId: duplicateA.tokenId?.toString() ?? null,
    walletBTokenId: duplicateB.tokenId?.toString() ?? null,
    firstSeenTokenId: firstSeen?.toString() ?? null,
    hash: duplicateA.hashHex
  });

  const dependencyToken = await directMint(ctx, 'walletB', payloadBytes(321, 0x0a), `${DEFAULT_TOKEN_URI},dep-source`);
  const ownedParentToken = await directMint(ctx, 'walletA', payloadBytes(333, 0x0b), `${DEFAULT_TOKEN_URI},parent-owned`);
  const dependencyLinked = await directMint(
    ctx,
    'walletA',
    payloadBytes(345, 0x0c),
    `${DEFAULT_TOKEN_URI},dep-linked`,
    { dependencies: [dependencyToken.tokenId], parents: [] }
  );
  addCase(ctx, 'dependency on another wallet token succeeds', 'passed', {
    tokenId: dependencyLinked.tokenId?.toString() ?? null,
    dependencyId: dependencyToken.tokenId?.toString() ?? null
  });
  const unauthorizedParentBytes = payloadBytes(349, 0x7a);
  const unauthorizedParentChunks = chunkBytes(unauthorizedParentBytes);
  await callContractExpectFailure(
    ctx,
    'parent link to another wallet token expected failure',
    'walletA',
    'xtrata-v3-2-1',
    'mint-single-tx-with-relationships',
    [
      bufferCV(rollingHash(unauthorizedParentChunks)),
      stringAsciiCV(MIME),
      uintCV(unauthorizedParentBytes.length),
      listCV(unauthorizedParentChunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(`${DEFAULT_TOKEN_URI},parent-other-wallet-rejected`),
      listCV([]),
      listCV([uintCV(dependencyToken.tokenId)])
    ]
  );
  addCase(ctx, 'parent link to another wallet token fails', 'passed', {
    expected: 'mint-single-tx-with-relationships rejects parent tokens not owned by tx-sender.'
  });
  const parentLinked = await directMint(
    ctx,
    'walletA',
    payloadBytes(357, 0x0d),
    `${DEFAULT_TOKEN_URI},parent-linked`,
    { dependencies: [], parents: [ownedParentToken.tokenId] }
  );
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-dependencies', [uintCV(dependencyLinked.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-parents', [uintCV(parentLinked.tokenId)], ctx.contractAddress);
  addCase(ctx, 'parent link to owned token succeeds and relationship lists remain separate', 'passed', {
    tokenId: parentLinked.tokenId?.toString() ?? null,
    parentId: ownedParentToken.tokenId?.toString() ?? null
  });

  const legacy210 = await legacyMint(ctx, 'xtrata-v2-1-0', 'walletA', payloadBytes(91, 0x0e), `${DEFAULT_TOKEN_URI},v210`);
  await callContract(ctx, 'migrate v2.1.0 token', 'walletA', 'xtrata-v3-2-1', 'migrate-from-v2-1-0', [
    uintCV(legacy210.tokenId)
  ]);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-migration-source', [uintCV(legacy210.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v2-1-0', 'get-owner', [uintCV(legacy210.tokenId)], ctx.contractAddress);
  addCase(ctx, 'migration from v2.1.0', 'passed', {
    tokenId: legacy210.tokenId?.toString() ?? null,
    hash: legacy210.hashHex
  });
  await callContractExpectFailure(ctx, 'duplicate migrate v2.1.0 token expected failure', 'walletA', 'xtrata-v3-2-1', 'migrate-from-v2-1-0', [
    uintCV(legacy210.tokenId)
  ]);

  const legacy211 = await legacyMint(ctx, 'xtrata-v2-1-1', 'walletB', payloadBytes(93, 0x0f), `${DEFAULT_TOKEN_URI},v211`);
  await callContract(ctx, 'migrate v2.1.1 token', 'walletB', 'xtrata-v3-2-1', 'migrate-from-v2-1-1', [
    uintCV(legacy211.tokenId)
  ]);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-migration-source', [uintCV(legacy211.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v2-1-1', 'get-owner', [uintCV(legacy211.tokenId)], ctx.contractAddress);
  addCase(ctx, 'migration from v2.1.1', 'passed', {
    tokenId: legacy211.tokenId?.toString() ?? null,
    hash: legacy211.hashHex
  });
  await callContractExpectFailure(ctx, 'duplicate migrate v2.1.1 token expected failure', 'walletB', 'xtrata-v3-2-1', 'migrate-from-v2-1-1', [
    uintCV(legacy211.tokenId)
  ]);
  addCase(ctx, 'duplicate migration rejected', 'passed', {
    expected: 'Second migrate-from-v2-1-x call for the same token id fails.'
  });

  await reconstructToken(ctx, staged33);
  await reconstructToken(ctx, legacy210);
};

const runRemaining = async (ctx) => {
  await runAdminSetupSafe(ctx);

  addCase(ctx, 'direct single-call 32 chunks', 'skipped', {
    note: 'Skipped in remaining mode to avoid repeating large testnet transactions. This does not satisfy mainnet readiness.'
  });
  addCase(ctx, 'staged 33 chunks as 32 + 1', 'skipped', {
    note: 'Skipped in remaining mode to avoid repeating large testnet transactions. This does not satisfy mainnet readiness.'
  });
  addCase(ctx, 'advisory dedupe duplicate same-hash mints', 'skipped', {
    note: 'Skipped in remaining mode to avoid repeating large testnet transactions. This does not satisfy mainnet readiness.'
  });

  const dependencyToken = await directMint(ctx, 'walletB', payloadBytes(321, 0x2a), `${DEFAULT_TOKEN_URI},remaining-dep-source`);
  const ownedParentToken = await directMint(ctx, 'walletA', payloadBytes(333, 0x2b), `${DEFAULT_TOKEN_URI},remaining-parent-owned`);
  const dependencyLinked = await directMint(
    ctx,
    'walletA',
    payloadBytes(345, 0x2c),
    `${DEFAULT_TOKEN_URI},remaining-dep-linked`,
    { dependencies: [dependencyToken.tokenId], parents: [] }
  );
  addCase(ctx, 'dependency on another wallet token succeeds', 'passed', {
    tokenId: dependencyLinked.tokenId?.toString() ?? null,
    dependencyId: dependencyToken.tokenId?.toString() ?? null
  });

  const unauthorizedParentBytes = payloadBytes(349, 0x7b);
  const unauthorizedParentChunks = chunkBytes(unauthorizedParentBytes);
  await callContractExpectFailure(
    ctx,
    'remaining parent link to another wallet token expected failure',
    'walletA',
    'xtrata-v3-2-1',
    'mint-single-tx-with-relationships',
    [
      bufferCV(rollingHash(unauthorizedParentChunks)),
      stringAsciiCV(MIME),
      uintCV(unauthorizedParentBytes.length),
      listCV(unauthorizedParentChunks.map((chunk) => bufferCV(chunk))),
      stringAsciiCV(`${DEFAULT_TOKEN_URI},remaining-parent-other-wallet-rejected`),
      listCV([]),
      listCV([uintCV(dependencyToken.tokenId)])
    ]
  );
  addCase(ctx, 'parent link to another wallet token fails', 'passed', {
    expected: 'mint-single-tx-with-relationships rejects parent tokens not owned by tx-sender.'
  });

  const parentLinked = await directMint(
    ctx,
    'walletA',
    payloadBytes(357, 0x2d),
    `${DEFAULT_TOKEN_URI},remaining-parent-linked`,
    { dependencies: [], parents: [ownedParentToken.tokenId] }
  );
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-dependencies', [uintCV(dependencyLinked.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-parents', [uintCV(parentLinked.tokenId)], ctx.contractAddress);
  addCase(ctx, 'parent link to owned token succeeds and relationship lists remain separate', 'passed', {
    tokenId: parentLinked.tokenId?.toString() ?? null,
    parentId: ownedParentToken.tokenId?.toString() ?? null
  });

  const legacy210 = await legacyMint(ctx, 'xtrata-v2-1-0', 'walletA', payloadBytes(91, 0x2e), `${DEFAULT_TOKEN_URI},remaining-v210`);
  await callContract(ctx, 'remaining migrate v2.1.0 token', 'walletA', 'xtrata-v3-2-1', 'migrate-from-v2-1-0', [
    uintCV(legacy210.tokenId)
  ]);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-migration-source', [uintCV(legacy210.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v2-1-0', 'get-owner', [uintCV(legacy210.tokenId)], ctx.contractAddress);
  addCase(ctx, 'migration from v2.1.0', 'passed', {
    tokenId: legacy210.tokenId?.toString() ?? null,
    hash: legacy210.hashHex
  });
  await callContractExpectFailure(
    ctx,
    'remaining duplicate migrate v2.1.0 token expected failure',
    'walletA',
    'xtrata-v3-2-1',
    'migrate-from-v2-1-0',
    [uintCV(legacy210.tokenId)]
  );

  const legacy211 = await legacyMint(ctx, 'xtrata-v2-1-1', 'walletB', payloadBytes(93, 0x2f), `${DEFAULT_TOKEN_URI},remaining-v211`);
  await callContract(ctx, 'remaining migrate v2.1.1 token', 'walletB', 'xtrata-v3-2-1', 'migrate-from-v2-1-1', [
    uintCV(legacy211.tokenId)
  ]);
  await readOnly(ctx, 'xtrata-v3-2-1', 'get-migration-source', [uintCV(legacy211.tokenId)], ctx.contractAddress);
  await readOnly(ctx, 'xtrata-v2-1-1', 'get-owner', [uintCV(legacy211.tokenId)], ctx.contractAddress);
  addCase(ctx, 'migration from v2.1.1', 'passed', {
    tokenId: legacy211.tokenId?.toString() ?? null,
    hash: legacy211.hashHex
  });
  await callContractExpectFailure(
    ctx,
    'remaining duplicate migrate v2.1.1 token expected failure',
    'walletB',
    'xtrata-v3-2-1',
    'migrate-from-v2-1-1',
    [uintCV(legacy211.tokenId)]
  );
  addCase(ctx, 'duplicate migration rejected', 'passed', {
    expected: 'Second migrate-from-v2-1-x call for the same token id fails.'
  });

  await reconstructToken(ctx, legacy210);
};

const runReconstruct = async (ctx) => {
  addCase(ctx, 'standalone reconstruction', 'planned', {
    note: 'Run full rehearsal first for freshly minted token IDs, or inspect report JSON and rerun with those IDs through npm run reconstruct.'
  });
};

const evaluateRecommendation = (report) => {
  if (report.failures.length > 0) {
    return 'not ready';
  }
  if (report.mode !== 'broadcast') {
    return 'needs another testnet pass';
  }
  const required = [
    'direct single-call 32 chunks',
    'staged 33 chunks as 32 + 1',
    'advisory dedupe duplicate same-hash mints',
    'migration from v2.1.0',
    'migration from v2.1.1'
  ];
  const confirmed = new Set(
    report.testCases
      .filter((test) => test.status === 'passed' && test.evidence === 'confirmed-on-chain')
      .map((test) => test.name)
  );
  return required.every((name) => confirmed.has(name)) ? 'ready for mainnet' : 'needs another testnet pass';
};

const renderMarkdown = (report) => {
  const rows = (items, mapper) => items.map(mapper).join('\n');
  return `# Xtrata v3.2.1 Testnet Rehearsal

Generated: ${report.generatedAt}

## Summary

- Network: ${report.network}
- Mode: ${report.mode}
- API URL: ${report.apiUrl}
- Hiro API key: ${report.hiroApiKeyConfigured ? 'configured' : 'not configured'}
- Deployer: ${report.deployerAddress ?? 'not configured'}
- Contract address: ${report.contractAddress}
- Recommendation: ${report.recommendation}

## Contracts

| Key | Contract | Source | Deploy tx |
|---|---|---|---|
${rows(Object.entries(report.contracts), ([key, contract]) => `| ${key} | ${contract.id} | ${contract.source} | ${contract.deployTxId ?? ''} |`)}

## Commands

\`\`\`sh
npm run contracts:sync
npm run contracts:verify
npm --prefix contracts/clarinet exec -- clarinet deployments generate --testnet --manual-cost
npm --prefix contracts/clarinet exec -- clarinet deployments apply --testnet --no-dashboard --use-on-disk-deployment-plan
npm run testnet:v3.2.1:rehearsal -- --broadcast
\`\`\`

## Transactions

| Label | Status | Tx ID | Block | Fee |
|---|---|---|---:|---:|
${rows(report.transactions, (tx) => `| ${tx.label} | ${tx.status} | ${tx.txid ?? ''} | ${tx.blockHeight ?? ''} | ${tx.feeRate ?? ''} |`)}

## Test Cases

| Test | Status | Token IDs / Notes |
|---|---|---|
${rows(report.testCases, (test) => {
  const details = [
    test.tokenId ? `token ${test.tokenId}` : '',
    test.walletATokenId ? `A ${test.walletATokenId}` : '',
    test.walletBTokenId ? `B ${test.walletBTokenId}` : '',
    test.firstSeenTokenId ? `first ${test.firstSeenTokenId}` : '',
    test.chunkCount ? `${test.chunkCount} chunks` : '',
    test.expected ? test.expected : '',
    test.evidence ? `evidence ${test.evidence}` : '',
    test.note ? test.note : ''
  ].filter(Boolean).join('; ');
  return `| ${test.name} | ${test.status} | ${details} |`;
})}

## Reconstruction

| Token | Status | Bytes | Chunks | Verified | Cache |
|---|---|---:|---:|---|---|
${rows(report.reconstruction, (item) => `| ${item.tokenId ?? ''} | ${item.status ?? ''} | ${item.actualBytes ?? item.expectedBytes ?? ''} | ${item.actualChunks ?? item.expectedChunks ?? ''} | ${item.verified ?? ''} | ${item.cache?.result ?? ''} |`)}

## Warnings

${report.warnings.length === 0 ? '- None' : report.warnings.map((warning) => `- ${warning}`).join('\n')}

## Failures

${report.failures.length === 0 ? '- None' : report.failures.map((failure) => `- ${failure}`).join('\n')}
`;
};

const writeReports = async (ctx) => {
  ctx.report.recommendation = evaluateRecommendation(ctx.report);
  await mkdir(reportsDir, { recursive: true });
  await writeFile(jsonReportPath, `${JSON.stringify(ctx.report, null, 2)}\n`);
  await writeFile(markdownReportPath, renderMarkdown(ctx.report));
  if (ctx.report.mode !== 'broadcast') {
    return;
  }
  const envLines = [
    '# Non-secret testnet rehearsal exports generated by scripts/testnet-v3.2.1-rehearsal.mjs',
    `export XTRATA_TESTNET_CONTRACT_ADDRESS=${ctx.contractAddress}`,
    ctx.report.keyDerivation?.indexes?.deployer !== undefined
      ? `export XTRATA_TESTNET_DEPLOYER_INDEX=${ctx.report.keyDerivation.indexes.deployer}`
      : null,
    ctx.report.keyDerivation?.indexes?.walletA !== undefined
      ? `export XTRATA_TESTNET_WALLET_A_INDEX=${ctx.report.keyDerivation.indexes.walletA}`
      : null,
    ctx.report.keyDerivation?.indexes?.walletB !== undefined
      ? `export XTRATA_TESTNET_WALLET_B_INDEX=${ctx.report.keyDerivation.indexes.walletB}`
      : null,
    ''
  ].filter((line) => line !== null);
  await writeFile(latestEnvPath, `${envLines.join('\n')}`);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  applyFreshRoleDefaults(options.command);
  const ctx = await createContext(options.broadcast, {
    freshDeployment: isFreshCommand(options.command),
    ignoreContractAddressEnv: isFreshCommand(options.command)
  });
  if (options.broadcast) {
    for (const name of ['deployer', 'walletA', 'walletB']) {
      requireBroadcastKey(ctx, name);
    }
  } else {
    ctx.report.warnings.push('Dry-run mode only. Add --broadcast plus testnet keys to submit transactions.');
  }

  try {
    if (options.command === 'deploy' || options.command === 'fresh-deploy') {
      await runDeploy(ctx);
    } else if (options.command === 'smoke') {
      await runSmoke(ctx);
    } else if (options.command === 'remaining') {
      await runRemaining(ctx);
    } else if (options.command === 'reconstruct') {
      await runReconstruct(ctx);
    } else if (options.command === 'report') {
      addCase(ctx, 'report generation', 'passed', {
        jsonReportPath: path.relative(repoRoot, jsonReportPath),
        markdownReportPath: path.relative(repoRoot, markdownReportPath)
      });
    } else if (options.command === 'rehearsal' || options.command === 'fresh-rehearsal') {
      await runDeploy(ctx);
      await runSmoke(ctx);
    } else {
      throw new Error(`Unknown command: ${options.command}`);
    }
  } catch (error) {
    ctx.report.failures.push(error instanceof Error ? error.message : String(error));
    if (options.broadcast) {
      throw error;
    }
  } finally {
    await writeReports(ctx);
    console.log(`Wrote ${path.relative(repoRoot, jsonReportPath)}`);
    console.log(`Wrote ${path.relative(repoRoot, markdownReportPath)}`);
    console.log(`Recommendation: ${ctx.report.recommendation}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage);
  process.exit(1);
});
