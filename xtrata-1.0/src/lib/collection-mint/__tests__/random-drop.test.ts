import { describe, expect, it } from 'vitest';
import {
  parseRandomDropManifest,
  selectRandomDropAssets
} from '../random-drop';

describe('parseRandomDropManifest', () => {
  it('accepts object manifest with assets array', () => {
    const parsed = parseRandomDropManifest({
      assets: [{ url: 'https://example.com/a.png', mimeType: 'image/png' }]
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.assets).toEqual([
      {
        url: 'https://example.com/a.png',
        mimeType: 'image/png',
        label: 'Drop item 1'
      }
    ]);
  });

  it('rejects invalid manifest shape', () => {
    const parsed = parseRandomDropManifest({ nope: [] });
    expect(parsed.assets).toEqual([]);
    expect(parsed.errors.length).toBe(1);
  });

  it('rejects duplicate urls', () => {
    const parsed = parseRandomDropManifest({
      assets: ['https://example.com/a.png', 'https://example.com/a.png']
    });
    expect(parsed.assets.length).toBe(1);
    expect(parsed.errors.some((entry) => entry.includes('duplicates'))).toBe(true);
  });
});

describe('selectRandomDropAssets', () => {
  const assets = [
    { url: 'https://example.com/a.png', label: 'a' },
    { url: 'https://example.com/b.png', label: 'b' },
    { url: 'https://example.com/c.png', label: 'c' }
  ];

  it('returns unique subset capped to asset length', () => {
    const selected = selectRandomDropAssets(assets, 10, () => 0.5);
    const urls = selected.map((entry) => entry.url);
    expect(selected.length).toBe(3);
    expect(new Set(urls).size).toBe(3);
  });

  it('returns empty for invalid quantity', () => {
    expect(selectRandomDropAssets(assets, 0)).toEqual([]);
  });
});
