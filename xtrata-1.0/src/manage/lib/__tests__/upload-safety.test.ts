import { describe, expect, it } from 'vitest';
import { buildUploadSafetyWarnings } from '../upload-safety';

describe('buildUploadSafetyWarnings', () => {
  it('warns when selected count does not match remaining supply', () => {
    const warnings = buildUploadSafetyWarnings({
      selectedFiles: [
        { name: '1.png', path: '1.png', size: 100, mimeType: 'image/png' },
        { name: '2.png', path: '2.png', size: 100, mimeType: 'image/png' }
      ],
      existingAssets: [
        { path: 'already.png', filename: 'already.png', state: 'draft' }
      ],
      targetSupply: 5
    });

    expect(warnings.some((warning) => warning.includes('Supply target is 5'))).toBe(
      true
    );
  });

  it('warns on duplicates and overlaps with staged assets', () => {
    const warnings = buildUploadSafetyWarnings({
      selectedFiles: [
        { name: 'A.png', path: 'folder/A.png', size: 120, mimeType: 'image/png' },
        { name: 'a.png', path: 'folder/A.png', size: 140, mimeType: 'image/png' },
        { name: 'existing.png', path: 'existing.png', size: 140, mimeType: 'image/png' }
      ],
      existingAssets: [
        { path: 'existing.png', filename: 'existing.png', state: 'draft' }
      ],
      targetSupply: null
    });

    expect(warnings.some((warning) => warning.includes('duplicate path'))).toBe(true);
    expect(
      warnings.some((warning) => warning.includes('match already staged entries'))
    ).toBe(true);
  });

  it('warns on mixed mime types and unusual file sizes', () => {
    const warnings = buildUploadSafetyWarnings({
      selectedFiles: [
        { name: 'audio.mp3', path: 'audio.mp3', size: 100, mimeType: 'audio/mpeg' },
        { name: 'image.png', path: 'image.png', size: 0, mimeType: 'image/png' },
        {
          name: 'large.png',
          path: 'large.png',
          size: 26 * 1024 * 1024,
          mimeType: 'image/png'
        }
      ],
      existingAssets: [],
      targetSupply: null
    });

    expect(warnings.some((warning) => warning.includes('Mixed file types'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('zero bytes'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('larger than 25 MB'))).toBe(
      true
    );
  });

  it('returns empty warnings for clean selection', () => {
    const warnings = buildUploadSafetyWarnings({
      selectedFiles: [
        { name: '1.png', path: '1.png', size: 100, mimeType: 'image/png' },
        { name: '2.png', path: '2.png', size: 120, mimeType: 'image/png' }
      ],
      existingAssets: [],
      targetSupply: 2
    });

    expect(warnings).toEqual([]);
  });
});
