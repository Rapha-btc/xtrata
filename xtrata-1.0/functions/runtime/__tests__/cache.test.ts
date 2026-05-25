import { describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeContentCacheKey,
  getRuntimeContentCacheBucket,
  readRuntimeContentCache,
  runtimeBytesToHex,
  writeRuntimeContentCache
} from '../cache';
import type { RuntimeContractRef, RuntimeEnv } from '../lib';

const contract: RuntimeContractRef = {
  address: 'SP1111111111111111111111111111111111111111',
  contractName: 'xtrata-v2-1-0'
};

const streamFrom = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });

describe('runtime content cache', () => {
  it('keys content by network, contract id, token id, and final hash', () => {
    const key = buildRuntimeContentCacheKey({
      network: 'mainnet',
      contract,
      tokenId: 294n,
      finalHash: new Uint8Array([0, 15, 255])
    });

    expect(key).toBe(
      'runtime-content/mainnet/SP1111111111111111111111111111111111111111.xtrata-v2-1-0/294/000fff'
    );
    expect(runtimeBytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });

  it('bypasses reads and writes when the cache binding is absent', async () => {
    const env: RuntimeEnv = {};

    expect(getRuntimeContentCacheBucket(env)).toBeNull();
    await expect(readRuntimeContentCache(env, 'runtime-content/test')).resolves.toBeNull();
    await expect(
      writeRuntimeContentCache({
        env,
        key: 'runtime-content/test',
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
        metadata: {}
      })
    ).resolves.toBe(false);
  });

  it('reads and writes cached bytes with original MIME metadata', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const put = vi.fn(async () => undefined);
    const get = vi.fn(async () => ({
      body: streamFrom(bytes),
      size: bytes.length,
      httpMetadata: {
        contentType: 'image/gif'
      },
      customMetadata: {
        finalHash: 'abc123'
      }
    }));
    const env = {
      RUNTIME_CONTENT_CACHE: {
        get,
        put,
        delete: vi.fn(),
        list: vi.fn(),
        getUploadUrl: vi.fn()
      }
    } as unknown as RuntimeEnv;

    await expect(
      writeRuntimeContentCache({
        env,
        key: 'runtime-content/mainnet/demo/1/abc123',
        bytes,
        mimeType: 'image/gif',
        metadata: {
          finalHash: 'abc123'
        }
      })
    ).resolves.toBe(true);

    expect(put).toHaveBeenCalledWith(
      'runtime-content/mainnet/demo/1/abc123',
      bytes,
      {
        httpMetadata: {
          contentType: 'image/gif'
        },
        customMetadata: {
          finalHash: 'abc123'
        }
      }
    );

    const cached = await readRuntimeContentCache(
      env,
      'runtime-content/mainnet/demo/1/abc123'
    );

    expect(cached?.size).toBe(3);
    expect(cached?.httpMetadata?.contentType).toBe('image/gif');
    expect(cached?.customMetadata?.finalHash).toBe('abc123');
  });
});

