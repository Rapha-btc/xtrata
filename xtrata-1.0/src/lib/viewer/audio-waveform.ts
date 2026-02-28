export const DEFAULT_WAVEFORM_BINS = 72;
export const MIN_WAVEFORM_LEVEL = 0.08;

export const buildPlaceholderWaveformBins = (count = 48) => {
  if (count <= 0) {
    return [] as number[];
  }
  return Array.from({ length: count }, (_, index) => {
    const swing = Math.abs(Math.sin((index + 1) * 0.43));
    const pulse = Math.abs(Math.cos((index + 2) * 0.21));
    const mixed = 0.35 + swing * 0.45 + pulse * 0.2;
    return Math.min(1, Math.max(MIN_WAVEFORM_LEVEL, mixed));
  });
};

export const buildWaveformBinsFromSamples = (
  samples: Float32Array,
  count = DEFAULT_WAVEFORM_BINS
) => {
  if (count <= 0) {
    return [] as number[];
  }
  if (samples.length === 0) {
    return Array.from({ length: count }, () => MIN_WAVEFORM_LEVEL);
  }
  const bins = new Array<number>(count).fill(0);
  const step = samples.length / count;
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * step);
    const end = Math.max(start + 1, Math.floor((index + 1) * step));
    let peak = 0;
    for (let cursor = start; cursor < end && cursor < samples.length; cursor += 1) {
      const amplitude = Math.abs(samples[cursor] ?? 0);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
    bins[index] = peak;
  }
  const max = bins.reduce((highest, value) => Math.max(highest, value), 0);
  if (max <= 0) {
    return bins.map(() => MIN_WAVEFORM_LEVEL);
  }
  return bins.map((value) =>
    Math.min(1, Math.max(MIN_WAVEFORM_LEVEL, value / max))
  );
};

const collapseChannels = (buffer: AudioBuffer) => {
  if (buffer.numberOfChannels <= 0) {
    return new Float32Array();
  }
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }
  const length = buffer.length;
  const mixed = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const amplitude = Math.abs(channelData[index] ?? 0);
      if (amplitude > mixed[index]) {
        mixed[index] = amplitude;
      }
    }
  }
  return mixed;
};

let decoderContext: AudioContext | null = null;

const getDecoderContext = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (decoderContext) {
    return decoderContext;
  }
  const contextConstructor = (
    window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).AudioContext ??
    (window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
  if (!contextConstructor) {
    return null;
  }
  decoderContext = new contextConstructor();
  return decoderContext;
};

export const decodeAudioWaveformBins = async (params: {
  bytes: Uint8Array;
  count?: number;
}) => {
  if (!params.bytes || params.bytes.length === 0) {
    return null;
  }
  const context = getDecoderContext();
  if (!context) {
    return null;
  }
  try {
    const copy = params.bytes.slice();
    const source = copy.buffer.slice(
      copy.byteOffset,
      copy.byteOffset + copy.byteLength
    );
    const audioBuffer = await context.decodeAudioData(source);
    const mixed = collapseChannels(audioBuffer);
    return buildWaveformBinsFromSamples(
      mixed,
      params.count ?? DEFAULT_WAVEFORM_BINS
    );
  } catch (error) {
    return null;
  }
};
