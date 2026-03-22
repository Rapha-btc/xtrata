const { mnemonicToSeedSync } = require('@scure/bip39');
const { HDKey } = require('@scure/bip32');

const DERIVATION_PATH = "m/44'/5757'/0'/0/0";
const DEFAULT_MNEMONIC =
  'capital process seat brief true sketch error desk arena salt maple three grape endless vessel science feel such electric turn angle cat right boring';

function deriveKeyFromMnemonic(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(DERIVATION_PATH);
  return `${Buffer.from(child.privateKey).toString('hex')}01`;
}

function getAgent27SignerSource() {
  if (process.env.SENDER_KEY?.trim()) {
    return { type: 'env-sender-key', senderKey: process.env.SENDER_KEY.trim() };
  }
  if (process.env.XTRATA_MNEMONIC?.trim()) {
    return {
      type: 'env-mnemonic',
      senderKey: deriveKeyFromMnemonic(process.env.XTRATA_MNEMONIC.trim())
    };
  }
  return {
    type: 'agent27-default-mnemonic',
    senderKey: deriveKeyFromMnemonic(DEFAULT_MNEMONIC)
  };
}

function deriveAgent27SenderKey() {
  return getAgent27SignerSource().senderKey;
}

function hasAgent27Signer() {
  try {
    return Boolean(deriveAgent27SenderKey());
  } catch {
    return false;
  }
}

module.exports = {
  DERIVATION_PATH,
  deriveAgent27SenderKey,
  getAgent27SignerSource,
  hasAgent27Signer
};
