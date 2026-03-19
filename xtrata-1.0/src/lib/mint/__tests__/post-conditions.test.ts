import { describe, expect, it } from 'vitest';
import { FungibleConditionCode } from '@stacks/transactions';
import {
  buildBatchSealStxPostConditions,
  buildCollectionBatchSealStxPostConditions,
  buildCollectionSmallSingleTxStxPostConditions,
  buildCollectionSealStxPostConditions,
  buildProtocolFeeStxPostConditions,
  buildSealStxPostConditions,
  buildMintBeginStxPostConditions,
  resolveCollectionBatchSealSpendCapMicroStx,
  resolveBatchSealSpendCapMicroStx,
  resolveCollectionBeginSpendCapMicroStx,
  resolveCollectionSmallSingleTxSpendCapMicroStx,
  resolveCollectionSealSpendCapMicroStx,
  resolveMintBeginSpendCapMicroStx,
  resolveSealSpendCapMicroStx
} from '../post-conditions';

describe('mint post conditions', () => {
  it('uses active phase mint price when present', () => {
    const cap = resolveMintBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      activePhaseMintPrice: 7_500_000n
    });
    expect(cap).toBe(7_500_000n);
  });

  it('falls back to base mint price when active phase price is missing', () => {
    const cap = resolveMintBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      activePhaseMintPrice: null
    });
    expect(cap).toBe(5_000_000n);
  });

  it('applies tighter additional cap when provided', () => {
    const cap = resolveMintBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      activePhaseMintPrice: 6_000_000n,
      additionalCapMicroStx: 4_500_000n
    });
    expect(cap).toBe(4_500_000n);
  });

  it('never expands cap when additional cap is looser', () => {
    const cap = resolveMintBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      additionalCapMicroStx: 9_000_000n
    });
    expect(cap).toBe(5_000_000n);
  });

  it('builds LessEqual STX post condition with resolved cap', () => {
    const postConditions = buildMintBeginStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 5_000_000n,
      additionalCapMicroStx: 4_500_000n
    });

    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(4_500_000n);
  });

  it('returns null when sender is missing or price is unavailable', () => {
    expect(
      buildMintBeginStxPostConditions({
        sender: '',
        mintPrice: 5_000_000n
      })
    ).toBeNull();

    expect(
      buildMintBeginStxPostConditions({
        sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        mintPrice: null
      })
    ).toBeNull();
  });

  it('uses protocol fee only for collection begin spend cap', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n
    });
    expect(cap).toBe(100_000n);
  });

  it('returns null when collection protocol fee is missing', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      protocolFeeMicroStx: null
    });
    expect(cap).toBeNull();
  });

  it('adds optional begin fee to collection begin spend cap', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n,
      beginFeeMicroStx: 25_000n
    });
    expect(cap).toBe(125_000n);
  });

  it('supports legacy begin pricing by adding active mint price to begin cap', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n,
      mintPrice: 1_000_000n,
      activePhaseMintPrice: 1_111_111n,
      chargeMintPriceAtBegin: true
    });
    expect(cap).toBe(1_211_111n);
  });

  it('returns null for legacy begin pricing when mint price is unavailable', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n,
      mintPrice: null,
      activePhaseMintPrice: null,
      chargeMintPriceAtBegin: true
    });
    expect(cap).toBeNull();
  });

  it('builds protocol fee STX post condition', () => {
    const postConditions = buildProtocolFeeStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      protocolFeeMicroStx: 100_000n
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(100_000n);
  });

  it('computes seal cap using fee-unit and chunk batch count', () => {
    const cap = resolveSealSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n,
      totalChunks: 51
    });
    expect(cap).toBe(300_000n);
  });

  it('computes batch seal cap as the sum of item seal caps', () => {
    const cap = resolveBatchSealSpendCapMicroStx({
      protocolFeeMicroStx: 100_000n,
      totalChunks: [1, 50, 51]
    });
    expect(cap).toBe(700_000n);
  });

  it('builds seal post condition using computed seal cap', () => {
    const postConditions = buildSealStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      protocolFeeMicroStx: 100_000n,
      totalChunks: 120
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(400_000n);
  });

  it('builds batch seal post condition from selected item chunk counts', () => {
    const postConditions = buildBatchSealStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      protocolFeeMicroStx: 100_000n,
      totalChunks: [10, 200]
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(700_000n);
  });

  it('computes collection seal cap as mint price plus protocol seal fee', () => {
    const cap = resolveCollectionSealSpendCapMicroStx({
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 1
    });
    expect(cap).toBe(1_200_000n);
  });

  it('computes collection batch seal cap as per-item mint prices plus protocol seal fees', () => {
    const cap = resolveCollectionBatchSealSpendCapMicroStx({
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: [1, 51]
    });
    expect(cap).toBe(2_500_000n);
  });

  it('builds collection seal post condition from mint price and chunk count', () => {
    const postConditions = buildCollectionSealStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 1
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(1_200_000n);
  });

  it('builds collection batch seal post condition from mint price and item chunks', () => {
    const postConditions = buildCollectionBatchSealStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: [1, 51]
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(2_500_000n);
  });

  it('computes collection small single-tx cap as begin plus seal spend for v1.4 model', () => {
    const cap = resolveCollectionSmallSingleTxSpendCapMicroStx({
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 1,
      chargeMintPriceAtBegin: false
    });
    expect(cap).toBe(1_300_000n);
  });

  it('supports collection small single-tx cap override for display-price seal pricing', () => {
    const cap = resolveCollectionSmallSingleTxSpendCapMicroStx({
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 1,
      chargeMintPriceAtBegin: false,
      sealSpendCapMicroStx: 1_200_000n
    });
    expect(cap).toBe(1_300_000n);
  });

  it('builds collection small single-tx post condition from combined spend cap', () => {
    const postConditions = buildCollectionSmallSingleTxStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      mintPrice: 1_000_000n,
      protocolFeeMicroStx: 100_000n,
      totalChunks: 30,
      chargeMintPriceAtBegin: false
    });
    expect(postConditions).not.toBeNull();
    expect(postConditions).toHaveLength(1);
    const condition = postConditions?.[0];
    expect(condition?.conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(condition?.amount).toBe(1_300_000n);
  });
});
