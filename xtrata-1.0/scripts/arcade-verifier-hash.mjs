#!/usr/bin/env node
import tx from '@stacks/transactions';

const { createStacksPrivateKey, getPublicKey, publicKeyToString, hash160 } = tx;

const usage = () => {
  console.log(
    [
      'Usage:',
      '  node scripts/arcade-verifier-hash.mjs <private-key-hex>',
      '  ARCADE_SCORE_ATTESTATION_PRIVATE_KEY=<hex> node scripts/arcade-verifier-hash.mjs',
      '',
      'Notes:',
      '- Accepts 32-byte private key hex, with optional 0x prefix and optional trailing 01.',
      '- Outputs the compressed pubkey and hash160 (set this value via set-verifier-pubkey-hash).'
    ].join('\n')
  );
};

const normalizeHex = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const noPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed;
  if (!/^[0-9a-fA-F]+$/.test(noPrefix)) {
    throw new Error('Private key must be hex.');
  }
  return noPrefix.toLowerCase();
};

const toBytes = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
};

const toHex = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += Number(bytes[i]).toString(16).padStart(2, '0');
  }
  return out;
};

try {
  const input = process.argv[2] || process.env.ARCADE_SCORE_ATTESTATION_PRIVATE_KEY || '';
  if (!input) {
    usage();
    process.exit(1);
  }

  const normalized = normalizeHex(input);
  if (normalized.length !== 64 && normalized.length !== 66) {
    throw new Error('Private key must be 64 hex chars, or 66 with trailing 01 compression flag.');
  }

  const base = normalized.length === 66 ? normalized.slice(0, 64) : normalized;
  const compressedPrivateKey = createStacksPrivateKey(`${base}01`);
  const compressedPubKeyHex = publicKeyToString(getPublicKey(compressedPrivateKey));
  const verifierHashHex = toHex(hash160(toBytes(compressedPubKeyHex)));

  console.log(`Compressed pubkey: ${compressedPubKeyHex}`);
  console.log(`Verifier hash160: 0x${verifierHashHex}`);
  console.log(
    `Clarity arg: (some 0x${verifierHashHex})`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
