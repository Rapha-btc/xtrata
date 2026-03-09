import { describe, expect, it } from 'vitest';
import {
  contractPrincipalCV,
  falseCV,
  noneCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import {
  parseGetNextVaultId,
  parseGetReserveToken,
  parseGetTierForAmount,
  parseGetVault,
  parseGetVaultCoreContract,
  parseGetVaultOwner,
  parseHasPremiumAccess
} from '../parsers';

const owner = standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
const core = contractPrincipalCV(
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  'xtrata-v2-1-0'
);
const reserve = contractPrincipalCV(
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
  'sbtc-token'
);

const vaultTuple = tupleCV({
  'asset-id': uintCV(33),
  owner,
  amount: uintCV(500),
  tier: uintCV(2),
  reserved: falseCV(),
  'created-at': uintCV(123),
  'updated-at': uintCV(124)
});

describe('vault parsers', () => {
  it('parses owner and linked contracts', () => {
    expect(parseGetVaultOwner(responseOkCV(owner))).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
    expect(parseGetVaultCoreContract(responseOkCV(core))).toBe(
      'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0'
    );
    expect(parseGetReserveToken(responseOkCV(reserve))).toBe(
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'
    );
  });

  it('parses vault read-only responses', () => {
    expect(parseGetNextVaultId(responseOkCV(uintCV(4)))).toBe(4n);
    expect(parseGetTierForAmount(responseOkCV(uintCV(3)))).toBe(3n);
    expect(parseHasPremiumAccess(responseOkCV(trueCV()))).toBe(true);

    const parsed = parseGetVault(someCV(vaultTuple));
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected vault');
    }
    expect(parsed.assetId).toBe(33n);
    expect(parsed.owner).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(parsed.amount).toBe(500n);
    expect(parsed.tier).toBe(2n);
    expect(parsed.reserved).toBe(false);
  });

  it('returns null for missing vaults', () => {
    expect(parseGetVault(noneCV())).toBeNull();
  });
});
