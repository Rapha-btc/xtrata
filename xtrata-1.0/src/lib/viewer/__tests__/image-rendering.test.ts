import { describe, expect, it } from 'vitest';
import {
  getSquareFramedImagePercentages,
  getSquareFramedImageStyle,
  isPixelatedRasterMimeType,
  shouldUsePixelatedImageRendering,
  shouldUsePixelatedThumbnailRendering
} from '../image-rendering';

describe('shouldUsePixelatedImageRendering', () => {
  it('pixelates small raster art when it is upscaled', () => {
    expect(
      shouldUsePixelatedImageRendering({
        naturalWidth: 240,
        naturalHeight: 240,
        renderedWidth: 420,
        renderedHeight: 420,
        mimeType: 'image/png'
      })
    ).toBe(true);
  });

  it('pixelates small raster art when it is materially downscaled', () => {
    expect(
      shouldUsePixelatedImageRendering({
        naturalWidth: 240,
        naturalHeight: 240,
        renderedWidth: 140,
        renderedHeight: 140,
        mimeType: 'image/png'
      })
    ).toBe(true);
  });

  it('does not pixelate jpeg photography by default', () => {
    expect(
      shouldUsePixelatedImageRendering({
        naturalWidth: 240,
        naturalHeight: 240,
        renderedWidth: 420,
        renderedHeight: 420,
        mimeType: 'image/jpeg'
      })
    ).toBe(false);
  });

  it('does not pixelate large raster images even when they upscale', () => {
    expect(
      shouldUsePixelatedImageRendering({
        naturalWidth: 1024,
        naturalHeight: 1024,
        renderedWidth: 1400,
        renderedHeight: 1400,
        mimeType: 'image/png'
      })
    ).toBe(false);
  });

  it('never pixelates svg sources', () => {
    expect(
      shouldUsePixelatedImageRendering({
        naturalWidth: 240,
        naturalHeight: 240,
        renderedWidth: 520,
        renderedHeight: 520,
        mimeType: 'image/svg+xml',
        isSvgSource: true
      })
    ).toBe(false);
  });
});

describe('shouldUsePixelatedThumbnailRendering', () => {
  it('uses nearest-neighbour logic for pixel-art thumbnails', () => {
    expect(
      shouldUsePixelatedThumbnailRendering({
        sourceWidth: 240,
        sourceHeight: 240,
        targetWidth: 256,
        targetHeight: 256,
        mimeType: 'image/png'
      })
    ).toBe(true);
  });
});

describe('isPixelatedRasterMimeType', () => {
  it('treats png-like raster formats as pixelation-eligible', () => {
    expect(isPixelatedRasterMimeType('image/png')).toBe(true);
    expect(isPixelatedRasterMimeType('image/webp')).toBe(true);
    expect(isPixelatedRasterMimeType('image/jpeg')).toBe(false);
  });
});

describe('square image framing', () => {
  it('letterboxes tall images inside the square frame', () => {
    expect(
      getSquareFramedImagePercentages({
        sourceWidth: 216,
        sourceHeight: 288
      })
    ).toEqual({
      widthPercent: 75,
      heightPercent: 100,
      referenceSize: 288
    });
  });

  it('preserves the thumbnail reference floor for small art', () => {
    expect(
      getSquareFramedImagePercentages({
        sourceWidth: 64,
        sourceHeight: 128
      })
    ).toEqual({
      widthPercent: 25,
      heightPercent: 50,
      referenceSize: 256
    });
  });

  it('returns a contain-fit inline style for native animated images', () => {
    expect(
      getSquareFramedImageStyle({
        sourceWidth: 216,
        sourceHeight: 288
      })
    ).toMatchObject({
      width: '75%',
      height: '100%',
      objectFit: 'contain'
    });
  });
});
