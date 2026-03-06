import { describe, expect, it } from 'vitest';
import { FungibleConditionCode } from '@stacks/transactions';
import {
  buildSmallMintSingleTxStxPostConditions,
  buildSealStxPostConditions,
  normalizeDependencyIds,
  parseDependencyInput,
  resolveCollectionBeginSpendCapMicroStx,
  resolveSmallMintSingleTxSpendCapMicroStx,
  resolveSealSpendCapMicroStx,
  validateDependencyIds
} from '../mint';

describe('sdk mint helpers', () => {
  it('computes collection begin cap including protocol fee', () => {
    expect(
      resolveCollectionBeginSpendCapMicroStx({
        mintPrice: 1_000_000n,
        activePhaseMintPrice: 2_000_000n,
        protocolFeeMicroStx: 100_000n
      })
    ).toBe(2_100_000n);
  });

  it('computes seal cap from chunk count', () => {
    expect(
      resolveSealSpendCapMicroStx({
        protocolFeeMicroStx: 100_000n,
        totalChunks: 120
      })
    ).toBe(400_000n);
  });

  it('builds STX post condition in deny-friendly format', () => {
    const conditions = buildSealStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      protocolFeeMicroStx: 100_000n,
      totalChunks: 51
    });

    expect(conditions).toHaveLength(1);
    expect(conditions?.[0].conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(conditions?.[0].amount).toBe(300_000n);
  });

  it('computes small single-tx spend cap (begin + seal)', () => {
    expect(
      resolveSmallMintSingleTxSpendCapMicroStx({
        protocolFeeMicroStx: 100_000n,
        totalChunks: 2
      })
    ).toBe(300_000n);
  });

  it('builds small single-tx spend post condition', () => {
    const conditions = buildSmallMintSingleTxStxPostConditions({
      sender: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
      protocolFeeMicroStx: 100_000n,
      totalChunks: 2
    });
    expect(conditions).toHaveLength(1);
    expect(conditions?.[0].conditionCode).toBe(FungibleConditionCode.LessEqual);
    expect(conditions?.[0].amount).toBe(300_000n);
  });

  it('parses and validates dependencies', () => {
    const parsed = parseDependencyInput('10, 8 10\n12');
    expect(parsed.invalidTokens).toEqual([]);
    expect(normalizeDependencyIds(parsed.ids)).toEqual([8n, 10n, 12n]);
    expect(validateDependencyIds([1n, 2n, 3n]).ok).toBe(true);
  });
});
