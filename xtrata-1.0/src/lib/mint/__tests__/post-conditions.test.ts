import { describe, expect, it } from 'vitest';
import { FungibleConditionCode } from '@stacks/transactions';
import {
  buildBatchSealStxPostConditions,
  buildProtocolFeeStxPostConditions,
  buildSealStxPostConditions,
  buildMintBeginStxPostConditions,
  resolveBatchSealSpendCapMicroStx,
  resolveCollectionBeginSpendCapMicroStx,
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

  it('adds protocol fee to collection begin spend cap', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      activePhaseMintPrice: 6_000_000n,
      protocolFeeMicroStx: 100_000n
    });
    expect(cap).toBe(6_100_000n);
  });

  it('returns null when collection protocol fee is missing', () => {
    const cap = resolveCollectionBeginSpendCapMicroStx({
      mintPrice: 5_000_000n,
      protocolFeeMicroStx: null
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
});
