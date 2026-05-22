import { describe, expect, it } from 'vitest';
import type { TokenSummary } from '../../viewer/types';
import {
  createAutoGalleryLayout,
  createGalleryAutoLayoutSlots
} from '../galleryAutoLayout';
import {
  parseGalleryLayoutJson,
  serializeGalleryLayout,
  validateGalleryLayout
} from '../gallerySchema';
import {
  getGalleryMediaKind,
  parseGallerySource,
  resolveGalleryMedia
} from '../galleryMediaResolver';
import {
  createGalleryLayoutStorageKey,
  loadGalleryLayout,
  saveGalleryLayout
} from '../galleryPersistence';
import { updateGalleryItemSize } from '../galleryEditor';

const token = (id: bigint, mimeType: string | null = 'image/png'): TokenSummary => ({
  id,
  owner: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
  tokenUri: null,
  meta: mimeType
    ? {
        creator: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        owner: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        mimeType,
        totalSize: 1024n,
        totalChunks: 1n,
        sealed: true,
        finalHash: new Uint8Array([1, 2, 3])
      }
    : null,
  svgDataUri: null
});

describe('gallery schema', () => {
  it('validates the generated layout shape', () => {
    const layout = createAutoGalleryLayout({
      tokens: [token(1n), token(2n)]
    });
    expect(validateGalleryLayout(layout).ok).toBe(true);
    expect(parseGalleryLayoutJson(serializeGalleryLayout(layout)).ok).toBe(true);
  });

  it('rejects independent rectangular display sizing', () => {
    const layout = createAutoGalleryLayout({
      tokens: [token(1n)]
    });
    const invalid = {
      ...layout,
      items: [
        {
          ...layout.items[0],
          display: {
            width: 1,
            height: 2
          }
        }
      ]
    };
    const result = validateGalleryLayout(invalid);
    expect(result.ok).toBe(false);
  });
});

describe('gallery auto layout', () => {
  it('creates deterministic wall placements for at least 50 items', () => {
    const tokens = Array.from({ length: 50 }, (_, index) =>
      token(BigInt(index + 1))
    );
    const first = createAutoGalleryLayout({ tokens });
    const second = createAutoGalleryLayout({ tokens });
    expect(first.items).toHaveLength(50);
    expect(second.items).toEqual(first.items);
    expect(new Set(first.items.map((item) => item.position.wall)).size).toBe(4);
    expect(createGalleryAutoLayoutSlots({ room: first.room })).toHaveLength(52);
  });

  it('keeps resized frames square by changing only display.size', () => {
    const layout = createAutoGalleryLayout({ tokens: [token(1n)] });
    const resized = updateGalleryItemSize(layout, layout.items[0].id, 1.65);
    expect(resized.items[0].display?.size).toBe(1.65);
    expect('width' in (resized.items[0].display ?? {})).toBe(false);
    expect('height' in (resized.items[0].display ?? {})).toBe(false);
  });
});

describe('gallery media resolver', () => {
  it('maps gallery sources and media kinds', () => {
    expect(parseGallerySource('xtrata://123')?.tokenId).toBe(123n);
    expect(getGalleryMediaKind('image/gif')).toBe('gif');
    expect(getGalleryMediaKind('text/html')).toBe('html');
    expect(getGalleryMediaKind('application/json')).toBe('text');
    expect(getGalleryMediaKind(null)).toBe('unknown');
  });

  it('resolves token-backed media records', () => {
    const layout = createAutoGalleryLayout({
      tokens: [token(7n, 'video/webm')]
    });
    const media = resolveGalleryMedia({
      item: layout.items[0],
      token: token(7n, 'video/webm')
    });
    expect(media.kind).toBe('video');
    expect(media.tokenId).toBe(7n);
  });
});

describe('gallery persistence', () => {
  it('saves and loads layout JSON from storage', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      }
    } as Storage;
    const scope = {
      contractId: 'SP123.xtrata-v2-1-0',
      walletAddress: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    };
    const layout = createAutoGalleryLayout({ tokens: [token(1n)] });
    expect(saveGalleryLayout(mockStorage, scope, layout)).toBe(true);
    expect(storage.has(createGalleryLayoutStorageKey(scope))).toBe(true);
    const loaded = loadGalleryLayout(mockStorage, scope);
    expect(loaded?.ok).toBe(true);
  });
});
