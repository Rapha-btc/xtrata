export type MintWalletGuidanceContext = 'single' | 'collection' | 'resume';

const TITLE_BY_CONTEXT: Record<MintWalletGuidanceContext, string> = {
  single: 'Before inscribing',
  collection: 'Before collection minting',
  resume: 'Before resuming inscription'
};

export const buildMintWalletGuidanceMessage = (
  context: MintWalletGuidanceContext
) => {
  const title = TITLE_BY_CONTEXT[context];
  return [
    title,
    '',
    'Avoid Leather wallet for inscriptions. Use Xverse wallet for a better inscription experience.',
    'Check the fee suggested by your wallet and increase or decrease it manually to the correct amount before approving.',
    'If the wallet returns errors or the transaction fails, the most likely cause is that the fee is too low.',
    '',
    'Press OK to continue or Cancel to go back.'
  ].join('\n');
};

export const confirmMintWalletGuidance = (
  context: MintWalletGuidanceContext
) => {
  if (typeof globalThis.confirm !== 'function') {
    return true;
  }
  return globalThis.confirm(buildMintWalletGuidanceMessage(context));
};
