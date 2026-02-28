import { describe, expect, it } from 'vitest';
import {
  MIN_WAVEFORM_LEVEL,
  buildPlaceholderWaveformBins,
  buildWaveformBinsFromSamples
} from '../audio-waveform';

describe('audio waveform helpers', () => {
  it('builds placeholder bins within expected range', () => {
    const bins = buildPlaceholderWaveformBins(24);
    expect(bins).toHaveLength(24);
    expect(bins.every((value) => value >= MIN_WAVEFORM_LEVEL && value <= 1)).toBe(
      true
    );
  });

  it('collapses sample data into normalized waveform bins', () => {
    const samples = new Float32Array([0, 0.2, 0.1, 0.5, 0.6, 0.2, 0.9, 0.4]);
    const bins = buildWaveformBinsFromSamples(samples, 4);
    expect(bins).toHaveLength(4);
    expect(Math.max(...bins)).toBe(1);
    expect(bins.every((value) => value >= MIN_WAVEFORM_LEVEL && value <= 1)).toBe(
      true
    );
  });

  it('returns minimum-level bins when no samples are available', () => {
    const bins = buildWaveformBinsFromSamples(new Float32Array(), 6);
    expect(bins).toEqual(Array.from({ length: 6 }, () => MIN_WAVEFORM_LEVEL));
  });
});
