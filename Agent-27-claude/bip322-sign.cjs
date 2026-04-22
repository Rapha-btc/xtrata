const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');
const { sha256 } = require('@noble/hashes/sha2.js');
const { secp256k1 } = require('@noble/curves/secp256k1.js');

const mnemonic = "oppose bracket divide save voyage dinner olympic thumb ozone opinion into sister sort escape throw excuse cycle alcohol ring toward eyebrow near appear buffalo";
const message = "Claim code request for bc1q2knwqf77vp9mhru20hqnrxg00hgzmrpjxxsw0l";

const seed = mnemonicToSeedSync(mnemonic);
const hdkey = HDKey.fromMasterSeed(seed);
const child = hdkey.derive("m/84'/0'/0'/0/0");
const privKey = child.privateKey;
const pubKey = Buffer.from(child.publicKey);

// BIP-322 tagged hash
function taggedHash(tag, data) {
  const tagBytes = Buffer.from(tag, 'utf8');
  const tagHash = Buffer.from(sha256(tagBytes));
  const combined = Buffer.concat([tagHash, tagHash, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
  return Buffer.from(sha256(combined));
}

// Compact sig (64 bytes) to DER
function compactToDER(compact) {
  const r = compact.slice(0, 32);
  const s = compact.slice(32, 64);
  function encodeInt(x) {
    // strip leading zeros but keep at least 1 byte
    let i = 0; while (i < x.length - 1 && x[i] === 0) i++;
    x = x.slice(i);
    // prepend 0x00 if high bit set
    if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0x00]), x]);
    return Buffer.concat([Buffer.from([0x02, x.length]), x]);
  }
  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const body = Buffer.concat([rEnc, sEnc]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

const msgBytes = Buffer.from(message, 'utf8');
const msgHash = taggedHash("BIP0322-signed-message", msgBytes);

const sigCompact = Buffer.from(secp256k1.sign(msgHash, privKey, { lowS: true }));
const sigDER = compactToDER(sigCompact);
const sigWithSigHash = Buffer.concat([sigDER, Buffer.from([0x01])]);

function varint(n) {
  if (n < 0xfd) return Buffer.from([n]);
  const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b;
}

const witness = Buffer.concat([
  varint(2),
  varint(sigWithSigHash.length), sigWithSigHash,
  varint(pubKey.length), pubKey
]);

console.log(witness.toString('base64'));
