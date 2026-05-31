#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONTRACT_ID = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-1';
const DEFAULT_FALLBACK_CONTRACT_IDS = [
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
];

const usage = `Usage:
  npm run reconstruct -- <token-id> [output-file] [options]

Options:
  --contract-id <id>           Contract to read first.
  --fallback-contract-id <id>  Fallback contract. May be repeated or comma-separated.
  --api-url <url>              Stacks API base URL. May be repeated or comma-separated.
  --sender <principal>         Read-only sender context. Defaults to contract address.
  --max-nodes <count>          Dependency traversal limit. Defaults to 128.
  --no-strict                  Do not throw on hash mismatch.
  --help                       Show this message.

Default contract:
  ${DEFAULT_CONTRACT_ID}

Default fallback chain:
  ${DEFAULT_FALLBACK_CONTRACT_IDS.join('\n  ')}
`;

const splitList = (value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseArgs = (argv) => {
  const options = {
    contractId: DEFAULT_CONTRACT_ID,
    fallbackContractIds: [...DEFAULT_FALLBACK_CONTRACT_IDS],
    apiBaseUrls: [],
    senderAddress: null,
    maxNodes: 128,
    strict: true,
    help: false,
    positional: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('--')) {
        throw new Error(`${value} requires a value.`);
      }
      index += 1;
      return nextValue;
    };

    if (value === '--help' || value === '-h') {
      options.help = true;
    } else if (value === '--contract-id') {
      options.contractId = next().trim();
    } else if (value === '--fallback-contract-id') {
      options.fallbackContractIds.push(...splitList(next()));
    } else if (value === '--api-url') {
      options.apiBaseUrls.push(...splitList(next()));
    } else if (value === '--sender') {
      options.senderAddress = next().trim();
    } else if (value === '--max-nodes') {
      const parsed = Number.parseInt(next(), 10);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error('--max-nodes must be a positive integer.');
      }
      options.maxNodes = parsed;
    } else if (value === '--no-strict') {
      options.strict = false;
    } else if (value.startsWith('--')) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      options.positional.push(value);
    }
  }

  return options;
};

const parseTokenId = (value) => {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('A non-negative integer token ID is required.');
  }
  return BigInt(value);
};

const contractAddressFromId = (contractId) => {
  const [address, contractName] = contractId.split('.');
  if (!address || !contractName) {
    throw new Error(`Invalid contract ID: ${contractId}`);
  }
  return address;
};

const unique = (values) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
};

const loadPublicPackages = async () => {
  try {
    const [sdk, reconstruction] = await Promise.all([
      import('../packages/xtrata-sdk/dist/simple.js'),
      import('../packages/xtrata-reconstruction/dist/index.js')
    ]);
    return { sdk, reconstruction };
  } catch (error) {
    throw new Error(
      `Unable to load built SDK packages. Run npm run sdk:build first. ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const [tokenIdArg, outputFile] = options.positional;
  const tokenId = parseTokenId(tokenIdArg);
  const contractIds = unique([options.contractId, ...options.fallbackContractIds]);
  const senderAddress = options.senderAddress ?? contractAddressFromId(options.contractId);
  const { sdk, reconstruction } = await loadPublicPackages();

  const clients = contractIds.map((contractId) =>
    sdk.createXtrataReadClient({
      contractId,
      senderAddress,
      apiBaseUrls: options.apiBaseUrls
    })
  );

  const sources = sdk.createXtrataReconstructionSources(clients[0], clients.slice(1));
  const result = await reconstruction.reconstructXtrataInscription({
    tokenId,
    sources,
    strict: options.strict,
    maxNodes: options.maxNodes
  });

  const summary = {
    tokenId: result.tokenId.toString(),
    requestedContractId: options.contractId,
    attemptedContractIds: contractIds,
    metaSourceContractId: result.diagnostics.metaSourceId,
    chunkSourceContractId: result.diagnostics.chunkSourceId,
    fallbackUsed: result.diagnostics.fallbackUsed,
    mimeType: result.mimeType,
    bytes: result.bytes.length,
    chunkCount: result.chunkCount.toString(),
    tokenUri: result.tokenUri,
    finalHash: result.verification.expectedHashHex,
    actualHash: result.verification.actualHashHex,
    verified: result.verification.ok,
    dependencyCount: result.dependencies.nodes.length,
    dependencyTraversalTruncated: result.dependencies.truncated,
    readMode: result.diagnostics.readMode,
    batchReads: result.diagnostics.batchReads,
    singleReads: result.diagnostics.singleReads,
    batchFallbacks: result.diagnostics.batchFallbacks,
    missingChunks: result.diagnostics.missingChunks.map((index) => index.toString()),
    readErrors: result.diagnostics.errors.map((error) => ({
      sourceId: error.sourceId,
      operation: error.operation,
      index: error.index?.toString(),
      indexes: error.indexes?.map((index) => index.toString()),
      message: error.message
    }))
  };

  console.log(JSON.stringify(summary, null, 2));

  if (outputFile) {
    const outputPath = path.resolve(outputFile);
    await writeFile(outputPath, Buffer.from(result.bytes));
    console.log(`Wrote ${result.bytes.length} bytes to ${outputPath}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage);
  process.exit(1);
});
