import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { base64 } from "@scure/base";

const mnemonic = "oppose bracket divide save voyage dinner olympic thumb ozone opinion into sister sort escape throw excuse cycle alcohol ring toward eyebrow near appear buffalo";
const message = "Claim code request for bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l";

const seed = mnemonicToSeedSync(mnemonic);
const hdkey = HDKey.fromMasterSeed(seed);
const child = hdkey.derive("m/84'/0'/0'/0/0");
const privKey = child.privateKey;
const pubKey = child.publicKey;

// BIP-322 simple signing
// scriptPubKey for the address
const network = btc.NETWORK;
const p2wpkhScript = btc.p2wpkh(pubKey, network);

// BIP-322 tag hash
function taggedHash(tag, data) {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const combined = new Uint8Array(tagHash.length * 2 + data.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(data, tagHash.length * 2);
  return sha256(combined);
}

// Message hash for BIP-322
const msgBytes = new TextEncoder().encode(message);
const msgHash = taggedHash("BIP0322-signed-message", msgBytes);

// Sign
const sig = secp256k1.sign(msgHash, privKey, { lowS: true });
const sigBytes = sig.toDERRawBytes();

// Build witness
// For simple signing: witness = [signature, pubkey]
const sigWithHashType = new Uint8Array(sigBytes.length + 1);
sigWithHashType.set(sigBytes);
sigWithHashType[sigBytes.length] = 0x01; // SIGHASH_ALL

// Encode as base64
const witnessEncoded = encodeWitness([sigWithHashType, pubKey]);
console.log("BIP322 Signature:", base64.encode(witnessEncoded));

function encodeWitness(items) {
  // varint encoding
  function varint(n) {
    if (n < 0xfd) return new Uint8Array([n]);
    if (n <= 0xffff) {
      const b = new Uint8Array(3);
      b[0] = 0xfd; b[1] = n & 0xff; b[2] = (n >> 8) & 0xff;
      return b;
    }
    throw new Error("too large");
  }
  const parts = [varint(items.length)];
  for (const item of items) {
    parts.push(varint(item.length));
    parts.push(item);
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; }
  return result;
}
