import { describe, expect, it } from 'vitest';
import {
  estimateDataMiningFeeMicroStx,
  estimateSequentialMintTransactions
} from '../estimates';

describe('mint estimate helpers', () => {
  it('counts begin, upload batches, and seal transactions', () => {
    expect(
      estimateSequentialMintTransactions({ totalChunks: 1, batchSize: 30 })
    ).toEqual({
      beginTransactions: 1,
      uploadTransactions: 1,
      sealTransactions: 1,
      totalTransactions: 3,
      batchSize: 30
    });

    expect(
      estimateSequentialMintTransactions({ totalChunks: 31, batchSize: 30 })
    ).toEqual({
      beginTransactions: 1,
      uploadTransactions: 2,
      sealTransactions: 1,
      totalTransactions: 4,
      batchSize: 30
    });
  });

  it('returns zero transactions without prepared chunks', () => {
    expect(
      estimateSequentialMintTransactions({ totalChunks: 0, batchSize: 30 })
    ).toEqual({
      beginTransactions: 0,
      uploadTransactions: 0,
      sealTransactions: 0,
      totalTransactions: 0,
      batchSize: 30
    });
  });

  it('estimates data mining fees at one STX per MiB', () => {
    expect(estimateDataMiningFeeMicroStx(16n * 1024n)).toBe(15_625n);
    expect(estimateDataMiningFeeMicroStx(1024n * 1024n)).toBe(1_000_000n);
    expect(estimateDataMiningFeeMicroStx(4n * 1024n * 1024n)).toBe(4_000_000n);
  });
});
