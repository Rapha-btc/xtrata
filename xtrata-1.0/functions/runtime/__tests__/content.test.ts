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

const metaResult = () =>
  cvHex(
    someCV(
      tupleCV({
        owner: principalCV(CONTRACT_ADDRESS),
        'mime-type': stringAsciiCV('image/gif'),
        'total-size': uintCV(2n),
        'total-chunks': uintCV(1n),
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
});

