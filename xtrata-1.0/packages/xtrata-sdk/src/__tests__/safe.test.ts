import { describe, expect, it } from 'vitest';
import {
  buildGuidedMintFlow,
  buildMintRecoveryGuide,
  createCollectionMintSafetyBundle,
  createCoreMintSafetyBundle
} from '../safe';

describe('safe transaction helpers', () => {
  it('builds deterministic core mint spend caps and post-conditions', () => {
    const bundle = createCoreMintSafetyBundle({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 51
    });

    expect(bundle.beginCapMicroStx).toBe(1_000_000n);
    expect(bundle.sealCapMicroStx).toBe(300_000n);
    expect(bundle.totalCapMicroStx).toBe(1_300_000n);
    expect(bundle.beginPostConditions).toHaveLength(1);
    expect(bundle.sealPostConditions).toHaveLength(1);
    expect(bundle.summaryLines[0]).toContain('1.000000 STX');
    expect(bundle.warnings).toEqual([]);
  });

  it('includes protocol fee in collection begin cap', () => {
    const bundle = createCollectionMintSafetyBundle({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 51
    });

    expect(bundle.beginCapMicroStx).toBe(1_100_000n);
    expect(bundle.sealCapMicroStx).toBe(300_000n);
    expect(bundle.totalCapMicroStx).toBe(1_400_000n);
    expect(bundle.beginPostConditions).toHaveLength(1);
    expect(bundle.sealPostConditions).toHaveLength(1);
  });

  it('builds guided mint flow with clear next action', () => {
    const idle = buildGuidedMintFlow({
      beginConfirmed: false,
      uploadedChunkBatches: 0,
      totalChunkBatches: 4,
      sealConfirmed: false
    });
    expect(idle.nextAction).toBe('Submit begin transaction.');
    expect(idle.steps[0].status).toBe('ready');
    expect(idle.steps[1].status).toBe('blocked');

    const chunking = buildGuidedMintFlow({
      beginConfirmed: true,
      uploadedChunkBatches: 2,
      totalChunkBatches: 4,
      sealConfirmed: false
    });
    expect(chunking.nextAction).toBe('Continue chunk uploads.');
    expect(chunking.steps[1].status).toBe('in-progress');

    const done = buildGuidedMintFlow({
      beginConfirmed: true,
      uploadedChunkBatches: 4,
      totalChunkBatches: 4,
      sealConfirmed: true
    });
    expect(done.nextAction).toBe('Mint complete.');
    expect(done.progressPercent).toBe(100);
    expect(done.steps[3].status).toBe('done');
  });

  it('generates recovery guidance for nonce and post-condition failures', () => {
    const nonceGuide = buildMintRecoveryGuide({
      errorMessage: 'Bad nonce supplied for transaction',
      attemptedStep: 'seal',
      beginConfirmed: true,
      uploadedChunkBatches: 3,
      totalChunkBatches: 3,
      sealConfirmed: false
    });
    expect(nonceGuide.failureType).toBe('bad-nonce');
    expect(nonceGuide.failedStep).toBe('seal');
    expect(nonceGuide.canResume).toBe(true);
    expect(nonceGuide.retryable).toBe(true);

    const pcGuide = buildMintRecoveryGuide({
      errorMessage: 'Post-condition check failure on STX',
      beginConfirmed: true,
      uploadedChunkBatches: 1,
      totalChunkBatches: 2,
      sealConfirmed: false
    });
    expect(pcGuide.failureType).toBe('post-condition');
    expect(pcGuide.failedStep).toBe('chunks');
    expect(pcGuide.retryable).toBe(false);
    expect(pcGuide.recommendedAction).toContain('post-conditions');
  });
});
