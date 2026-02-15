import { describe, expect, it } from 'vitest';
import { FungibleConditionCode } from '@stacks/transactions';
import {
  buildMintBeginStxPostConditions,
  resolveMintBeginSpendCapMicroStx
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
});

