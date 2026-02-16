import { describe, expect, it } from 'vitest';
import { boolCV, responseOkCV, someCV, tupleCV, uintCV } from '@stacks/transactions';
import type { ReadOnlyCallOptions, ReadOnlyCaller } from '../client';
import {
  SdkSetupError,
  createCollectionReadClient,
  createSimpleSdk,
  createXtrataReadClient
} from '../simple';

const mainnetAddress = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';

describe('simple sdk layer', () => {
  it('binds sender once for xtrata reads', async () => {
    const calls: ReadOnlyCallOptions[] = [];
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        calls.push(options);
        if (options.functionName === 'get-next-token-id') {
          return responseOkCV(uintCV(59));
        }
        if (options.functionName === 'is-paused') {
          return responseOkCV(boolCV(false));
        }
        return responseOkCV(uintCV(0));
      }
    };

    const client = createXtrataReadClient({
      contractId: `${mainnetAddress}.xtrata-v2-1-0`,
      senderAddress: mainnetAddress,
      caller,
      apiBaseUrls: ['https://example.com']
    });

    const next = await client.getNextTokenId();
    const paused = await client.isPaused();

    expect(next).toBe(59n);
    expect(paused).toBe(false);
    expect(calls.every((entry) => entry.senderAddress === mainnetAddress)).toBe(true);
  });

  it('returns collection snapshot convenience fields', async () => {
    const caller: ReadOnlyCaller = {
      callReadOnly: async (options) => {
        switch (options.functionName) {
          case 'is-paused':
            return responseOkCV(boolCV(false));
          case 'get-finalized':
            return responseOkCV(boolCV(false));
          case 'get-mint-price':
            return responseOkCV(uintCV(1_000_000));
          case 'get-max-supply':
            return responseOkCV(uintCV(10));
          case 'get-minted-count':
            return responseOkCV(uintCV(6));
          case 'get-reserved-count':
            return responseOkCV(uintCV(1));
          case 'get-active-phase':
            return responseOkCV(uintCV(1));
          case 'get-phase':
            return someCV(
              tupleCV({
                enabled: boolCV(true),
                'start-block': uintCV(0),
                'end-block': uintCV(0),
                'mint-price': uintCV(2_000_000),
                'max-per-wallet': uintCV(0),
                'max-supply': uintCV(10),
                'allowlist-mode': uintCV(1)
              })
            );
          default:
            return responseOkCV(uintCV(0));
        }
      }
    };

    const collection = createCollectionReadClient({
      contractId: `${mainnetAddress}.xtrata-collection-demo`,
      caller,
      apiBaseUrls: ['https://example.com']
    });

    const snapshot = await collection.getSnapshot();
    expect(snapshot.remaining).toBe(3n);
    expect(snapshot.effectiveMintPrice).toBe(2_000_000n);
    expect(snapshot.live).toBe(true);
  });

  it('creates suite and validates sender', () => {
    expect(() =>
      createSimpleSdk({
        senderAddress: '',
        xtrataContractId: `${mainnetAddress}.xtrata-v2-1-0`
      })
    ).toThrow(SdkSetupError);

    const suite = createSimpleSdk({
      senderAddress: mainnetAddress,
      xtrataContractId: `${mainnetAddress}.xtrata-v2-1-0`
    });

    expect(suite.xtrata?.senderAddress).toBe(mainnetAddress);
  });
});
