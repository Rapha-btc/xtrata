#!/usr/bin/env node
// Deploy xtrata-v3-2-3 to mainnet as Clarity 3 via the SDK.
//
// Why this script exists: Xverse (and the @stacks/connect popup flow) publish
// contracts at the network's latest Clarity version and ignore the
// clarityVersion hint. On mainnet that means Clarity 4, where `as-contract`
// no longer resolves, so the deploy aborts with
// "use of unresolved function 'as-contract'". This script pins
// ClarityVersion.Clarity3 explicitly so the deploy matches what clarinet check
// and the rest of the xtrata contracts use.
//
// Usage:
//   XTRATA_MAINNET_MNEMONIC="..."        node scripts/mainnet-v3.2.3-deploy.mjs            # dry run
//   XTRATA_MAINNET_MNEMONIC="..."        node scripts/mainnet-v3.2.3-deploy.mjs --broadcast
//   XTRATA_MAINNET_DEPLOYER_KEY="<hex>"  node scripts/mainnet-v3.2.3-deploy.mjs --broadcast
//
// Optional env:
//   XTRATA_MAINNET_FEE_USTX   fee in microSTX (default 750000 = 0.75 STX)
//   XTRATA_DEPLOYER           expected deployer address (default production deployer)
//   HIRO_API_KEY              used to avoid public rate limits

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { StacksMainnet, createApiKeyMiddleware, createFetchFn } from '@stacks/network';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import {
  AnchorMode,
  ClarityVersion,
  PostConditionMode,
  TransactionVersion,
  broadcastTransaction,
  getAddressFromPrivateKey,
  makeContractDeploy
} from '@stacks/transactions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const CONTRACT_NAME = process.env.XTRATA_CONTRACT_NAME ?? 'xtrata-v3-2-3';
const SOURCE_PATH = path.join(repoRoot, 'contracts/live/xtrata-v3.2.3.clar');
const EXPECTED_DEPLOYER =
  process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const FEE_USTX = BigInt(process.env.XTRATA_MAINNET_FEE_USTX ?? '750000');
const BROADCAST = process.argv.includes('--broadcast');

const buildNetwork = () => {
  const apiKey = process.env.HIRO_API_KEY?.trim();
  if (!apiKey) return new StacksMainnet();
  const fetchFn = createFetchFn(createApiKeyMiddleware({ apiKey }));
  return new StacksMainnet({ fetchFn });
};

const resolveDeployerKey = async () => {
  const explicit = process.env.XTRATA_MAINNET_DEPLOYER_KEY?.trim();
  if (explicit) return explicit;
  const rawMnemonic = process.env.XTRATA_MAINNET_MNEMONIC;
  if (!rawMnemonic || !rawMnemonic.trim()) {
    throw new Error(
      'Set XTRATA_MAINNET_DEPLOYER_KEY (hex private key) or XTRATA_MAINNET_MNEMONIC to sign the deploy.'
    );
  }
  // Normalise: collapse any whitespace (tabs, newlines, double spaces) to single
  // spaces, trim, and lowercase, so a copy/paste artefact doesn't fail BIP39.
  const mnemonic = rawMnemonic.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
  const wordCount = mnemonic.split(' ').filter(Boolean).length;
  if (wordCount !== 12 && wordCount !== 24) {
    throw new Error(
      `Mnemonic has ${wordCount} words after cleanup; expected 12 or 24. ` +
        'Check for missing/extra words or stray characters in the pasted value.'
    );
  }

  // The xtrata deployer (SP3J…743X) is the 4th wallet, derived account-hardened
  // at m/44'/5757'/3'/0/0 (Xverse style) — confirmed via scripts/find-derivation.mjs.
  // wallet-sdk's default m/44'/5757'/0'/0/{i} does NOT reach it.
  const accountIndex = Number(process.env.XTRATA_MAINNET_ACCOUNT_INDEX ?? '3');
  const seed = await mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive(`m/44'/5757'/${accountIndex}'/0/0`);
  if (!node.privateKey) {
    throw new Error('Failed to derive a private key for the deployer path.');
  }
  // Stacks compressed key = 33-byte private key (raw 32 bytes + 0x01 suffix).
  return Buffer.from(node.privateKey).toString('hex') + '01';
};

const main = async () => {
  const codeBody = await readFile(SOURCE_PATH, 'utf8');
  const network = buildNetwork();
  const senderKey = await resolveDeployerKey();
  const deployerAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);

  if (deployerAddress !== EXPECTED_DEPLOYER) {
    throw new Error(
      `Derived deployer ${deployerAddress} does not match expected ${EXPECTED_DEPLOYER}. ` +
        'Check the mnemonic / key or set XTRATA_DEPLOYER.'
    );
  }

  console.log('Contract name :', CONTRACT_NAME);
  console.log('Source        :', SOURCE_PATH, `(${codeBody.length} bytes)`);
  console.log('Deployer      :', deployerAddress);
  console.log('ClarityVersion:', 'Clarity3 (pinned)');
  console.log('Fee (uSTX)    :', FEE_USTX.toString());
  console.log('Mode          :', BROADCAST ? 'BROADCAST' : 'dry run (pass --broadcast to send)');

  const tx = await makeContractDeploy({
    contractName: CONTRACT_NAME,
    codeBody,
    senderKey,
    network,
    clarityVersion: ClarityVersion.Clarity3,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    fee: FEE_USTX
  });

  console.log('Built txid    :', tx.txid());

  if (!BROADCAST) {
    console.log('\nDry run complete. Re-run with --broadcast to publish.');
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

main().catch((error) => {
  console.error('\nDeploy error:', error.message);
  process.exit(1);
});
