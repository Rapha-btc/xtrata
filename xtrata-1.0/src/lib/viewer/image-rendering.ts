export const PIXELATION_RESAMPLE_DELTA_THRESHOLD = 0.05;
export const PIXELATION_MAX_NATURAL_DIMENSION = 512;

type PixelatedRenderParams = {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  mimeType?: string | null;
  isSvgSource?: boolean;
  forcePixelated?: boolean;
};

const normalizeMimeType = (value: string | null | undefined) => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

export const isPixelatedRasterMimeType = (value: string | null | undefined) => {
  const mimeType = normalizeMimeType(value);
  if (!mimeType) {
    return true;
  }
  return (
    mimeType === 'image/png' ||
    mimeType === 'image/gif' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/apng' ||
    mimeType === 'image/bmp' ||
    mimeType === 'image/x-icon' ||
    mimeType === 'image/vnd.microsoft.icon'
  );
};

export const shouldUsePixelatedImageRendering = (
  params: PixelatedRenderParams
) => {
  if (params.isSvgSource) {
    return false;
  }
  if (params.forcePixelated) {
    return true;
  }
  if (!isPixelatedRasterMimeType(params.mimeType)) {
    return false;
  }
  if (
    params.naturalWidth <= 0 ||
    params.naturalHeight <= 0 ||
    params.renderedWidth <= 0 ||
    params.renderedHeight <= 0
  ) {
    return false;
  }

  const scaleX = params.renderedWidth / params.naturalWidth;
  const scaleY = params.renderedHeight / params.naturalHeight;
  const resampleDelta = Math.max(
    Math.abs(scaleX - 1),
    Math.abs(scaleY - 1)
  );
  const maxNaturalDimension = Math.max(
    params.naturalWidth,
    params.naturalHeight
  );

  return (
    resampleDelta >= PIXELATION_RESAMPLE_DELTA_THRESHOLD &&
    maxNaturalDimension <= PIXELATION_MAX_NATURAL_DIMENSION
  );
};

export const shouldUsePixelatedThumbnailRendering = (params: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  mimeType?: string | null;
  forcePixelated?: boolean;
}) =>
  shouldUsePixelatedImageRendering({
    naturalWidth: params.sourceWidth,
    naturalHeight: params.sourceHeight,
    renderedWidth: params.targetWidth,
    renderedHeight: params.targetHeight,
    mimeType: params.mimeType,
    forcePixelated: params.forcePixelated
  });

export const shouldPixelateImageOnUpscale = shouldUsePixelatedImageRendering;
