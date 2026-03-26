import {
  bufferCV,
  responseOkCV,
  serializeCV,
  someCV,
  standardPrincipalCV,
  stringAsciiCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../runtime/content';

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

const clarityResponse = (value: Parameters<typeof serializeCV>[0]) =>
  new Response(
    JSON.stringify({
      okay: true,
      result: `0x${bytesToHex(serializeCV(value))}`
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }
  );

describe('runtime content route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns a module base header for path-based html token uris', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/get-inscription-meta')) {
        return clarityResponse(
          someCV(
            tupleCV({
              owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
              'mime-type': stringAsciiCV('text/html'),
              'total-size': uintCV(15),
              'total-chunks': uintCV(1),
              sealed: trueCV(),
              'final-hash': bufferCV(new Uint8Array([1, 2, 3, 4]))
            })
          )
        );
      }
      if (url.endsWith('/get-token-uri')) {
        return clarityResponse(
          responseOkCV(
            someCV(
              stringAsciiCV(
                'on-chain-modules/workspace/Plugins/Instruments/JMS10/gui.html'
              )
            )
          )
        );
      }
      if (url.endsWith('/get-chunk')) {
        return clarityResponse(
          someCV(bufferCV(new TextEncoder().encode('<html></html>')))
        );
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequest({
      request: new Request(
        'https://xtrata.xyz/runtime/content?contractId=SP123.contract-name&tokenId=259&network=mainnet'
      ),
      env: {}
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Xtrata-Runtime-Token-Uri')).toBe(
      'on-chain-modules/workspace/Plugins/Instruments/JMS10/gui.html'
    );
    expect(response.headers.get('X-Xtrata-Runtime-Module-Base')).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
    );
  });
});
