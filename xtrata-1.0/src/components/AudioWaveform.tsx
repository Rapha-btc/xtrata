import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildPlaceholderWaveformBins,
  decodeAudioWaveformBins
} from '../lib/viewer/audio-waveform';

const waveformCache = new Map<string, number[] | null>();
const waveformInFlight = new Map<string, Promise<number[] | null>>();

type UseAudioWaveformBinsParams = {
  cacheKey: string;
  bytes: Uint8Array | null;
  count?: number;
};

export const useAudioWaveformBins = (params: UseAudioWaveformBinsParams) => {
  const [bins, setBins] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!params.cacheKey || !params.bytes || params.bytes.length === 0) {
      setBins(null);
      setLoading(false);
      return;
    }
    const existing = waveformCache.get(params.cacheKey);
    if (existing !== undefined) {
      setBins(existing);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    let task = waveformInFlight.get(params.cacheKey);
    if (!task) {
      task = decodeAudioWaveformBins({
        bytes: params.bytes,
        count: params.count
      }).then((decoded) => {
        waveformCache.set(params.cacheKey, decoded);
        waveformInFlight.delete(params.cacheKey);
        return decoded;
      });
      waveformInFlight.set(params.cacheKey, task);
    }
    task
      .then((decoded) => {
        if (cancelled) {
          return;
        }
        setBins(decoded);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.cacheKey, params.bytes, params.count]);
  return { bins, loading };
};

type AudioWaveformBarsProps = {
  bins: number[] | null;
  loading?: boolean;
  compact?: boolean;
  progress?: number;
  className?: string;
};

export const AudioWaveformBars = (props: AudioWaveformBarsProps) => {
  const placeholder = useMemo(
    () => buildPlaceholderWaveformBins(props.compact ? 32 : 72),
    [props.compact]
  );
  const bars = props.bins && props.bins.length > 0 ? props.bins : placeholder;
  const progress = Math.max(0, Math.min(1, props.progress ?? 0));
  const className = [
    'audio-waveform',
    props.compact ? 'audio-waveform--compact' : null,
    !props.bins || props.loading ? 'audio-waveform--loading' : null,
    props.className ?? null
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} role="img" aria-label="Audio waveform">
      <div className="audio-waveform__bars" aria-hidden="true">
        {bars.map((level, index) => (
          <span
            key={`wave-${index}`}
            className="audio-waveform__bar"
            style={
              {
                '--wave-level': level.toString(),
                '--wave-index': index.toString()
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span
        className="audio-waveform__transport"
        aria-hidden="true"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  );
};

type AudioWaveformPlayerProps = {
  sourceUrl: string;
  cacheKey: string;
  bytes: Uint8Array | null;
  onPlay?: () => void;
  onError?: () => void;
  onMediaElement?: (node: HTMLAudioElement | null) => void;
};

const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};

export const AudioWaveformPlayer = (props: AudioWaveformPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAudioRef = useCallback(
    (node: HTMLAudioElement | null) => {
      audioRef.current = node;
      props.onMediaElement?.(node);
    },
    [props.onMediaElement]
  );
  const waveform = useAudioWaveformBins({
    cacheKey: `${props.cacheKey}:${props.bytes?.length ?? 0}`,
    bytes: props.bytes,
    count: 88
  });
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setError(null);
  }, [props.sourceUrl, props.cacheKey]);
  const progress = duration > 0 ? currentTime / duration : 0;
  const handleStart = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    try {
      props.onPlay?.();
      await audio.play();
      setError(null);
    } catch (playError) {
      setError('Playback blocked by browser policy. Tap start again.');
    }
  }, [props.onPlay]);
  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
  }, []);
  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
  }, []);
  return (
    <div className="preview-audio-player">
      <audio
        ref={setAudioRef}
        src={props.sourceUrl}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          setDuration(Number.isFinite(media.duration) ? media.duration : 0);
        }}
        onDurationChange={(event) => {
          const media = event.currentTarget;
          setDuration(Number.isFinite(media.duration) ? media.duration : 0);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
        }}
        onPlay={() => {
          setIsPlaying(true);
          props.onPlay?.();
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
        }}
        onError={() => {
          setError('Unable to play this audio source.');
          props.onError?.();
        }}
      />
      <AudioWaveformBars
        bins={waveform.bins}
        loading={waveform.loading}
        progress={progress}
        className="preview-audio-player__waveform"
      />
      <div className="preview-audio-player__timeline" aria-hidden="true">
        <span>{formatAudioTime(currentTime)}</span>
        <span>{formatAudioTime(duration)}</span>
      </div>
      <div className="preview-audio-player__controls">
        <button
          type="button"
          className="button button--ghost button--mini"
          onClick={handleStart}
        >
          Start
        </button>
        <button
          type="button"
          className="button button--ghost button--mini"
          onClick={handlePause}
          disabled={!isPlaying}
        >
          Pause
        </button>
        <button
          type="button"
          className="button button--ghost button--mini"
          onClick={handleStop}
        >
          Stop
        </button>
      </div>
      <p className="preview-audio-player__status">
        {error
          ? error
          : waveform.bins
            ? 'Waveform decoded from inscription audio.'
            : 'Building waveform...'}
      </p>
    </div>
  );
};
