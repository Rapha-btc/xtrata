import { describe, expect, it } from 'vitest';
import {
  createSecureRandomSeed,
  parseExtensionList,
  prepareUploadSelection,
  type UploadPrepItem
} from '../upload-prep';

type Payload = { value: string };

const buildItems = (): UploadPrepItem<Payload>[] => [
  {
    id: '1',
    name: 'img-10.png',
    path: 'folder/img-10.png',
    size: 100,
    mimeType: 'image/png',
    lastModified: 1,
    payload: { value: 'img-10' }
  },
  {
    id: '2',
    name: 'img-2.png',
    path: 'folder/img-2.png',
    size: 101,
    mimeType: 'image/png',
    lastModified: 2,
    payload: { value: 'img-2' }
  },
  {
    id: '3',
    name: 'sound.mp3',
    path: 'sound.mp3',
    size: 102,
    mimeType: 'audio/mpeg',
    lastModified: 3,
    payload: { value: 'sound' }
  }
];

describe('upload prep helpers', () => {
  it('parses extension lists consistently', () => {
    expect(parseExtensionList('.png, jpg;*.mp3')).toEqual([
      '.png',
      '.jpg',
      '.mp3'
    ]);
  });

  it('applies include/exclude filters and skips duplicates by policy', () => {
    const source = buildItems();
    const withDuplicate = [...source, { ...source[0], id: '4' }];
    const result = prepareUploadSelection({
      items: withDuplicate,
      includeExtensionsInput: '.png,.mp3',
      excludeExtensionsInput: '.mp3',
      duplicatePolicy: 'skip',
      orderMode: 'as-selected',
      seededOrderSeed: 'seed'
    });

    expect(result.items).toHaveLength(2);
    expect(result.skippedByFilter).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
  });

  it('sorts by filename and seeded random deterministically', () => {
    const source = buildItems();
    const filenameSorted = prepareUploadSelection({
      items: source,
      includeExtensionsInput: '',
      excludeExtensionsInput: '',
      duplicatePolicy: 'warn',
      orderMode: 'filename-natural',
      seededOrderSeed: 'abc'
    });
    expect(filenameSorted.items.map((item) => item.name)).toEqual([
      'img-2.png',
      'img-10.png',
      'sound.mp3'
    ]);

    const seededOne = prepareUploadSelection({
      items: source,
      includeExtensionsInput: '',
      excludeExtensionsInput: '',
      duplicatePolicy: 'warn',
      orderMode: 'seeded-random',
      seededOrderSeed: 'abc'
    });
    const seededTwo = prepareUploadSelection({
      items: source,
      includeExtensionsInput: '',
      excludeExtensionsInput: '',
      duplicatePolicy: 'warn',
      orderMode: 'seeded-random',
      seededOrderSeed: 'abc'
    });

    expect(seededOne.items.map((item) => item.id)).toEqual(
      seededTwo.items.map((item) => item.id)
    );
  });

  it('creates a non-empty secure seed', () => {
    const seed = createSecureRandomSeed();
    expect(seed.length).toBeGreaterThan(0);
  });
});
