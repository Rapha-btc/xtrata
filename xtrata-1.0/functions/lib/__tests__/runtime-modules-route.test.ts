import {
  bufferCV,
  deserializeCV,
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
import { onRequest } from '../../runtime/modules/[network]/[contractAddress]/[contractName]/[entryTokenId]/[[path]]';

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

const readUintArgument = (value: unknown) => {
  const decoded = deserializeCV(String(value)) as { value: { toString(): string } };
  return BigInt(decoded.value.toString());
};

describe('runtime modules route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps a module path back to on-chain content bytes near the entry token id', async () => {
    const tokenUriReads: bigint[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body =
        init?.body && typeof init.body === 'string'
          ? (JSON.parse(init.body) as { arguments?: unknown[] })
          : { arguments: [] as unknown[] };

      if (url.endsWith('/get-last-token-id')) {
        return clarityResponse(responseOkCV(uintCV(1)));
      }

      if (url.endsWith('/get-token-uri')) {
        const tokenId = readUintArgument(body.arguments?.[0]);
        tokenUriReads.push(tokenId);
        if (tokenId === 0n) {
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
        if (tokenId === 1n) {
          return clarityResponse(
            responseOkCV(
              someCV(
                stringAsciiCV(
                  'System/shared/patch_runtime.js'
                )
              )
            )
          );
        }
      }

      if (url.endsWith('/get-inscription-meta')) {
        return clarityResponse(
          someCV(
            tupleCV({
              owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
              'mime-type': stringAsciiCV('text/plain'),
              'total-size': uintCV(17),
              'total-chunks': uintCV(1),
              sealed: trueCV(),
              'final-hash': bufferCV(new Uint8Array([1, 2, 3, 4]))
            })
          )
        );
      }

      if (url.endsWith('/get-chunk')) {
        const tokenId = readUintArgument(body.arguments?.[0]);
        const index = readUintArgument(body.arguments?.[1]);
        if (tokenId === 1n && index === 0n) {
          return clarityResponse(
            someCV(bufferCV(new TextEncoder().encode('console.log("ok")')))
          );
        }
      }

      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequest({
      request: new Request(
        'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract-name/1/on-chain-modules/workspace/System/shared/patch_runtime.js'
      ),
      env: {},
      params: {
        network: 'mainnet',
        contractAddress: 'SP123',
        contractName: 'contract-name',
        entryTokenId: '1',
        path: [
          'on-chain-modules',
          'workspace',
          'System',
          'shared',
          'patch_runtime.js'
        ]
      }
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-Xtrata-Runtime-Token-Id')).toBe('1');
    expect(tokenUriReads[0]).toBe(1n);
    expect(tokenUriReads.length).toBeLessThanOrEqual(2);
    expect(await response.text()).toBe('console.log("ok")');
  });
});
