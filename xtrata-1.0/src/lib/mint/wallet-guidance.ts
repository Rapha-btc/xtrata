export type MintWalletGuidanceContext =
  | 'single'
  | 'collection-live'
  | 'collection-batch'
  | 'resume';

const TITLE_BY_CONTEXT: Record<MintWalletGuidanceContext, string> = {
  single: 'Before inscribing',
  'collection-live': 'Before collection minting',
  'collection-batch': 'Before collection minting',
  resume: 'Before resuming inscription'
};

const CANCEL_COPY_BY_CONTEXT: Record<
  MintWalletGuidanceContext,
  { statusMessage: string; logMessage: string }
> = {
  single: {
    statusMessage:
      'Inscription cancelled. Review the wallet guidance and fee settings before retrying.',
    logMessage: 'Inscription cancelled before wallet flow.'
  },
  'collection-live': {
    statusMessage:
      'Collection mint cancelled. Review the wallet guidance and fee settings before retrying.',
    logMessage: 'Collection mint cancelled before wallet flow.'
  },
  'collection-batch': {
    statusMessage:
      'Batch mint cancelled. Review the wallet guidance and fee settings before retrying.',
    logMessage: 'Batch mint cancelled before wallet flow.'
  },
  resume: {
    statusMessage:
      'Resume cancelled. Review the wallet guidance and fee settings before retrying.',
    logMessage: 'Resume cancelled before wallet flow.'
  }
};

export const buildMintWalletGuidanceMessage = (
  context: MintWalletGuidanceContext
) => {
  const title = TITLE_BY_CONTEXT[context];
  return [
    title,
    '',
    'Confirm the transaction details carefully before approving.',
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

export const getMintWalletGuidanceCancelCopy = (
  context: MintWalletGuidanceContext
) => CANCEL_COPY_BY_CONTEXT[context];

export const confirmMintWalletGuidanceOrAbort = (
  context: MintWalletGuidanceContext,
  handlers?: {
    setStatus?: (message: string) => void;
    appendLog?: (message: string) => void;
  }
) => {
  if (confirmMintWalletGuidance(context)) {
    return true;
  }
  const cancelCopy = getMintWalletGuidanceCancelCopy(context);
  handlers?.setStatus?.(cancelCopy.statusMessage);
  handlers?.appendLog?.(cancelCopy.logMessage);
  return false;
};
