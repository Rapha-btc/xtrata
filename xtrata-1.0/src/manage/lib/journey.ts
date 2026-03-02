export type JourneyStepId =
  | 'connect-wallet'
  | 'create-draft'
  | 'upload-artwork'
  | 'lock-staged-assets'
  | 'deploy-contract'
  | 'configure-launch'
  | 'prepare-live-page'
  | 'publish-backend'
  | 'unpause-contract'
  | 'monitor-launch';

export type JourneyPanelKey =
  | 'collection-list'
  | 'deploy-wizard'
  | 'asset-staging'
  | 'publish-ops'
  | 'launch-controls'
  | 'collection-settings';

export type JourneyStepStatus =
  | 'locked'
  | 'todo'
  | 'in-progress'
  | 'blocked'
  | 'done';

export type JourneyMintType = 'standard' | 'pre-inscribed' | null;

export type JourneySignals = {
  walletConnected: boolean;
  hasActiveCollection: boolean;
  mintType: JourneyMintType;
  activeAssetCount: number;
  deployPricingLockPresent: boolean;
  deployReady: boolean;
  deployPending: boolean;
  launchMintPriceConfigured: boolean;
  launchMaxSupplyConfigured: boolean;
  hasLivePageCover: boolean;
  hasLivePageDescription: boolean;
  published: boolean;
  unpaused: boolean | null;
  uploadReadinessReason: string | null;
  deployReadinessReason: string | null;
};

type JourneyStepDefinition = {
  id: JourneyStepId;
  title: string;
  summary: string;
  panelKey: JourneyPanelKey | null;
};

export type JourneyStepState = JourneyStepDefinition & {
  status: JourneyStepStatus;
  lockedReason: string | null;
  blockedReason: string | null;
  doneNote: string | null;
};

export const JOURNEY_STEPS: JourneyStepDefinition[] = [
  {
    id: 'connect-wallet',
    title: 'Connect wallet',
    summary: 'Connect and confirm artist-wallet access.',
    panelKey: null
  },
  {
    id: 'create-draft',
    title: 'Create drop draft',
    summary: 'Name the drop and create a draft ID.',
    panelKey: 'deploy-wizard'
  },
  {
    id: 'upload-artwork',
    title: 'Upload artwork',
    summary: 'Stage the collection files.',
    panelKey: 'asset-staging'
  },
  {
    id: 'lock-staged-assets',
    title: 'Lock staged assets',
    summary: 'Save deploy pricing lock before contract deploy.',
    panelKey: 'asset-staging'
  },
  {
    id: 'deploy-contract',
    title: 'Deploy contract',
    summary: 'Submit and confirm on-chain deploy.',
    panelKey: 'deploy-wizard'
  },
  {
    id: 'configure-launch',
    title: 'Configure launch settings',
    summary: 'Set launch controls and verify contract state.',
    panelKey: 'launch-controls'
  },
  {
    id: 'prepare-live-page',
    title: 'Prepare live page',
    summary: 'Set cover art and collection description.',
    panelKey: 'publish-ops'
  },
  {
    id: 'publish-backend',
    title: 'Publish collection',
    summary: 'Set manager state to live.',
    panelKey: 'publish-ops'
  },
  {
    id: 'unpause-contract',
    title: 'Unpause contract',
    summary: 'Open minting to collectors.',
    panelKey: 'launch-controls'
  },
  {
    id: 'monitor-launch',
    title: 'Monitor launch',
    summary: 'Track reservations and handle recovery actions.',
    panelKey: 'publish-ops'
  }
];

export const JOURNEY_STATUS_LABELS: Record<JourneyStepStatus, string> = {
  locked: 'Locked',
  todo: 'To do',
  'in-progress': 'In progress',
  blocked: 'Needs attention',
  done: 'Done'
};

const requiresStandardMint = (mintType: JourneyMintType) =>
  mintType !== 'pre-inscribed';

const getDoneState = (
  stepId: JourneyStepId,
  signals: JourneySignals
): { done: boolean; doneNote: string | null } => {
  const standardMint = requiresStandardMint(signals.mintType);
  switch (stepId) {
    case 'connect-wallet':
      return { done: signals.walletConnected, doneNote: null };
    case 'create-draft':
      return { done: signals.hasActiveCollection, doneNote: null };
    case 'upload-artwork':
      if (!standardMint) {
        return {
          done: true,
          doneNote: 'Skipped for pre-inscribed flow.'
        };
      }
      return {
        done: signals.activeAssetCount > 0,
        doneNote: null
      };
    case 'lock-staged-assets':
      if (!standardMint) {
        return {
          done: true,
          doneNote: 'Skipped for pre-inscribed flow.'
        };
      }
      return {
        done: signals.deployPricingLockPresent,
        doneNote: null
      };
    case 'deploy-contract':
      return { done: signals.deployReady, doneNote: null };
    case 'configure-launch':
      return {
        done:
          signals.deployReady &&
          signals.launchMintPriceConfigured &&
          (!standardMint || signals.launchMaxSupplyConfigured) &&
          signals.unpaused !== null,
        doneNote: null
      };
    case 'prepare-live-page':
      return {
        done: signals.hasLivePageCover && signals.hasLivePageDescription,
        doneNote: null
      };
    case 'publish-backend':
      return { done: signals.published, doneNote: null };
    case 'unpause-contract':
      if (signals.published && signals.unpaused === true) {
        return { done: true, doneNote: null };
      }
      return { done: false, doneNote: null };
    case 'monitor-launch':
      return {
        done: signals.published,
        doneNote: null
      };
    default:
      return { done: false, doneNote: null };
  }
};

const getBlockedReason = (
  stepId: JourneyStepId,
  signals: JourneySignals
): string | null => {
  const standardMint = requiresStandardMint(signals.mintType);
  if (stepId === 'upload-artwork') {
    if (!signals.hasActiveCollection) {
      return 'Create a drop draft first.';
    }
    if (!standardMint) {
      return null;
    }
    if (signals.uploadReadinessReason) {
      return signals.uploadReadinessReason;
    }
    return null;
  }

  if (stepId === 'deploy-contract') {
    if (!signals.hasActiveCollection) {
      return 'Create a drop draft first.';
    }
    if (signals.deployPending) {
      return null;
    }
    if (signals.deployReadinessReason) {
      return signals.deployReadinessReason;
    }
    return null;
  }

  if (stepId === 'publish-backend' && !signals.deployReady) {
    return 'Deploy the contract before publishing.';
  }
  if (stepId === 'publish-backend') {
    if (signals.unpaused === null) {
      return 'Refresh launch controls to confirm pause status before publishing.';
    }
    if (signals.unpaused) {
      return 'Pause the contract in launch controls before publishing.';
    }
  }

  if (stepId === 'configure-launch') {
    if (!signals.launchMintPriceConfigured) {
      return 'Set launch price in launch controls.';
    }
    if (standardMint && !signals.launchMaxSupplyConfigured) {
      return 'Set max supply in launch controls.';
    }
    if (signals.unpaused === null) {
      return 'Refresh launch controls to confirm pause status.';
    }
    return null;
  }

  if (stepId === 'unpause-contract' && !signals.published) {
    return 'Publish the collection in backend first.';
  }
  if (stepId === 'unpause-contract') {
    if (signals.unpaused === null) {
      return 'Refresh launch controls to confirm pause status.';
    }
    if (signals.unpaused === false) {
      return 'Contract is still paused. Use launch controls to unpause when ready.';
    }
  }

  return null;
};

export const deriveJourneyStepStates = (params: {
  signals: JourneySignals;
  activeStepId?: JourneyStepId | null;
}): JourneyStepState[] => {
  const doneIds = new Set<JourneyStepId>();

  return JOURNEY_STEPS.map((step, index) => {
    const pendingPrerequisite = JOURNEY_STEPS.slice(0, index).find(
      (candidate) => !doneIds.has(candidate.id)
    );
    const lockedReason = pendingPrerequisite
      ? `Finish "${pendingPrerequisite.title}" first.`
      : null;

    const doneState = getDoneState(step.id, params.signals);
    const blockedReason =
      lockedReason === null && !doneState.done
        ? getBlockedReason(step.id, params.signals)
        : null;
    const isInProgress =
      params.activeStepId === step.id ||
      (step.id === 'deploy-contract' && params.signals.deployPending);

    let status: JourneyStepStatus;
    if (lockedReason) {
      status = 'locked';
    } else if (doneState.done) {
      status = 'done';
      doneIds.add(step.id);
    } else if (blockedReason) {
      status = 'blocked';
    } else if (isInProgress) {
      status = 'in-progress';
    } else {
      status = 'todo';
    }

    return {
      ...step,
      status,
      lockedReason,
      blockedReason,
      doneNote: doneState.doneNote
    };
  });
};

export const getRecommendedJourneyStepId = (
  steps: JourneyStepState[]
): JourneyStepId | null => {
  const candidate = steps.find(
    (step) => step.status === 'todo' || step.status === 'blocked'
  );
  return candidate?.id ?? null;
};
