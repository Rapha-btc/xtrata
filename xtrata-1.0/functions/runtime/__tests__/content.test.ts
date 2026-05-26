import {
  boolCV,
  bufferCV,
  listCV,
  principalCV,
  responseOkCV,
  serializeCV,
  someCV,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../content';
import type { RuntimeEnv } from '../lib';

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
const FINAL_HASH = new Uint8Array([0xab, 0xcd]);

const cvHex = (value: Parameters<typeof serializeCV>[0]) =>
  `0x${Array.from(serializeCV(value))
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('')}`;

const streamFrom = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });

const metaResult = (params?: { totalSize?: bigint; totalChunks?: bigint }) =>
  cvHex(
    someCV(
      tupleCV({
        owner: principalCV(CONTRACT_ADDRESS),
        'mime-type': stringAsciiCV('image/gif'),
        'total-size': uintCV(params?.totalSize ?? 2n),
        'total-chunks': uintCV(params?.totalChunks ?? 1n),
        sealed: boolCV(true),
        'final-hash': bufferCV(FINAL_HASH)
      })
    )
  );

describe('/runtime/content', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves cached sealed bytes with the original MIME type', async () => {
    const get = vi.fn(async () => ({
      body: streamFrom(new Uint8Array([9, 8])),
      size: 2,
      httpMetadata: {
        contentType: 'image/gif'
      },
      customMetadata: {
        sourceContractId: CONTRACT_ID
      }
    }));
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          okay: true,
          result: metaResult()
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );
    vi.stubGlobal('fetch', fetch);
    const env = {
      RUNTIME_CONTENT_CACHE: {
        get,
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getUploadUrl: vi.fn()
      }
    } as unknown as RuntimeEnv;

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`
      ),
      env
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/gif');
    expect(response.headers.get('X-Xtrata-Runtime-Cache')).toBe('HIT');
    expect(response.headers.get('X-Xtrata-Runtime-Final-Hash')).toBe('abcd');
    expect(get).toHaveBeenCalledWith(
      `runtime-content/mainnet/${CONTRACT_ID}/294/abcd`
    );
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      9,
      8
    ]);
  });

  it('returns metadata-only diagnostics for HEAD requests', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          okay: true,
          result: metaResult({
            totalSize: 3n,
            totalChunks: 3n
          })
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );
    vi.stubGlobal('fetch', fetch);

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`,
        {
          method: 'HEAD'
        }
      ),
      env: {}
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/gif');
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(response.headers.get('X-Xtrata-Runtime-Build')).toBe('stream-v1');
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('head');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('streams reconstructed bytes on cache misses', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      let result: string;
      if (endpoint.endsWith('/get-inscription-meta')) {
        result = metaResult({
          totalSize: 3n,
          totalChunks: 3n
        });
      } else if (endpoint.endsWith('/get-chunk')) {
        result = cvHex(someCV(bufferCV(new Uint8Array([1]))));
      } else if (endpoint.endsWith('/get-chunk-batch')) {
        result = cvHex(
          listCV([
            someCV(bufferCV(new Uint8Array([2]))),
            someCV(bufferCV(new Uint8Array([3])))
          ])
        );
      } else if (endpoint.endsWith('/get-token-uri')) {
        result = cvHex(responseOkCV(someCV(stringAsciiCV('signal.gif'))));
      } else {
        throw new Error(`Unexpected endpoint ${endpoint}`);
      }
      return new Response(
        JSON.stringify({
          okay: true,
          result
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });
    vi.stubGlobal('fetch', fetch);

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`
      ),
      env: {
        RUNTIME_CONTENT_READ_RETRIES: '0'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('stream');
    expect(response.headers.get('X-Xtrata-Runtime-Cache')).toBe('BYPASS');
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1,
      2,
      3
    ]);
  });
});
