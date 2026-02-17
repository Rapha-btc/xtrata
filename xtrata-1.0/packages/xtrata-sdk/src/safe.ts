import type { PostCondition } from '@stacks/transactions';
import {
  buildMintBeginStxPostConditions,
  buildSealStxPostConditions,
  resolveCollectionBeginSpendCapMicroStx,
  resolveMintBeginSpendCapMicroStx,
  resolveSealSpendCapMicroStx
} from './mint.js';

export type SafeMintBundle = {
  beginCapMicroStx: bigint | null;
  sealCapMicroStx: bigint | null;
  totalCapMicroStx: bigint | null;
  beginPostConditions: PostCondition[] | null;
  sealPostConditions: PostCondition[] | null;
  summaryLines: string[];
  warnings: string[];
};

type SafeCoreMintParams = {
  sender?: string | null;
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  additionalCapMicroStx?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

type SafeCollectionMintParams = {
  sender?: string | null;
  mintPrice: bigint | null;
  activePhaseMintPrice?: bigint | null;
  additionalCapMicroStx?: bigint | null;
  protocolFeeMicroStx: bigint | null;
  totalChunks: number | bigint | null;
};

const formatMicroStxBigInt = (value: bigint | null) => {
  if (value === null || value < 0n) {
    return 'Unknown';
  }
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, '0');
  return `${whole.toString()}.${fraction} STX`;
};

const toTotalCap = (beginCap: bigint | null, sealCap: bigint | null) => {
  if (beginCap === null || sealCap === null) {
    return null;
  }
  return beginCap + sealCap;
};

const getBundleWarnings = (params: {
  sender?: string | null;
  beginCapMicroStx: bigint | null;
  sealCapMicroStx: bigint | null;
}) => {
  const warnings: string[] = [];
  if (!params.sender?.trim()) {
    warnings.push('Sender address is missing; post-conditions cannot be built yet.');
  }
  if (params.beginCapMicroStx === null) {
    warnings.push('Begin spend cap could not be calculated from current inputs.');
  }
  if (params.sealCapMicroStx === null) {
    warnings.push('Seal spend cap could not be calculated from current inputs.');
  }
  return warnings;
};

const buildSummaryLines = (params: {
  beginCapMicroStx: bigint | null;
  sealCapMicroStx: bigint | null;
  totalCapMicroStx: bigint | null;
}) => [
  `Begin max spend: ${formatMicroStxBigInt(params.beginCapMicroStx)}`,
  `Seal max spend: ${formatMicroStxBigInt(params.sealCapMicroStx)}`,
  `Max combined spend: ${formatMicroStxBigInt(params.totalCapMicroStx)}`
];

export const createCoreMintSafetyBundle = (
  params: SafeCoreMintParams
): SafeMintBundle => {
  const beginCapMicroStx = resolveMintBeginSpendCapMicroStx({
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice,
    additionalCapMicroStx: params.additionalCapMicroStx
  });
  const sealCapMicroStx = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  const totalCapMicroStx = toTotalCap(beginCapMicroStx, sealCapMicroStx);

  return {
    beginCapMicroStx,
    sealCapMicroStx,
    totalCapMicroStx,
    beginPostConditions: buildMintBeginStxPostConditions({
      sender: params.sender,
      mintPrice: params.mintPrice,
      activePhaseMintPrice: params.activePhaseMintPrice,
      additionalCapMicroStx: params.additionalCapMicroStx
    }),
    sealPostConditions: buildSealStxPostConditions({
      sender: params.sender,
      protocolFeeMicroStx: params.protocolFeeMicroStx,
      totalChunks: params.totalChunks
    }),
    summaryLines: buildSummaryLines({
      beginCapMicroStx,
      sealCapMicroStx,
      totalCapMicroStx
    }),
    warnings: getBundleWarnings({
      sender: params.sender,
      beginCapMicroStx,
      sealCapMicroStx
    })
  };
};

export const createCollectionMintSafetyBundle = (
  params: SafeCollectionMintParams
): SafeMintBundle => {
  const beginCapMicroStx = resolveCollectionBeginSpendCapMicroStx({
    mintPrice: params.mintPrice,
    activePhaseMintPrice: params.activePhaseMintPrice,
    additionalCapMicroStx: params.additionalCapMicroStx,
    protocolFeeMicroStx: params.protocolFeeMicroStx
  });
  const sealCapMicroStx = resolveSealSpendCapMicroStx({
    protocolFeeMicroStx: params.protocolFeeMicroStx,
    totalChunks: params.totalChunks
  });
  const totalCapMicroStx = toTotalCap(beginCapMicroStx, sealCapMicroStx);

  return {
    beginCapMicroStx,
    sealCapMicroStx,
    totalCapMicroStx,
    beginPostConditions:
      beginCapMicroStx === null
        ? null
        : buildMintBeginStxPostConditions({
            sender: params.sender,
            mintPrice: beginCapMicroStx
          }),
    sealPostConditions: buildSealStxPostConditions({
      sender: params.sender,
      protocolFeeMicroStx: params.protocolFeeMicroStx,
      totalChunks: params.totalChunks
    }),
    summaryLines: buildSummaryLines({
      beginCapMicroStx,
      sealCapMicroStx,
      totalCapMicroStx
    }),
    warnings: getBundleWarnings({
      sender: params.sender,
      beginCapMicroStx,
      sealCapMicroStx
    })
  };
};

export type GuidedMintStepId = 'begin' | 'chunks' | 'seal' | 'complete';

export type GuidedMintStepStatus =
  | 'blocked'
  | 'ready'
  | 'in-progress'
  | 'done'
  | 'failed';

export type GuidedMintLight = 'red' | 'amber' | 'green' | 'slate';

export type GuidedMintStep = {
  id: GuidedMintStepId;
  label: string;
  status: GuidedMintStepStatus;
  light: GuidedMintLight;
  detail: string;
};

export type GuidedMintFlow = {
  steps: GuidedMintStep[];
  nextAction: string;
  progressPercent: number;
};

export type GuidedMintFlowParams = {
  beginConfirmed: boolean;
  uploadedChunkBatches: number;
  totalChunkBatches: number;
  sealConfirmed: boolean;
  failedStep?: 'begin' | 'chunks' | 'seal' | null;
};

const toLight = (status: GuidedMintStepStatus): GuidedMintLight => {
  if (status === 'done') {
    return 'green';
  }
  if (status === 'failed') {
    return 'red';
  }
  if (status === 'blocked') {
    return 'slate';
  }
  return 'amber';
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export const buildGuidedMintFlow = (
  params: GuidedMintFlowParams
): GuidedMintFlow => {
  const totalChunkBatches = Math.max(0, Math.floor(params.totalChunkBatches));
  const uploadedChunkBatches = Math.max(0, Math.floor(params.uploadedChunkBatches));
  const chunkComplete =
    totalChunkBatches === 0 || uploadedChunkBatches >= totalChunkBatches;

  const beginStatus: GuidedMintStepStatus = params.failedStep === 'begin'
    ? 'failed'
    : params.beginConfirmed
      ? 'done'
      : 'ready';

  const chunksStatus: GuidedMintStepStatus = params.failedStep === 'chunks'
    ? 'failed'
    : !params.beginConfirmed
      ? 'blocked'
      : chunkComplete
        ? 'done'
        : uploadedChunkBatches > 0
          ? 'in-progress'
          : 'ready';

  const sealStatus: GuidedMintStepStatus = params.failedStep === 'seal'
    ? 'failed'
    : !params.beginConfirmed || !chunkComplete
      ? 'blocked'
      : params.sealConfirmed
        ? 'done'
        : 'ready';

  const completeStatus: GuidedMintStepStatus = params.sealConfirmed
    ? 'done'
    : 'blocked';

  const steps: GuidedMintStep[] = [
    {
      id: 'begin',
      label: 'Begin mint',
      status: beginStatus,
      light: toLight(beginStatus),
      detail: params.beginConfirmed
        ? 'Begin transaction confirmed.'
        : 'Start the mint session and lock spend limits.'
    },
    {
      id: 'chunks',
      label: 'Upload chunks',
      status: chunksStatus,
      light: toLight(chunksStatus),
      detail: chunkComplete
        ? 'All chunk batches uploaded.'
        : `${uploadedChunkBatches}/${totalChunkBatches} chunk batches uploaded.`
    },
    {
      id: 'seal',
      label: 'Seal inscription',
      status: sealStatus,
      light: toLight(sealStatus),
      detail: params.sealConfirmed
        ? 'Seal transaction confirmed.'
        : 'Finalize mint and assign inscription ID.'
    },
    {
      id: 'complete',
      label: 'Complete',
      status: completeStatus,
      light: toLight(completeStatus),
      detail: params.sealConfirmed
        ? 'Mint flow finished successfully.'
        : 'Flow is not complete yet.'
    }
  ];

  const beginProgress = params.beginConfirmed ? 30 : 0;
  const chunkProgress =
    totalChunkBatches === 0
      ? params.beginConfirmed
        ? 40
        : 0
      : Math.min(40, (uploadedChunkBatches / totalChunkBatches) * 40);
  const sealProgress = params.sealConfirmed ? 30 : 0;
  const progressPercent = clampPercent(beginProgress + chunkProgress + sealProgress);

  const nextAction =
    params.failedStep === 'begin'
      ? 'Retry begin transaction.'
      : params.failedStep === 'chunks'
        ? 'Retry failed chunk batch upload.'
        : params.failedStep === 'seal'
          ? 'Retry seal transaction.'
          : !params.beginConfirmed
            ? 'Submit begin transaction.'
            : !chunkComplete
              ? 'Continue chunk uploads.'
              : !params.sealConfirmed
                ? 'Submit seal transaction.'
                : 'Mint complete.';

  return {
    steps,
    nextAction,
    progressPercent
  };
};

export type MintFailureType =
  | 'user-cancelled'
  | 'post-condition'
  | 'bad-nonce'
  | 'insufficient-funds'
  | 'network'
  | 'contract'
  | 'unknown';

export type MintRecoveryGuide = {
  failureType: MintFailureType;
  failedStep: Exclude<GuidedMintStepId, 'complete'>;
  canResume: boolean;
  retryable: boolean;
  recommendedAction: string;
};

export type MintRecoveryGuideParams = {
  errorMessage?: string | null;
  attemptedStep?: Exclude<GuidedMintStepId, 'complete'> | null;
  beginConfirmed: boolean;
  uploadedChunkBatches: number;
  totalChunkBatches: number;
  sealConfirmed: boolean;
};

const classifyMintFailure = (message: string): MintFailureType => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('user rejected') ||
    normalized.includes('request cancel') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled')
  ) {
    return 'user-cancelled';
  }
  if (normalized.includes('post-condition')) {
    return 'post-condition';
  }
  if (
    normalized.includes('bad nonce') ||
    normalized.includes('conflicting nonce') ||
    normalized.includes('nonce')
  ) {
    return 'bad-nonce';
  }
  if (
    normalized.includes('insufficient funds') ||
    normalized.includes('not enough funds')
  ) {
    return 'insufficient-funds';
  }
  if (
    normalized.includes('network error') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('socket')
  ) {
    return 'network';
  }
  if (
    normalized.includes('contract error') ||
    normalized.includes('vm error') ||
    normalized.includes('(err u')
  ) {
    return 'contract';
  }
  return 'unknown';
};

const resolveFailedStep = (params: MintRecoveryGuideParams) => {
  if (params.attemptedStep) {
    return params.attemptedStep;
  }
  if (!params.beginConfirmed) {
    return 'begin' as const;
  }
  const safeTotal = Math.max(0, Math.floor(params.totalChunkBatches));
  const safeUploaded = Math.max(0, Math.floor(params.uploadedChunkBatches));
  const chunkComplete = safeTotal === 0 || safeUploaded >= safeTotal;
  if (!chunkComplete) {
    return 'chunks' as const;
  }
  if (!params.sealConfirmed) {
    return 'seal' as const;
  }
  return 'seal' as const;
};

export const buildMintRecoveryGuide = (
  params: MintRecoveryGuideParams
): MintRecoveryGuide => {
  const failedStep = resolveFailedStep(params);
  const failureType = classifyMintFailure(params.errorMessage ?? '');
  const canResume = failedStep !== 'begin' && params.beginConfirmed;
  const retryable = failureType !== 'contract' && failureType !== 'post-condition';

  let recommendedAction = 'Retry the failed step.';
  if (failureType === 'user-cancelled') {
    recommendedAction =
      failedStep === 'begin'
        ? 'Reopen wallet and confirm begin transaction.'
        : 'Reopen wallet and retry only the cancelled step.';
  } else if (failureType === 'post-condition') {
    recommendedAction =
      'Refresh fee/price values, rebuild workflow post-conditions, then retry this step.';
  } else if (failureType === 'bad-nonce') {
    recommendedAction =
      'Wait for pending transactions to settle, refresh nonce, then retry this step.';
  } else if (failureType === 'insufficient-funds') {
    recommendedAction =
      'Top up wallet balance for spend cap + gas, then retry this step.';
  } else if (failureType === 'network') {
    recommendedAction =
      'Retry after network stabilizes. Keep current progress and continue from failed step.';
  } else if (failureType === 'contract') {
    recommendedAction =
      'Inspect contract error code, fix input/config issue, and retry only the failed step.';
  }

  return {
    failureType,
    failedStep,
    canResume,
    retryable,
    recommendedAction
  };
};
