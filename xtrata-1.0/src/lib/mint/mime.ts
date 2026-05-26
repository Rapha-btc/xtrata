const DEFAULT_MIME_TYPE = 'application/octet-stream';
const WEBM_AUDIO_OPUS_MIME_TYPE = 'audio/webm; codecs=opus';
const OGG_OPUS_MIME_TYPE = 'audio/ogg; codecs=opus';

const normalizeMime = (value?: string | null) => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
};

const getMimeEssence = (value?: string | null) => {
  const normalized = normalizeMime(value);
  if (!normalized) {
    return null;
  }
  const [essence] = normalized.split(';', 1);
  return essence.trim() || null;
};

const getExtension = (fileName?: string | null) => {
  const normalized = fileName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === normalized.length - 1) {
    return null;
  }
  return normalized.slice(dotIndex + 1);
};

const toAsciiBytes = (value: string) =>
  Uint8Array.from(value.split('').map((char) => char.charCodeAt(0)));

const indexOfBytes = (haystack: Uint8Array, needle: Uint8Array) => {
  if (needle.length === 0 || haystack.length < needle.length) {
    return -1;
  }
  const end = haystack.length - needle.length;
  for (let offset = 0; offset <= end; offset += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return offset;
    }
  }
  return -1;
};

const WEBM_AUDIO_MARKERS = [
  'A_OPUS',
  'A_VORBIS',
  'A_AAC',
  'A_MPEG/L3',
  'A_AC3',
  'A_EAC3',
  'A_FLAC',
  'A_PCM',
  'A_ALAC'
].map(toAsciiBytes);

const WEBM_VIDEO_MARKERS = [
  'V_VP8',
  'V_VP9',
  'V_AV1',
  'V_THEORA',
  'V_MPEG4',
  'V_MPEGH/ISO/HEVC'
].map(toAsciiBytes);

export const detectWebmTrackKind = (
  bytes?: Uint8Array | null,
  maxScanBytes = 256 * 1024
): 'audio' | 'video' | null => {
  if (!bytes || bytes.length < 4) {
    return null;
  }
  if (
    bytes[0] !== 0x1a ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0xdf ||
    bytes[3] !== 0xa3
  ) {
    return null;
  }
  const scanLimit = Math.min(bytes.length, Math.max(0, maxScanBytes));
  const head = bytes.subarray(0, scanLimit);
  const hasVideoMarker = WEBM_VIDEO_MARKERS.some(
    (marker) => indexOfBytes(head, marker) !== -1
  );
  const hasAudioMarker = WEBM_AUDIO_MARKERS.some(
    (marker) => indexOfBytes(head, marker) !== -1
  );
  if (hasVideoMarker) {
    return 'video';
  }
  if (hasAudioMarker) {
    return 'audio';
  }
  return null;
};

const extensionAudioMime = (extension: string | null) => {
  switch (extension) {
    case 'weba':
      return WEBM_AUDIO_OPUS_MIME_TYPE;
    case 'opus':
      return OGG_OPUS_MIME_TYPE;
    case 'oga':
      return 'audio/ogg';
    default:
      return null;
  }
};

export const resolveInscriptionMimeType = (params: {
  fileName?: string | null;
  declaredMimeType?: string | null;
  bytes?: Uint8Array | null;
}) => {
  const declared = normalizeMime(params.declaredMimeType);
  const essence = getMimeEssence(declared);
  const extension = getExtension(params.fileName);
  const extensionMime = extensionAudioMime(extension);
  const webmTrackKind = detectWebmTrackKind(params.bytes);

  if (webmTrackKind === 'audio') {
    return extension === 'weba' || essence === 'video/webm'
      ? WEBM_AUDIO_OPUS_MIME_TYPE
      : declared ?? WEBM_AUDIO_OPUS_MIME_TYPE;
  }

  if (webmTrackKind === 'video' && declared) {
    return declared;
  }

  if (
    extensionMime &&
    (!declared ||
      essence === DEFAULT_MIME_TYPE ||
      essence === 'video/webm' ||
      essence === 'application/ogg')
  ) {
    return extensionMime;
  }

  return declared ?? DEFAULT_MIME_TYPE;
};
