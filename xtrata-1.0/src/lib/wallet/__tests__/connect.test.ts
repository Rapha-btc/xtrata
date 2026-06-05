import { describe, expect, it } from 'vitest';
import {
  FungibleConditionCode,
  PostConditionMode,
  makeStandardSTXPostCondition,
  stringAsciiCV,
  uintCV
} from '@stacks/transactions';
import { __testing, isLeatherProviderId } from '../connect';

const ADDRESS = 'SP2MF04VAGYHGAZWGTEDW5VYCPDWWSY08Z1QFNDSN';

describe('wallet connect helpers', () => {
  it('detects Leather provider ids', () => {
    expect(isLeatherProviderId('LeatherProvider')).toBe(true);
    expect(isLeatherProviderId('XverseProviders.StacksProvider')).toBe(false);
    expect(isLeatherProviderId(null)).toBe(false);
  });

  it('builds SIP-030 contract call params with serialized args and post conditions', () => {
    const params = __testing.buildContractCallParams({
      contractAddress: ADDRESS,
      contractName: 'xtrata-core',
      functionName: 'mint',
      functionArgs: [uintCV(42), stringAsciiCV('ok')],
      network: 'mainnet',
      stxAddress: ADDRESS,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [
        makeStandardSTXPostCondition(
          ADDRESS,
          FungibleConditionCode.LessEqual,
          123n
        )
      ]
    });

    expect(params).toMatchObject({
      contract: `${ADDRESS}.xtrata-core`,
      functionName: 'mint',
      network: 'mainnet',
      address: ADDRESS,
      postConditionMode: 'deny'
    });
    expect(params.functionArgs).toHaveLength(2);
    expect(params.functionArgs[0]).toMatch(/^[0-9a-f]+$/);
    expect(params.postConditions?.[0]).toMatch(/^[0-9a-f]+$/);
  });

  it('builds SIP-030 STX transfer params for runtime wallet bridge requests', () => {
    const params = __testing.buildStxTransferParams({
      recipient: ADDRESS,
      amount: 10000n,
      memo: 'XB:14:315',
      network: 'mainnet',
      stxAddress: ADDRESS
    });

    expect(params).toMatchObject({
      recipient: ADDRESS,
      amount: '10000',
      memo: 'XB:14:315',
      network: 'mainnet',
      address: ADDRESS,
      sponsored: false
    });
  });

  it('normalizes tx ids from SIP-030 responses', () => {
    expect(__testing.normalizeTxResult({ txid: '0xabc123' })).toMatchObject({
      txId: '0xabc123',
      txid: '0xabc123'
    });
  });

  it('unwraps JSON-RPC transaction results returned by Leather-style request handlers', () => {
    expect(
      __testing.normalizeTxResult({
        jsonrpc: '2.0',
        id: '1',
        result: { txid: '0xdef456' }
      })
    ).toMatchObject({
      txId: '0xdef456',
      txid: '0xdef456'
    });
  });

  it('keeps non-standard wallet finish payloads available for callbacks', () => {
    expect(__testing.normalizeTxResultForCallback({ pending: true })).toEqual({
      pending: true
    });
  });

  it('extracts a stacks address from nested provider payloads', () => {
    expect(
      __testing.extractStacksAddress({
        result: {
          addresses: [{ address: ADDRESS }]
        }
      })
    ).toBe(ADDRESS);
  });

  it('normalizes network hints from request payloads', () => {
    expect(__testing.normalizeNetwork('mainnet')).toBe('mainnet');
    expect(__testing.normalizeNetwork({ coreApiUrl: 'https://api.testnet.hiro.so' })).toBe(
      'testnet'
    );
  });
});
