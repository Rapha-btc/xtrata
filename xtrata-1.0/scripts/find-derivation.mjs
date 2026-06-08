#!/usr/bin/env node
// Probe: find which derivation path/index yields the xtrata deployer address.
// Prints only path templates + indexes + addresses. Never prints private keys.
import process from 'node:process';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';

const TARGET = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const raw = process.env.XTRATA_MAINNET_MNEMONIC;
if (!raw) { console.error('Set XTRATA_MAINNET_MNEMONIC'); process.exit(1); }
const mnemonic = raw.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();

const seed = await mnemonicToSeed(mnemonic);
const root = HDKey.fromMasterSeed(seed);

const templates = [
  (i) => `m/44'/5757'/0'/0/${i}`,   // wallet-sdk / SIP default
  (i) => `m/44'/5757'/${i}'/0/0`,   // account-hardened (Xverse style)
  (i) => `m/44'/5757'/${i}'/0/${i}`,
  (i) => `m/5757'/${i}'/0/0`,
  (i) => `m/888'/0'/${i}'`,
  (i) => `m/44'/5757'/0'/${i}/0`
];

const addrFor = (node) => {
  if (!node.privateKey) return null;
  const hex = Buffer.from(node.privateKey).toString('hex') + '01'; // compressed
  try { return getAddressFromPrivateKey(hex, TransactionVersion.Mainnet); }
  catch { return null; }
};

let found = false;
for (const tmpl of templates) {
  for (let i = 0; i <= 10; i += 1) {
    const p = tmpl(i);
    let node;
    try { node = root.derive(p); } catch { continue; }
    const a = addrFor(node);
    if (a === TARGET) {
      console.log(`>>> MATCH  path=${p}  index=${i}  -> ${a}`);
      found = true;
    } else if (i <= 4) {
      console.log(`    ${p}  -> ${a}`);
    }
  }
}
if (!found) console.log('\nNo match in tried templates. Tell me the wallet (Xverse/Leather) so I can add its exact path.');
