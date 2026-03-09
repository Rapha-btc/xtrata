import { describe, expect, it } from 'vitest';
import { StacksMainnet } from '@stacks/network';
import {
  ClarityType,
  contractPrincipalCV,
  falseCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import type { ReadOnlyCallOptions, ReadOnlyCaller } from '../../contract/client';
import {
  buildDepositSbtcCall,
  buildMarkReservedCall,
  buildOpenVaultCall,
  createVaultClient
} from '../client';

const contract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-vault',
  network: 'mainnet' as const
};

describe('vault client', () => {
  it('builds vault write calls', () => {
    const openCall = buildOpenVaultCall({
      contract,
      network: new StacksMainnet(),
      assetId: 12n,
      initialAmount: 500n
    });
    expect(openCall.functionName).toBe('open-vault');
    expect(openCall.functionArgs).toHaveLength(2);
    expect(openCall.functionArgs[0].type).toBe(ClarityType.UInt);

    const depositCall = buildDepositSbtcCall({
      contract,
      network: new StacksMainnet(),
      vaultId: 1n,
      amount: 50n
    });
    expect(depositCall.functionName).toBe('deposit-sbtc');

    const reserveCall = buildMarkReservedCall({
      contract,
      network: new StacksMainnet(),
      vaultId: 1n,
      reserved: true
    });
    expect(reserveCall.functionName).toBe('mark-reserved');
    expect(reserveCall.functionArgs[1].type).toBe(ClarityType.BoolTrue);
  });

  it('calls vault read-only helpers with correct args', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        if (options.functionName === 'get-next-vault-id') {
          return responseOkCV(uintCV(5));
        }
        if (options.functionName === 'get-vault') {
          return someCV(tupleCV({
            'asset-id': uintCV(12),
            owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
            amount: uintCV(500),
            tier: uintCV(2),
            reserved: falseCV(),
            'created-at': uintCV(100),
            'updated-at': uintCV(101)
          }));
        }
        if (options.functionName === 'has-premium-access') {
          return responseOkCV(falseCV());
        }
        if (options.functionName === 'get-reserve-token') {
          return responseOkCV(contractPrincipalCV(
            'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
            'sbtc-token'
          ));
        }
        throw new Error(`Unexpected function: ${options.functionName}`);
      }
    };

    const client = createVaultClient({ contract, caller });
    const sender = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

    const nextVaultId = await client.getNextVaultId(sender);
    const vault = await client.getVault(12n, sender);
    const hasAccess = await client.hasPremiumAccess(12n, sender, sender);
    const reserveToken = await client.getReserveToken(sender);

    expect(nextVaultId).toBe(5n);
    expect(vault?.amount).toBe(500n);
    expect(hasAccess).toBe(false);
    expect(reserveToken).toBe(
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'
    );
    expect(calls.map((call) => call.functionName)).toEqual([
      'get-next-vault-id',
      'get-vault',
      'has-premium-access',
      'get-reserve-token'
    ]);
  });
});
