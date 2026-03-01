import { describe, expect, it } from 'vitest';
import {
  deriveJourneyStepStates,
  getRecommendedJourneyStepId,
  type JourneySignals
} from '../journey';

const createSignals = (
  overrides: Partial<JourneySignals> = {}
): JourneySignals => ({
  walletConnected: false,
  hasActiveCollection: false,
  mintType: null,
  activeAssetCount: 0,
  deployPricingLockPresent: false,
  deployReady: false,
  deployPending: false,
  launchMintPriceConfigured: false,
  launchMaxSupplyConfigured: false,
  hasLivePageCover: false,
  hasLivePageDescription: false,
  published: false,
  unpaused: null,
  uploadReadinessReason: null,
  deployReadinessReason: null,
  ...overrides
});

describe('journey helpers', () => {
  it('locks later steps until earlier steps are complete', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true
      })
    });

    expect(steps[0].status).toBe('done');
    expect(steps[1].status).toBe('todo');
    expect(steps[2].status).toBe('locked');
    expect(steps[2].lockedReason).toContain('Create drop draft');
  });

  it('skips upload/lock requirements for pre-inscribed collections', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'pre-inscribed'
      })
    });

    const uploadStep = steps.find((step) => step.id === 'upload-artwork');
    const lockStep = steps.find((step) => step.id === 'lock-staged-assets');
    const deployStep = steps.find((step) => step.id === 'deploy-contract');

    expect(uploadStep?.status).toBe('done');
    expect(lockStep?.status).toBe('done');
    expect(lockStep?.doneNote).toContain('Skipped');
    expect(deployStep?.status).toBe('todo');
  });

  it('surfaces readiness blockers when a step is reachable', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 2,
        deployPricingLockPresent: true,
        deployReadinessReason: 'Deployment transaction is still pending.'
      })
    });

    const deployStep = steps.find((step) => step.id === 'deploy-contract');
    expect(deployStep?.status).toBe('blocked');
    expect(deployStep?.blockedReason).toContain('pending');
  });

  it('shows deploy as in-progress while confirmation is pending', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 2,
        deployPricingLockPresent: true,
        deployPending: true,
        deployReadinessReason: 'Deployment transaction is still pending.'
      })
    });

    const deployStep = steps.find((step) => step.id === 'deploy-contract');
    expect(deployStep?.status).toBe('in-progress');
    expect(deployStep?.blockedReason).toBeNull();
  });

  it('returns the first todo or blocked step as the recommended target', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 1,
        deployPricingLockPresent: true,
        deployReady: false
      })
    });

    expect(getRecommendedJourneyStepId(steps)).toBe('deploy-contract');
  });

  it('requires launch settings and known pause state before configure launch is done', () => {
    const steps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 3,
        deployPricingLockPresent: true,
        deployReady: true,
        launchMintPriceConfigured: true,
        launchMaxSupplyConfigured: false,
        unpaused: null
      })
    });

    const configureStep = steps.find((step) => step.id === 'configure-launch');
    expect(configureStep?.status).toBe('blocked');
    expect(configureStep?.blockedReason).toContain('max supply');
  });

  it('keeps unpause blocked until contract is explicitly unpaused after publish', () => {
    const blockedSteps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 3,
        deployPricingLockPresent: true,
        deployReady: true,
        launchMintPriceConfigured: true,
        launchMaxSupplyConfigured: true,
        hasLivePageCover: true,
        hasLivePageDescription: true,
        published: true,
        unpaused: false
      })
    });

    const blockedUnpauseStep = blockedSteps.find(
      (step) => step.id === 'unpause-contract'
    );
    expect(blockedUnpauseStep?.status).toBe('blocked');
    expect(blockedUnpauseStep?.blockedReason).toContain('still paused');

    const doneSteps = deriveJourneyStepStates({
      signals: createSignals({
        walletConnected: true,
        hasActiveCollection: true,
        mintType: 'standard',
        activeAssetCount: 3,
        deployPricingLockPresent: true,
        deployReady: true,
        launchMintPriceConfigured: true,
        launchMaxSupplyConfigured: true,
        hasLivePageCover: true,
        hasLivePageDescription: true,
        published: true,
        unpaused: true
      })
    });

    const doneUnpauseStep = doneSteps.find((step) => step.id === 'unpause-contract');
    expect(doneUnpauseStep?.status).toBe('done');
  });
});
