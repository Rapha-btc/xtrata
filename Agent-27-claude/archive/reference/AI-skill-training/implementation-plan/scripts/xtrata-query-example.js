/**
 * Xtrata Query Example — Read inscription metadata, content, and enumerate tokens
 *
 * Usage:
 *   node xtrata-query-example.js meta <token-id>
 *   node xtrata-query-example.js owner <token-id>
 *   node xtrata-query-example.js content <token-id> [output-file]
 *   node xtrata-query-example.js count
 *   node xtrata-query-example.js fee
 *
 * Requirements:
 *   npm install @stacks/transactions @stacks/network
 */

import { writeFileSync } from 'fs';
import {
  callReadOnlyFunction,
  uintCV,
  listCV,
  bufferCV,
  cvToJSON
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const SENDER = CONTRACT_ADDRESS; // Any valid address works for read-only calls

const network = new StacksMainnet();

async function readOnly(functionName, functionArgs = []) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: SENDER,
    network
  });
  return cvToJSON(result);
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function showMeta(tokenId) {
  const json = await readOnly('get-inscription-meta', [uintCV(BigInt(tokenId))]);
  if (!json.value) {
    console.log(`Token #${tokenId} not found`);
    return;
  }
  const m = json.value.value;
  console.log(`Token #${tokenId}:`);
  console.log(`  Owner:       ${m.owner.value}`);
  console.log(`  Creator:     ${m.creator.value}`);
  console.log(`  MIME type:   ${m['mime-type'].value}`);
  console.log(`  Total size:  ${m['total-size'].value} bytes`);
  console.log(`  Chunks:      ${m['total-chunks'].value}`);
  console.log(`  Sealed:      ${m.sealed.value}`);
  console.log(`  Hash:        ${m['final-hash'].value}`);

  // Also fetch token URI
  const uriJson = await readOnly('get-token-uri', [uintCV(BigInt(tokenId))]);
  const uri = uriJson.value?.value?.value ?? '(none)';
  console.log(`  Token URI:   ${uri}`);

  // Check dependencies
  const depsJson = await readOnly('get-dependencies', [uintCV(BigInt(tokenId))]);
  const deps = depsJson.value?.map(d => d.value) ?? [];
  if (deps.length > 0) {
    console.log(`  Dependencies: [${deps.join(', ')}]`);
  }
}

async function showOwner(tokenId) {
  const json = await readOnly('get-owner', [uintCV(BigInt(tokenId))]);
  const owner = json.value?.value?.value ?? null;
  if (owner) {
    console.log(`Token #${tokenId} owner: ${owner}`);
  } else {
    console.log(`Token #${tokenId} not found`);
  }
}

async function readContent(tokenId, outputFile) {
  const metaJson = await readOnly('get-inscription-meta', [uintCV(BigInt(tokenId))]);
  if (!metaJson.value) {
    console.log(`Token #${tokenId} not found`);
    return;
  }

  const m = metaJson.value.value;
  const totalChunks = parseInt(m['total-chunks'].value);
  const mimeType = m['mime-type'].value;

  console.log(`Reading ${totalChunks} chunks for token #${tokenId} (${mimeType})...`);

  const allChunks = [];
  for (let start = 0; start < totalChunks; start += 50) {
    const end = Math.min(start + 50, totalChunks);
    const indexes = [];
    for (let i = start; i < end; i++) {
      indexes.push(uintCV(BigInt(i)));
    }

    const json = await readOnly('get-chunk-batch', [
      uintCV(BigInt(tokenId)),
      listCV(indexes)
    ]);

    for (const item of json.value) {
      if (item.value) {
        // Hex string → Buffer (strip 0x prefix)
        const hex = item.value.value;
        const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
        allChunks.push(Buffer.from(cleanHex, 'hex'));
      }
    }

    console.log(`  Read chunks ${start}-${end - 1}`);
  }

  const content = Buffer.concat(allChunks);
  console.log(`Total: ${content.length} bytes`);

  if (outputFile) {
    writeFileSync(outputFile, content);
    console.log(`Written to: ${outputFile}`);
  } else {
    // For text types, print to console
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      console.log('\n--- Content ---');
      console.log(content.toString('utf-8'));
    } else {
      console.log('Binary content — specify output file to save');
    }
  }
}

async function showCount() {
  const countJson = await readOnly('get-minted-count', []);
  const lastIdJson = await readOnly('get-last-token-id', []);

  console.log(`Minted count: ${countJson.value.value}`);
  console.log(`Last token ID: ${lastIdJson.value.value}`);
}

async function showFee() {
  const feeJson = await readOnly('get-fee-unit', []);
  const feeUnit = BigInt(feeJson.value.value);
  console.log(`Fee unit: ${feeUnit} microSTX (${Number(feeUnit) / 1_000_000} STX)`);

  const pausedJson = await readOnly('is-paused', []);
  console.log(`Paused: ${pausedJson.value.value}`);

  const adminJson = await readOnly('get-admin', []);
  console.log(`Admin: ${adminJson.value.value}`);

  const recipientJson = await readOnly('get-royalty-recipient', []);
  console.log(`Royalty recipient: ${recipientJson.value.value}`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  meta: () => showMeta(args[0]),
  owner: () => showOwner(args[0]),
  content: () => readContent(args[0], args[1]),
  count: () => showCount(),
  fee: () => showFee()
};

if (!command || !commands[command]) {
  console.log('Commands:');
  console.log('  meta <token-id>                  Show inscription metadata');
  console.log('  owner <token-id>                 Show token owner');
  console.log('  content <token-id> [output-file] Read inscription content');
  console.log('  count                            Show minted count and last ID');
  console.log('  fee                              Show current fee and contract state');
  process.exit(1);
}

commands[command]().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
