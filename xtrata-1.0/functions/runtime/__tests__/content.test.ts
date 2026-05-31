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
import { chunkBytes, computeExpectedHash } from '../../../packages/xtrata-reconstruction/src/index';
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

const finalHashForBytes = (bytes: Uint8Array) => computeExpectedHash(chunkBytes(bytes));

const metaResult = (params?: {
  mimeType?: string;
  totalSize?: bigint;
  totalChunks?: bigint;
  finalHash?: Uint8Array;
}) =>
  cvHex(
    someCV(
      tupleCV({
        owner: principalCV(CONTRACT_ADDRESS),
        'mime-type': stringAsciiCV(params?.mimeType ?? 'image/gif'),
        'total-size': uintCV(params?.totalSize ?? 2n),
        'total-chunks': uintCV(params?.totalChunks ?? 1n),
        sealed: boolCV(true),
        'final-hash': bufferCV(params?.finalHash ?? FINAL_HASH)
      })
    )
  );

describe('/runtime/content', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const fetch = vi.fn(
      async () =>
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
    expect(get).toHaveBeenCalledWith(`runtime-content/mainnet/${CONTRACT_ID}/294/abcd`);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([9, 8]);
  });

  it('serves cached byte ranges for media playback', async () => {
    const get = vi.fn(
      async (_key: string, options?: { range?: { offset: number; length: number } }) => {
        const bytes = new Uint8Array([9, 8, 7, 6]);
        const range = options?.range;
        return {
          body: streamFrom(range ? bytes.slice(range.offset, range.offset + range.length) : bytes),
          size: bytes.length,
          httpMetadata: {
            contentType: 'audio/webm'
          },
          customMetadata: {
            sourceContractId: CONTRACT_ID
          }
        };
      }
    );
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            okay: true,
            result: metaResult({
              mimeType: 'audio/webm',
              totalSize: 4n
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
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`,
        {
          headers: {
            Range: 'bytes=1-2'
          }
        }
      ),
      env
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('audio/webm');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect(response.headers.get('Content-Length')).toBe('2');
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('range');
    expect(get).toHaveBeenCalledWith(`runtime-content/mainnet/${CONTRACT_ID}/294/abcd`, {
      range: {
        offset: 1,
        length: 2
      }
    });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([8, 7]);
  });

  it('returns 416 for unsatisfiable byte ranges without reconstructing content', async () => {
    const get = vi.fn();
    const fetch = vi.fn(
      async () =>
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

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`,
        {
          headers: {
            Range: 'bytes=20-30'
          }
        }
      ),
      env: {
        RUNTIME_CONTENT_CACHE: {
          get,
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
          getUploadUrl: vi.fn()
        }
      } as unknown as RuntimeEnv
    });

    expect(response.status).toBe(416);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe('bytes */2');
    expect(response.headers.get('Content-Length')).toBe('0');
    expect(get).not.toHaveBeenCalled();
  });

  it('returns metadata-only diagnostics for HEAD requests', async () => {
    const fetch = vi.fn(
      async () =>
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
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('X-Xtrata-Runtime-Build')).toBe('stream-v1');
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('head');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('streams reconstructed bytes on cache misses', async () => {
    const finalHash = finalHashForBytes(new Uint8Array([1, 2, 3]));
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      let result: string;
      if (endpoint.endsWith('/get-inscription-meta')) {
        result = metaResult({
          totalSize: 3n,
          totalChunks: 3n,
          finalHash
        });
      } else if (endpoint.endsWith('/get-chunk')) {
        result = cvHex(someCV(bufferCV(new Uint8Array([1]))));
      } else if (endpoint.endsWith('/get-chunk-batch')) {
        result = cvHex(
          listCV([someCV(bufferCV(new Uint8Array([2]))), someCV(bufferCV(new Uint8Array([3])))])
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
        RUNTIME_CONTENT_DEBUG: '1',
        RUNTIME_CONTENT_READ_RETRIES: '0'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('stream');
    expect(response.headers.get('X-Xtrata-Runtime-Cache')).toBe('BYPASS');
    expect(response.headers.get('X-Xtrata-Runtime-Reconstruction-Read-Mode')).toBe('mixed');
    expect(response.headers.get('X-Xtrata-Runtime-Reconstruction-Fallback')).toBe('false');
    expect(response.headers.get('X-Xtrata-Runtime-Read-Batch-Size')).toBe('30');
    expect(response.headers.get('X-Xtrata-Runtime-Upstream-Requests')).toBe('4');
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(consoleLog).toHaveBeenCalledWith(
      '[runtime/content] reconstructed-stream',
      expect.objectContaining({
        tokenId: '294',
        sourceContractId: CONTRACT_ID,
        diagnostics: expect.objectContaining({
          readMode: 'mixed',
          batchReads: 1,
          singleReads: 1
        })
      })
    );
  });

  it('returns a clear terminal response without amplifying Cloudflare subrequest exhaustion', async () => {
    const finalHash = finalHashForBytes(new Uint8Array([1, 2, 3]));
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      let result: string;
      if (endpoint.endsWith('/get-inscription-meta')) {
        result = metaResult({
          totalSize: 3n,
          totalChunks: 3n,
          finalHash
        });
      } else if (endpoint.endsWith('/get-chunk')) {
        result = cvHex(someCV(bufferCV(new Uint8Array([1]))));
      } else if (endpoint.endsWith('/get-chunk-batch')) {
        throw new Error('Too many subrequests by single Worker invocation.');
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
        RUNTIME_CONTENT_READ_RETRIES: '2'
      }
    });
    const body = (await response.json()) as {
      error: string;
      diagnostics: {
        upstreamRequests: number;
        batchFallbacks: number;
        singleReads: number;
        errors: Array<{ operation: string }>;
      };
    };

    expect(response.status).toBe(503);
    expect(response.headers.get('X-Xtrata-Runtime-Upstream-Requests')).toBe('3');
    expect(body.error).toBe('Runtime upstream request limit exhausted.');
    expect(body.diagnostics.upstreamRequests).toBe(3);
    expect(body.diagnostics.batchFallbacks).toBe(0);
    expect(body.diagnostics.singleReads).toBe(1);
    expect(body.diagnostics.errors).toEqual([
      expect.objectContaining({
        operation: 'chunk-batch'
      })
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('serves byte ranges after reconstructing uncached content', async () => {
    const finalHash = finalHashForBytes(new Uint8Array([1, 2, 3]));
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      let result: string;
      if (endpoint.endsWith('/get-inscription-meta')) {
        result = metaResult({
          totalSize: 3n,
          totalChunks: 3n,
          finalHash
        });
      } else if (endpoint.endsWith('/get-chunk')) {
        result = cvHex(someCV(bufferCV(new Uint8Array([1]))));
      } else if (endpoint.endsWith('/get-chunk-batch')) {
        result = cvHex(
          listCV([someCV(bufferCV(new Uint8Array([2]))), someCV(bufferCV(new Uint8Array([3])))])
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
        `https://xtrata.xyz/runtime/content?contractId=${CONTRACT_ID}&tokenId=294&network=mainnet`,
        {
          headers: {
            Range: 'bytes=1-2'
          }
        }
      ),
      env: {
        RUNTIME_CONTENT_READ_RETRIES: '0'
      }
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/3');
    expect(response.headers.get('Content-Length')).toBe('2');
    expect(response.headers.get('X-Xtrata-Runtime-Response-Mode')).toBe('range');
    expect(response.headers.get('X-Xtrata-Runtime-Reconstruction-Batch-Reads')).toBe('1');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([2, 3]);
  });
});
