import { describe, expect, it } from 'vitest';
import { StacksMainnet } from '@stacks/network';
import {
  ClarityType,
  bufferCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  stringAsciiCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { DEFAULT_CONTRACT } from '../config';
import {
  buildTransferCall,
  createXtrataClient
} from '../client';
import type { ReadOnlyCaller, ReadOnlyCallOptions } from '../client';

describe('xtrata contract client', () => {
  it('calls get-last-token-id with correct args', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        return responseOkCV(uintCV(5));
      }
    };

    const client = createXtrataClient({
      contract: DEFAULT_CONTRACT,
      caller
    });

    const value = await client.getLastTokenId(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );

    expect(value).toBe(5n);
    expect(calls).toHaveLength(1);
    expect(calls[0].functionName).toBe('get-last-token-id');
    expect(calls[0].functionArgs).toHaveLength(0);
    expect(calls[0].network.coreApiUrl).toContain('mainnet');
  });

  it('parses inscription meta', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const finalHash = new Uint8Array(32).fill(2);
    const metaTuple = tupleCV({
      owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
      'mime-type': stringAsciiCV('image/png'),
      'total-size': uintCV(100),
      'total-chunks': uintCV(1),
      sealed: trueCV(),
      'final-hash': bufferCV(finalHash)
    });

    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        return someCV(metaTuple);
      }
    };

    const client = createXtrataClient({
      contract: DEFAULT_CONTRACT,
      caller
    });

    const meta = await client.getInscriptionMeta(
      1n,
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );

    expect(meta?.mimeType).toBe('image/png');
    expect(meta?.finalHash).toEqual(finalHash);
    expect(calls[0].functionName).toBe('get-inscription-meta');
  });

  it('builds transfer call options', () => {
    const options = buildTransferCall({
      contract: DEFAULT_CONTRACT,
      network: new StacksMainnet(),
      id: 10n,
      sender: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
      recipient: 'SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE'
    });

    expect(options.functionName).toBe('transfer');
    expect(options.functionArgs).toHaveLength(3);
    expect(options.functionArgs[0].type).toBe(ClarityType.UInt);
    expect(options.functionArgs[1].type).toBe(ClarityType.PrincipalStandard);
    expect(options.functionArgs[2].type).toBe(ClarityType.PrincipalStandard);
  });
});
