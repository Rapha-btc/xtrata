#!/usr/bin/env node
// Batch-migrate legacy xtrata tokens into the live v3 core (xtrata-v3-2-3).
//
// Each migration is one contract call (migrate-from-v1 / migrate-from-v2-1-0).
// This script enumerates the source core's tokens, keeps only the ones the
// deployer owns AND that do not already exist on v3 (id collisions fail with
// ERR-DUPLICATE), then migrates them in nonce-sequenced batches with a
// confirmation wait between batches.
//
// Usage (dry run lists candidates; add --broadcast to send):
//   XTRATA_MAINNET_MNEMONIC="..." node scripts/mainnet-v3.2.3-migrate-batch.mjs v1
//   XTRATA_MAINNET_MNEMONIC="..." node scripts/mainnet-v3.2.3-migrate-batch.mjs v1 --broadcast
//   ... v2 --broadcast --limit 50 --batch-size 20
//
// Env: XTRATA_MAINNET_MNEMONIC (or XTRATA_MAINNET_DEPLOYER_KEY), HIRO_API_KEY,
//      XTRATA_MAINNET_ACCOUNT_INDEX (default 3), XTRATA_MAINNET_FEE_USTX (default 60000).

import process from 'node:process';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { StacksMainnet, createApiKeyMiddleware, createFetchFn } from '@stacks/network';
import {
  AnchorMode,
  PostConditionMode,
  TransactionVersion,
  broadcastTransaction,
  callReadOnlyFunction,
  cvToJSON,
  getAddressFromPrivateKey,
  makeContractCall,
  uintCV
} from '@stacks/transactions';

const DEPLOYER = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const FEE_USTX = BigInt(process.env.XTRATA_MAINNET_FEE_USTX ?? '60000');
const API = (process.env.XTRATA_MAINNET_API_URL ?? 'https://api.hiro.so').replace(/\/$/, '');
const CORE = 'xtrata-v3-2-3';

const SOURCES = {
  v1: { name: 'xtrata-v1-1-1', fn: 'migrate-from-v1' },
  v2: { name: 'xtrata-v2-1-0', fn: 'migrate-from-v2-1-0' }
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const sourceKey = positional[0];
const BROADCAST = flags.has('--broadcast');
const getOpt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : dflt;
};
const LIMIT = Number(getOpt('--limit', '0')) || Infinity;
const BATCH_SIZE = Number(getOpt('--batch-size', '20'));

const apiKey = process.env.HIRO_API_KEY?.trim();
const network = apiKey
  ? new StacksMainnet({ fetchFn: createFetchFn(createApiKeyMiddleware({ apiKey })) })
  : new StacksMainnet();
const headers = apiKey ? { 'x-api-key': apiKey } : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const deployerKey = async () => {
  const explicit = process.env.XTRATA_MAINNET_DEPLOYER_KEY?.trim();
  if (explicit) return explicit;
  const raw = process.env.XTRATA_MAINNET_MNEMONIC;
  if (!raw?.trim()) throw new Error('Set XTRATA_MAINNET_MNEMONIC or XTRATA_MAINNET_DEPLOYER_KEY.');
  const mnemonic = raw.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
  const idx = Number(process.env.XTRATA_MAINNET_ACCOUNT_INDEX ?? '3');
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(mnemonic));
  const node = root.derive(`m/44'/5757'/${idx}'/0/0`);
  if (!node.privateKey) throw new Error('Failed to derive deployer key.');
  return Buffer.from(node.privateKey).toString('hex') + '01';
};

const readOnly = async (contractName, functionName, functionArgs = []) => {
  const res = await callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs,
    senderAddress: DEPLOYER,
    network
  });
  return cvToJSON(res);
};

const uintValue = (json) => {
  // unwrap (ok uint) / (response ...) shapes
  let v = json;
  if (v && typeof v === 'object' && 'value' in v) v = v.value;
  if (v && typeof v === 'object' && 'value' in v) v = v.value;
  return v == null ? null : Number(v);
};

// Owner principal string, or null if the token doesn't exist / has no owner.
const ownerOf = async (contractName, id) => {
  try {
    const json = await readOnly(contractName, 'get-owner', [uintCV(BigInt(id))]);
    // get-owner -> (ok (optional principal))
    let v = json?.value; // ok value
    if (v && typeof v === 'object' && 'value' in v) v = v.value; // optional value
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) v = v.value;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
};

const nextNonce = async () => {
  const res = await fetch(`${API}/extended/v1/address/${DEPLOYER}/nonces`, { headers });
  const json = await res.json();
  return Number(json.possible_next_nonce);
};

const lastExecutedNonce = async () => {
  const res = await fetch(`${API}/extended/v1/address/${DEPLOYER}/nonces`, { headers });
  const json = await res.json();
  return Number(json.last_executed_tx_nonce);
};

const enumerateSourceIds = async (source) => {
  if (source === SOURCES.v1) {
    const last = uintValue(await readOnly(source.name, 'get-last-token-id'));
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  // v2: use the minted-id list to skip gaps.
  const count = uintValue(await readOnly(source.name, 'get-minted-count'));
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const json = await readOnly(source.name, 'get-minted-id', [uintCV(BigInt(i))]);
    const id = uintValue(json);
    if (id != null) ids.push(id);
  }
  return ids;
};

const main = async () => {
  const source = SOURCES[sourceKey];
  if (!source) {
    console.log('Usage: node scripts/mainnet-v3.2.3-migrate-batch.mjs <v1|v2> [--broadcast] [--limit=N] [--batch-size=K]');
    process.exit(sourceKey ? 1 : 0);
  }
  const senderKey = await deployerKey();
  const sender = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
  if (sender !== DEPLOYER) throw new Error(`Derived ${sender} != ${DEPLOYER}; check XTRATA_MAINNET_ACCOUNT_INDEX.`);

  console.log(`Source        : ${source.name} -> ${CORE}::${source.fn}`);
  console.log(`Deployer      : ${sender}`);
  console.log('Scanning source tokens…');
  const allIds = await enumerateSourceIds(source);
  console.log(`  ${allIds.length} token(s) exist on ${source.name}.`);

  console.log('Filtering to owned + not-yet-on-v3 (this reads the chain)…');
  const eligible = [];
  let owned = 0;
  let collisions = 0;
  for (const id of allIds) {
    const srcOwner = await ownerOf(source.name, id);
    if (srcOwner !== DEPLOYER) continue; // only migrate tokens you own
    owned += 1;
    const v3Owner = await ownerOf(CORE, id);
    if (v3Owner !== null) { collisions += 1; continue; } // already on v3 -> would ERR-DUPLICATE
    eligible.push(id);
    if (eligible.length >= LIMIT) break;
  }
  console.log(`  owned by you   : ${owned}`);
  console.log(`  already on v3  : ${collisions} (skipped)`);
  console.log(`  eligible       : ${eligible.length}${LIMIT !== Infinity ? ` (capped at --limit=${LIMIT})` : ''}`);
  if (eligible.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }
  console.log('  ids:', eligible.slice(0, 60).join(', ') + (eligible.length > 60 ? ' …' : ''));
  console.log(`Fee per tx     : ${FEE_USTX} uSTX  ·  est. total: ${(FEE_USTX * BigInt(eligible.length))} uSTX (+ protocol begin-fee per token)`);
  console.log(`Mode           : ${BROADCAST ? 'BROADCAST' : 'dry run (add --broadcast to send)'}`);
  if (!BROADCAST) {
    console.log('\nDry run complete. Re-run with --broadcast to migrate.');
    return;
  }

  let base = await nextNonce();
  const sent = [];
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}: ids ${batch[0]}..${batch[batch.length - 1]} (nonces ${base}..${base + batch.length - 1})`);
    for (let j = 0; j < batch.length; j += 1) {
      const id = batch[j];
      const nonce = base + j;
      const tx = await makeContractCall({
        contractAddress: DEPLOYER,
        contractName: CORE,
        functionName: source.fn,
        functionArgs: [uintCV(BigInt(id))],
        senderKey,
        network,
        nonce: BigInt(nonce),
        fee: FEE_USTX,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow
      });
      const res = await broadcastTransaction(tx, network);
      if (res.error) {
        console.log(`  #${id} (nonce ${nonce}) FAILED: ${res.error} ${res.reason ?? ''}`);
      } else {
        sent.push({ id, txid: res.txid || res });
        console.log(`  #${id} -> ${res.txid || res}`);
      }
    }
    const target = base + batch.length - 1;
    process.stdout.write(`  waiting for nonce ${target} to confirm`);
    while ((await lastExecutedNonce()) < target) {
      process.stdout.write('.');
      await sleep(15000);
    }
    process.stdout.write(' done\n');
    base = await nextNonce();
  }
  console.log(`\nMigrated ${sent.length}/${eligible.length} token(s) into ${CORE}.`);
};

main().catch((e) => { console.error('\nError:', e.message); process.exit(1); });
