#!/usr/bin/env node
// Reference signing-message vector for XIP-001 §5.1 (off-chain / detached
// manifest authority). Deterministic (RFC 6979), low-S, recoverable.
//
//   message = "XIP-001-v1\n" || "manifest\n" || hex(manifestHash) || "\n"
//          || authority.type || "\n" || authority.address || "\n" || chainId
//   sig     = ECDSA-secp256k1( SHA-256(message) ), low-S, R||S||recId (65 bytes)
//
// manifestHash is computed with the `authority` field omitted (you cannot sign
// your own signature), here the XIP-001 §3.4 manifest.
//
// Run: node docs/xips/vectors/generate-signing.mjs

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { getAddressFromPublicKey, TransactionVersion } from '@stacks/transactions';

const hex = (b) => '0x' + Buffer.from(b).toString('hex');
const utf8 = (s) => new TextEncoder().encode(s);
const CORE = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3';

// RFC 8785 JCS for the restricted (ASCII/integer) profile.
const jcs = (obj) => utf8(stableStringify(obj));
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// Fixed test key (32 bytes of 0x11) — valid, < n.
const priv = Uint8Array.from(Buffer.from('11'.repeat(32), 'hex'));
const pub = secp.getPublicKey(priv, true); // compressed, 33 bytes
const pubHex = Buffer.from(pub).toString('hex');
const address = getAddressFromPublicKey(pubHex, TransactionVersion.Mainnet);

// Manifest hash with authority omitted = the §3.4 manifest.
const manifest = {
  standard: 'xip-001', specVersion: '1.0.0', type: 'collection',
  name: 'Example Collection', defaultContract: CORE,
  mapping: { type: 'explicit', items: [
    { inscriptionId: 359, order: 1 }, { inscriptionId: 360, order: 2 }
  ] }
};
const manifestHash = hex(sha256(jcs(manifest)));

const authorityType = 'creator';
const chainId = 'stacks-mainnet';
const message =
  'XIP-001-v1\n' +
  'manifest\n' +
  manifestHash.slice(2) + '\n' +
  authorityType + '\n' +
  address + '\n' +
  chainId;

const digest = sha256(utf8(message));
// canonical: true => low-S; der: false => 64-byte compact; recovered: true => recId.
const [compact, recId] = await secp.sign(digest, priv, {
  canonical: true, der: false, recovered: true
});
const signature = hex(Uint8Array.from([...compact, recId])); // 65 bytes, R||S||recId

// Verify the way a consumer must: recover the key, derive the address.
const recovered = secp.recoverPublicKey(digest, compact, recId, true); // compressed
const recoveredHex = Buffer.from(recovered).toString('hex');
const recoveredAddress = getAddressFromPublicKey(recoveredHex, TransactionVersion.Mainnet);
const ok =
  recoveredHex === pubHex &&
  recoveredAddress === address &&
  compact.length === 64 &&
  secp.verify(compact, digest, pub);

const out = {
  privateKey: hex(priv),
  publicKey: '0x' + pubHex,
  address,
  authorityType,
  chainId,
  manifestHash,
  message,                        // human-readable; \n are literal newlines
  messageHex: hex(utf8(message)), // exact bytes signed-over input
  digest: hex(digest),
  signature,                      // 0x R(32) || S(32) || recId(1)
  recId
};

console.log('XIP-001 §5.1 signing vector\n');
for (const [k, v] of Object.entries(out)) {
  if (k === 'message') { console.log('  message ='); console.log(v.split('\n').map((l) => '    | ' + l).join('\n')); }
  else console.log(`  ${k} = ${v}`);
}
console.log('\n  [' + (ok ? 'OK ' : 'BAD') + '] recovers to publicKey, derives to address, low-S, verifies');

const fs = await import('node:fs');
const dir = new URL('.', import.meta.url).pathname;
fs.writeFileSync(dir + 'signing-vectors.json', JSON.stringify(out, null, 2) + '\n');

process.exit(ok ? 0 : 1);
