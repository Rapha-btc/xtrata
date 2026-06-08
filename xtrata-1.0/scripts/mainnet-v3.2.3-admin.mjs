#!/usr/bin/env node
// Wallet-independent admin/migration calls for the xtrata-v3.2.3 mainnet handover.
// Uses the same SDK + deployer derivation (m/44'/5757'/3'/0/0) as the deploy
// script, so the ceremony doesn't depend on wallet behaviour.
//
// Subcommands (dry run by default; add --broadcast to send):
//   pause-legacy            set-paused(true) on xtrata-v2-1-0  (freeze old core)
//   set-next-id <n>         set-next-id(n) on xtrata-v3-2-3    (MUST be before any mint/migrate)
//   set-royalty [addr]      set-royalty-recipient on v3-2-3    (default: deployer)
//   unpause                 set-paused(false) on xtrata-v3-2-3 (open public minting)
//   migrate-v1 <id>         migrate-from-v1(id) on v3-2-3
//   migrate-v2 <id>         migrate-from-v2-1-0(id) on v3-2-3
//
// Env: XTRATA_MAINNET_MNEMONIC (or XTRATA_MAINNET_DEPLOYER_KEY), HIRO_API_KEY,
//      XTRATA_MAINNET_ACCOUNT_INDEX (default 3), XTRATA_MAINNET_FEE_USTX (default 5000).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { StacksMainnet, createApiKeyMiddleware, createFetchFn } from '@stacks/network';
import {
  AnchorMode,
  PostConditionMode,
  TransactionVersion,
  boolCV,
  bufferCV,
  broadcastTransaction,
  getAddressFromPrivateKey,
  listCV,
  makeContractCall,
  principalCV,
  stringAsciiCV,
  uintCV
} from '@stacks/transactions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(repoRoot, 'reports/mainnet-v3.2.3-handover.json');
const hexToBytes = (hex) => Uint8Array.from(Buffer.from(String(hex).replace(/^0x/, ''), 'hex'));

const DEPLOYER = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const FEE_USTX = BigInt(process.env.XTRATA_MAINNET_FEE_USTX ?? '50000');
const CORE = 'xtrata-v3-2-3';
const LEGACY_V2 = 'xtrata-v2-1-0';

const args = process.argv.slice(2).filter((a) => a !== '--broadcast');
const BROADCAST = process.argv.includes('--broadcast');
const cmd = args[0];

const buildNetwork = () => {
  const apiKey = process.env.HIRO_API_KEY?.trim();
  if (!apiKey) return new StacksMainnet();
  return new StacksMainnet({ fetchFn: createFetchFn(createApiKeyMiddleware({ apiKey })) });
};

const deployerKey = async () => {
  const explicit = process.env.XTRATA_MAINNET_DEPLOYER_KEY?.trim();
  if (explicit) return explicit;
  const raw = process.env.XTRATA_MAINNET_MNEMONIC;
  if (!raw?.trim()) throw new Error('Set XTRATA_MAINNET_MNEMONIC or XTRATA_MAINNET_DEPLOYER_KEY.');
  const mnemonic = raw.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
  const accountIndex = Number(process.env.XTRATA_MAINNET_ACCOUNT_INDEX ?? '3');
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(mnemonic));
  const node = root.derive(`m/44'/5757'/${accountIndex}'/0/0`);
  if (!node.privateKey) throw new Error('Failed to derive deployer key.');
  return Buffer.from(node.privateKey).toString('hex') + '01';
};

const PLANS = {
  'pause-legacy': () => ({ contractName: LEGACY_V2, functionName: 'set-paused', functionArgs: [boolTrue()] }),
  'unpause': () => ({ contractName: CORE, functionName: 'set-paused', functionArgs: [boolFalse()] }),
  'set-next-id': (a) => ({ contractName: CORE, functionName: 'set-next-id', functionArgs: [uintCV(reqUint(a[1], 'next-id'))] }),
  'set-royalty': (a) => ({ contractName: CORE, functionName: 'set-royalty-recipient', functionArgs: [principalCV(a[1] ?? DEPLOYER)] }),
  'migrate-v1': (a) => ({ contractName: CORE, functionName: 'migrate-from-v1', functionArgs: [uintCV(reqUint(a[1], 'token-id'))] }),
  'migrate-v2': (a) => ({ contractName: CORE, functionName: 'migrate-from-v2-1-0', functionArgs: [uintCV(reqUint(a[1], 'token-id'))] }),
  'mint-announcement': () => {
    let report;
    try {
      report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    } catch {
      throw new Error(`Could not read ${REPORT_PATH}. Run "npm run mainnet:v3.2.3:preflight" first (regenerates chunks from the current announcement text).`);
    }
    const ann = report.announcement;
    if (!ann?.chunkHex?.length) throw new Error('Report has no announcement chunks; re-run the preflight.');
    return {
      contractName: CORE,
      functionName: 'mint-single-tx',
      functionArgs: [
        bufferCV(hexToBytes(ann.finalHashHex)),
        stringAsciiCV(ann.mime),
        uintCV(BigInt(ann.bytes)),
        listCV(ann.chunkHex.map((c) => bufferCV(hexToBytes(c)))),
        stringAsciiCV(ann.tokenUri)
      ],
      note: `announcement: ${ann.bytes} bytes, ${ann.chunkHex.length} chunk(s), mime=${ann.mime}`
    };
  }
};

function boolTrue() { return boolCV(true); }
function boolFalse() { return boolCV(false); }
function reqUint(v, name) {
  if (v === undefined) throw new Error(`Missing <${name}> argument.`);
  if (!/^\d+$/.test(v)) throw new Error(`<${name}> must be a non-negative integer, got "${v}".`);
  return BigInt(v);
}

const main = async () => {
  if (!cmd || !PLANS[cmd]) {
    console.log('Usage: node scripts/mainnet-v3.2.3-admin.mjs <cmd> [arg] [--broadcast]');
    console.log('Commands:', Object.keys(PLANS).join(', '));
    process.exit(cmd ? 1 : 0);
  }
  const plan = PLANS[cmd](args);
  const network = buildNetwork();
  const senderKey = await deployerKey();
  const sender = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);
  if (sender !== DEPLOYER) {
    throw new Error(`Derived sender ${sender} != expected ${DEPLOYER}. Check XTRATA_MAINNET_ACCOUNT_INDEX.`);
  }

  console.log('Command   :', cmd, args.slice(1).join(' '));
  console.log('Call      :', `${DEPLOYER}.${plan.contractName}::${plan.functionName}`);
  if (plan.note) console.log('Detail    :', plan.note);
  console.log('Sender    :', sender);
  console.log('Fee (uSTX):', FEE_USTX.toString());
  console.log('Mode      :', BROADCAST ? 'BROADCAST' : 'dry run (add --broadcast to send)');

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: plan.contractName,
    functionName: plan.functionName,
    functionArgs: plan.functionArgs,
    senderKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: FEE_USTX
  });
  console.log('Built txid:', tx.txid());

  if (!BROADCAST) {
    console.log('\nDry run complete. Re-run with --broadcast to send.');
    return;
  }
  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} ${result.reason ?? ''} ${JSON.stringify(result.reason_data ?? {})}`);
  }
  const txid = result.txid || result;
  console.log('\nBroadcast OK. txid:', txid);
  console.log(`Explorer: https://explorer.hiro.so/txid/0x${String(txid).replace(/^0x/, '')}?chain=mainnet`);
};

main().catch((e) => { console.error('\nError:', e.message); process.exit(1); });
