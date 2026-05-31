import {
  boolCV,
  bufferCV,
  principalCV,
  serializeCV,
  someCV,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../cache-purge';
import type { RuntimeEnv } from '../lib';

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;

const cvHex = (value: Parameters<typeof serializeCV>[0]) =>
  `0x${Array.from(serializeCV(value))
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('')}`;

const metaResult = () =>
  cvHex(
    someCV(
      tupleCV({
        owner: principalCV(CONTRACT_ADDRESS),
        'mime-type': stringAsciiCV('audio/webm'),
        'total-size': uintCV(2n),
        'total-chunks': uintCV(1n),
        sealed: boolCV(true),
        'final-hash': bufferCV(new Uint8Array([0xab, 0xcd]))
      })
    )
  );

describe('/runtime/cache-purge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires the admin bearer token before resolving metadata', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/cache-purge?contractId=${CONTRACT_ID}&tokenId=316&network=mainnet`,
        {
          method: 'POST'
        }
      ),
      env: {
        RUNTIME_CACHE_ADMIN_TOKEN: 'secret'
      } as unknown as RuntimeEnv
    });

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes the resolved token key from R2 and the edge cache', async () => {
    const r2Delete = vi.fn(async () => undefined);
    const edgeDelete = vi.fn(async () => true);
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
    vi.stubGlobal('caches', {
      default: {
        delete: edgeDelete
      }
    });

    const response = await onRequest({
      request: new Request(
        `https://xtrata.xyz/runtime/cache-purge?contractId=${CONTRACT_ID}&tokenId=316&network=mainnet`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret'
          }
        }
      ),
      env: {
        RUNTIME_CACHE_ADMIN_TOKEN: 'secret',
        RUNTIME_CONTENT_CACHE: {
          get: vi.fn(),
          put: vi.fn(),
          delete: r2Delete,
          list: vi.fn(),
          getUploadUrl: vi.fn()
        }
      } as unknown as RuntimeEnv
    });
    const body = (await response.json()) as {
      ok: boolean;
      key: string;
      r2Deleted: boolean;
      edgeDeleted: boolean;
      upstreamRequests: number;
    };
    const expectedKey = `runtime-content/mainnet/${CONTRACT_ID}/316/abcd`;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      key: expectedKey,
      r2Deleted: true,
      edgeDeleted: true,
      upstreamRequests: 1
    });
    expect(r2Delete).toHaveBeenCalledWith(expectedKey);
    const edgeRequest = edgeDelete.mock.calls[0]?.[0] as Request;
    expect(edgeRequest.url).toBe(`https://xtrata-runtime-content-cache.local/${expectedKey}`);
  });
});
