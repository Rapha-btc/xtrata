import { describe, expect, it } from 'vitest';
import * as sdk from '../index.js';

describe('sdk public exports', () => {
  it('exposes the recommended simple clients', () => {
    expect(typeof sdk.createXtrataReadClient).toBe('function');
    expect(typeof sdk.createCollectionReadClient).toBe('function');
    expect(typeof sdk.createMarketReadClient).toBe('function');
    expect(typeof sdk.createSimpleSdk).toBe('function');
  });

  it('exposes workflow planners and safety helpers', () => {
    expect(typeof sdk.buildCoreMintWorkflowPlan).toBe('function');
    expect(typeof sdk.buildCollectionMintWorkflowPlan).toBe('function');
    expect(typeof sdk.buildMarketListWorkflowPlan).toBe('function');
    expect(typeof sdk.buildMarketBuyWorkflowPlan).toBe('function');
    expect(typeof sdk.buildMarketCancelWorkflowPlan).toBe('function');
    expect(typeof sdk.createCoreMintSafetyBundle).toBe('function');
    expect(typeof sdk.createCollectionMintSafetyBundle).toBe('function');
  });

  it('exposes low-level read/build helpers for advanced integrators', () => {
    expect(typeof sdk.createXtrataClient).toBe('function');
    expect(typeof sdk.createCollectionMintClient).toBe('function');
    expect(typeof sdk.createMarketClient).toBe('function');
    expect(typeof sdk.chunkBytes).toBe('function');
    expect(typeof sdk.computeExpectedHash).toBe('function');
    expect(typeof sdk.getContractId).toBe('function');
  });
});
