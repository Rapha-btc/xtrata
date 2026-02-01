import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { XtrataClient } from '../lib/contract/client';
import type { StreamStatus, TokenSummary } from '../lib/viewer/types';
import {
  fetchOnChainContent,
  fetchTokenImageFromUri,
  getMediaKind,
  getTextPreview,
  isDataUri,
  isHttpUrl,
  joinChunks,
  MAX_AUTO_PREVIEW_BYTES,
  resolveMimeType,
  sniffMimeType,
  extractImageFromMetadata
} from '../lib/viewer/content';
import {
  createBridgeId,
  injectRecursiveBridgeHtml,
  registerRecursiveBridge
} from '../lib/viewer/recursive';
import {
  type StreamPhase,
  shouldAllowTokenUriPreview
} from '../lib/viewer/streaming';
import { getTokenContentKey, getTokenThumbnailKey } from '../lib/viewer/queries';
import {
  buildInscriptionThumbnailCacheKey,
  loadInscriptionPreviewFromCache,
  loadInscriptionThumbnailRecord,
  saveInscriptionThumbnailToCache,
  saveInscriptionPreviewToCache,
  saveInscriptionToTempCache,
  TEMP_CACHE_MAX_BYTES,
  TEMP_CACHE_TTL_MS
} from '../lib/viewer/cache';
import { createImageThumbnail, THUMBNAIL_SIZE } from '../lib/viewer/thumbnail';
import { createObjectUrl } from '../lib/utils/blob';
import { formatBytes, truncateMiddle } from '../lib/utils/format';
import { bytesToHex } from '../lib/utils/encoding';
import { logDebug, logInfo, logWarn, shouldLog } from '../lib/utils/logger';

type TokenContentPreviewProps = {
  token: TokenSummary;
  contractId: string;
  senderAddress: string;
  client: XtrataClient;
  isActiveTab?: boolean;
};

const STREAM_TARGET_SECONDS = 10;
const STREAM_MAX_INITIAL_CHUNKS = 24;
const STREAM_BATCH_SIZE = 4;
const STREAM_SOURCEOPEN_TIMEOUT_MS = 3000;
const STREAM_APPEND_TIMEOUT_MS = 5000;

const buildStreamMimeCandidates = (mimeType: string | null) => {
  if (!mimeType) {
    return [] as string[];
  }
  const trimmed = mimeType.trim().toLowerCase();
  const candidates = new Set<string>();
  if (trimmed) {
    candidates.add(trimmed);
  }
  const base = trimmed.split(';')[0].trim();
  if (base) {
    candidates.add(base);
  }
  const codecMatch = trimmed.match(/codecs=([^;]+)/);
  if (codecMatch && base) {
    const rawCodecs = codecMatch[1].trim().replace(/^"|"$/g, '');
    if (rawCodecs) {
      candidates.add(`${base}; codecs=${rawCodecs}`);
      candidates.add(`${base}; codecs="${rawCodecs}"`);
    }
  }
  if (!codecMatch && base === 'audio/webm') {
    candidates.add('audio/webm; codecs=opus');
    candidates.add('audio/webm; codecs="opus"');
  }
  if (!codecMatch && base === 'video/webm') {
    candidates.add('video/webm; codecs=vp9,opus');
    candidates.add('video/webm; codecs="vp9,opus"');
    candidates.add('video/webm; codecs=vp8,opus');
    candidates.add('video/webm; codecs="vp8,opus"');
    candidates.add('video/webm; codecs=vp9');
    candidates.add('video/webm; codecs="vp9"');
    candidates.add('video/webm; codecs=vp8');
    candidates.add('video/webm; codecs="vp8"');
    // Audio-only webm files are sometimes labeled as video/webm.
    candidates.add('audio/webm; codecs=opus');
    candidates.add('audio/webm; codecs="opus"');
  }
  const normalized = trimmed
    .replace(/codecs=\"([^\"]+)\"/g, 'codecs=$1')
    .replace(/\s+/g, ' ');
  if (normalized) {
    candidates.add(normalized);
  }
  return Array.from(candidates);
};

const getBufferedSeconds = (media: HTMLMediaElement | null) => {
  if (!media) {
    return 0;
  }
  try {
    const ranges = media.buffered;
    if (ranges.length === 0) {
      return 0;
    }
    return ranges.end(ranges.length - 1);
  } catch (error) {
    return 0;
  }
};

export default function TokenContentPreview(props: TokenContentPreviewProps) {
  const queryClient = useQueryClient();
  const isActiveTab = props.isActiveTab !== false;
  const lastContentLogRef = useRef<number | null>(null);
  const tokenUriLoggedRef = useRef(false);
  const streamConfigLoggedRef = useRef(false);
  const streamEligibilityLoggedRef = useRef(false);
  const loadGateLoggedRef = useRef(false);
  const tokenUriGateLogRef = useRef<string | null>(null);
  const previewSourceLogRef = useRef<string | null>(null);
  const imageMetricsLogRef = useRef<string | null>(null);
  const imageErrorLogRef = useRef<string | null>(null);
  const [tokenUriFailed, setTokenUriFailed] = useState(false);
  const [pixelatePreview, setPixelatePreview] = useState(false);
  const [bridgeSource, setBridgeSource] = useState<MessageEventSource | null>(null);
  const [thumbnailPending, setThumbnailPending] = useState(false);
  const [thumbnailStatusMessage, setThumbnailStatusMessage] = useState<string | null>(
    null
  );
  useEffect(() => {
    previewSourceLogRef.current = null;
    imageMetricsLogRef.current = null;
    imageErrorLogRef.current = null;
    setTokenUriFailed(false);
    setPixelatePreview(false);
    setThumbnailPending(false);
    setThumbnailStatusMessage(null);
  }, [props.token.id, props.token.tokenUri]);
  const mimeType = props.token.meta?.mimeType ?? null;
  const mediaKind = getMediaKind(mimeType);
  const totalSize = props.token.meta?.totalSize ?? null;
  const svgPreview =
    mediaKind === 'svg' && props.token.svgDataUri
      ? props.token.svgDataUri
      : null;
  const contentQueryKey = useMemo(
    () => getTokenContentKey(props.contractId, props.token.id),
    [props.contractId, props.token.id]
  );
  const streamStatusKey = useMemo(
    () => [
      'viewer',
      props.contractId,
      'stream-status',
      props.token.id.toString()
    ],
    [props.contractId, props.token.id]
  );
  const cachedContent = queryClient.getQueryData<Uint8Array>(contentQueryKey);
  const hasCachedContent = !!cachedContent && cachedContent.length > 0;
  const streamMimeType = mimeType ? mimeType.toLowerCase() : null;
  const isWebm = !!streamMimeType && streamMimeType.includes('webm');
  const isStreamableKind =
    !!streamMimeType &&
    (streamMimeType.startsWith('audio/') ||
      streamMimeType.startsWith('video/'));
  const mediaSourceAvailable = typeof MediaSource !== 'undefined';
  const streamMimeCandidates = buildStreamMimeCandidates(streamMimeType);
  const mediaSourceSupported =
    mediaSourceAvailable &&
    streamMimeCandidates.some((candidate) =>
      MediaSource.isTypeSupported(candidate)
    );
  const autoStream =
    !!props.token.meta &&
    isStreamableKind &&
    !isWebm &&
    mediaSourceAvailable &&
    totalSize !== null &&
    totalSize > MAX_AUTO_PREVIEW_BYTES;
  const autoLoad =
    totalSize !== null &&
    (totalSize <= MAX_AUTO_PREVIEW_BYTES || isWebm) &&
    !svgPreview;

  const [loadRequested, setLoadRequested] = useState(
    () => autoLoad || hasCachedContent || autoStream
  );
  const [forceFullLoad, setForceFullLoad] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamBufferedSeconds, setStreamBufferedSeconds] = useState(0);
  const streamStartRef = useRef<(() => void) | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const streamProgressRef = useRef<{
    phase: StreamPhase;
    chunks: number;
    buffered: number;
    percent: number;
  } | null>(null);
  const updateStreamStatus = useCallback(
    (partial: Partial<Exclude<StreamStatus, null>>) => {
      queryClient.setQueryData<StreamStatus>(streamStatusKey, (previous) => ({
        id: props.token.id.toString(),
        phase: 'idle',
        bufferedSeconds: 0,
        chunksLoaded: 0,
        totalChunks: props.token.meta
          ? Number(props.token.meta.totalChunks)
          : 0,
        mimeType: streamMimeType ?? null,
        updatedAt: Date.now(),
        ...(previous ?? {}),
        ...partial
      }));
    },
    [queryClient, streamStatusKey, props.token.id, props.token.meta, streamMimeType]
  );
  const clearStreamStatus = useCallback(() => {
    queryClient.setQueryData(streamStatusKey, null);
  }, [queryClient, streamStatusKey]);

  useEffect(() => {
    if (autoLoad || hasCachedContent || autoStream) {
      setLoadRequested(true);
    }
  }, [props.token.id, autoLoad, hasCachedContent, autoStream]);

  useEffect(() => {
    setForceFullLoad(false);
  }, [props.token.id]);

  useEffect(() => {
    lastContentLogRef.current = null;
    tokenUriLoggedRef.current = false;
    streamEligibilityLoggedRef.current = false;
    loadGateLoggedRef.current = false;
    tokenUriGateLogRef.current = null;
    streamProgressRef.current = null;
  }, [props.token.id, props.token.tokenUri]);

  const shouldStream =
    !!props.token.meta &&
    loadRequested &&
    !forceFullLoad &&
    !hasCachedContent &&
    !svgPreview &&
    isStreamableKind &&
    !isWebm &&
    mediaSourceAvailable &&
    isActiveTab;

  const contentQuery = useQuery({
    queryKey: contentQueryKey,
    queryFn: () => {
      if (!props.token.meta) {
        return Promise.resolve(new Uint8Array());
      }
      return fetchOnChainContent({
        client: props.client,
        id: props.token.id,
        senderAddress: props.senderAddress,
        totalSize: props.token.meta.totalSize,
        mimeType: props.token.meta.mimeType ?? null
      });
    },
    enabled:
      !!props.token.meta && loadRequested && !svgPreview && !shouldStream && isActiveTab,
    initialData: cachedContent,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const resolvedMimeType = resolveMimeType(mimeType, contentQuery.data);
  const resolvedMediaKind = getMediaKind(resolvedMimeType);
  const isHtmlDocument =
    resolvedMimeType === 'text/html' ||
    resolvedMimeType === 'application/xhtml+xml';
  const isPdf = resolvedMimeType === 'application/pdf';
  const hasContent = !!contentQuery.data && contentQuery.data.length > 0;
  const contentBytes = contentQuery.data ? contentQuery.data.length : null;
  const sniffedMimeType = useMemo(
    () => (contentQuery.data ? sniffMimeType(contentQuery.data) : null),
    [contentQuery.data]
  );
  const sniffedKind = sniffedMimeType ? getMediaKind(sniffedMimeType) : null;
  const hasStream = !!streamUrl;
  const hasStreamPreview =
    hasStream &&
    (streamPhase === 'playable' ||
      streamPhase === 'loading' ||
      streamPhase === 'complete');
  const hasPreviewContent = hasContent || hasStreamPreview;
  const ownerAddress = props.token.owner ?? 'Unknown';
  const creatorAddress = props.token.meta?.creator ?? null;
  const tokenIdLabel = `#${props.token.id.toString()}`;
  const tokenUriValue = props.token.tokenUri ?? null;
  const tokenUriLabel = tokenUriValue
    ? truncateMiddle(tokenUriValue, 12, 10)
    : 'Not set';
  const tokenUriLink =
    tokenUriValue && isHttpUrl(tokenUriValue) ? tokenUriValue : null;
  const thumbnailRecordKey = useMemo(
    () => [
      'viewer',
      props.contractId,
      'thumbnail-record',
      props.token.id.toString()
    ],
    [props.contractId, props.token.id]
  );
  const thumbnailRecordQuery = useQuery({
    queryKey: thumbnailRecordKey,
    queryFn: () => loadInscriptionThumbnailRecord(props.contractId, props.token.id),
    enabled: isActiveTab,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const thumbnailRecord = thumbnailRecordQuery.data ?? null;
  const thumbnailValue = thumbnailRecord?.value ?? null;
  const thumbnailStatus = thumbnailRecordQuery.isLoading
    ? 'Checking...'
    : thumbnailValue
      ? 'Cached'
      : 'Missing';
  const thumbnailFallbackLabel = thumbnailValue
    ? 'Thumbnail cache'
    : tokenUriValue
      ? 'Token URI fallback'
      : 'None';
  const thumbnailTimestamp = thumbnailRecord
    ? new Date(thumbnailRecord.timestamp).toLocaleString()
    : null;
  const thumbnailUrl = useMemo(() => {
    if (!thumbnailValue?.data || thumbnailValue.data.length === 0) {
      return null;
    }
    return createObjectUrl(
      thumbnailValue.data,
      thumbnailValue.mimeType ?? 'image/webp'
    );
  }, [thumbnailValue]);
  useEffect(() => {
    if (!thumbnailUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);
  const finalHash = props.token.meta?.finalHash
    ? bytesToHex(props.token.meta.finalHash)
    : null;
  const finalHashLabel = finalHash
    ? truncateMiddle(finalHash, 12, 10)
    : 'Unavailable';
  const mediaBadge = (() => {
    if (isPdf) {
      return 'PDF';
    }
    switch (resolvedMediaKind) {
      case 'image':
        return 'IMAGE';
      case 'svg':
        return 'SVG';
      case 'audio':
        return 'AUDIO';
      case 'video':
        return 'VIDEO';
      case 'text':
        return 'TEXT';
      case 'html':
        return 'HTML';
      case 'binary':
        return 'BIN';
      default:
        return 'UNKNOWN';
    }
  })();
  const mediaBadgeTitle = resolvedMimeType ?? mimeType ?? 'Unknown mime type';

  useEffect(() => {
    if (!props.token.meta) {
      return;
    }
    if (streamEligibilityLoggedRef.current) {
      return;
    }
    streamEligibilityLoggedRef.current = true;
    logInfo('stream', 'Stream eligibility', {
      id: props.token.id.toString(),
      mimeType: streamMimeType,
      streamable: isStreamableKind,
      mediaSourceAvailable,
      mediaSourceSupported,
      candidateMimeTypes: streamMimeCandidates,
      autoStream,
      totalSize: totalSize !== null ? totalSize.toString() : null,
      maxAutoPreviewBytes: MAX_AUTO_PREVIEW_BYTES.toString()
    });
  }, [
    props.token.id,
    props.token.meta,
    streamMimeType,
    isStreamableKind,
    mediaSourceAvailable,
    mediaSourceSupported,
    streamMimeCandidates,
    autoStream,
    totalSize
  ]);

  const contentUrl = useMemo(() => {
    if (!contentQuery.data || contentQuery.data.length === 0) {
      return null;
    }
    return createObjectUrl(contentQuery.data, resolvedMimeType ?? mimeType);
  }, [contentQuery.data, resolvedMimeType, mimeType]);

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(contentUrl);
    };
  }, [contentUrl]);

  useEffect(() => {
    if (!shouldStream) {
      setStreamUrl(null);
      setStreamPhase('idle');
      setStreamError(null);
      setStreamBufferedSeconds(0);
      streamStartRef.current = null;
      clearStreamStatus();
      return;
    }
    if (!props.token.meta || !streamMimeType) {
      return;
    }
    const totalChunks = Number(props.token.meta.totalChunks);
    const totalSizeNumber = Number(props.token.meta.totalSize);
    if (!Number.isSafeInteger(totalChunks) || totalChunks <= 0) {
      setStreamPhase('error');
      setStreamError('Invalid chunk count for stream.');
      setForceFullLoad(true);
      return;
    }
    const canCachePreview =
      Number.isSafeInteger(totalSizeNumber) && totalSizeNumber > 0;
    const enableTempFullCache =
      canCachePreview &&
      totalSizeNumber > Number(MAX_AUTO_PREVIEW_BYTES) &&
      totalSizeNumber <= TEMP_CACHE_MAX_BYTES;

    if (!streamConfigLoggedRef.current) {
      streamConfigLoggedRef.current = true;
      logInfo('stream', 'Stream batch config', {
        batchSize: STREAM_BATCH_SIZE,
        maxInitialChunks: STREAM_MAX_INITIAL_CHUNKS,
        targetSeconds: STREAM_TARGET_SECONDS
      });
    }

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    let cancelled = false;
    let sourceBuffer: SourceBuffer | null = null;
    let nextIndex = 0;
    let loadingRemaining = false;
    let previewBase: Uint8Array | null = null;
    let previewBaseChunks = 0;
    let previewChunkSize = 0;
    const previewChunks: Uint8Array[] = [];
    const fullCacheChunks: Uint8Array[] = [];
    let lazyLoadHandle: number | null = null;
    let lazyLoadMode: 'idle' | 'timeout' | null = null;

    setStreamUrl(objectUrl);
    setStreamPhase('buffering');
    setStreamError(null);
    setStreamBufferedSeconds(0);
    logInfo('stream', 'Streaming started', {
      id: props.token.id.toString(),
      mimeType: streamMimeType,
      totalChunks,
      batchSize: STREAM_BATCH_SIZE
    });
    updateStreamStatus({
      phase: 'buffering',
      bufferedSeconds: 0,
      chunksLoaded: 0,
      totalChunks,
      mimeType: streamMimeType ?? null
    });

    const logStreamProgress = (
      phase: StreamPhase,
      chunksLoaded: number,
      bufferedSeconds: number
    ) => {
      const percent = totalChunks > 0 ? (chunksLoaded / totalChunks) * 100 : 0;
      const previous = streamProgressRef.current;
      const bufferedDelta = previous ? bufferedSeconds - previous.buffered : bufferedSeconds;
      const chunkDelta = previous ? chunksLoaded - previous.chunks : chunksLoaded;
      const percentDelta = previous ? percent - previous.percent : percent;
      if (
        !previous ||
        phase !== previous.phase ||
        chunkDelta >= STREAM_BATCH_SIZE ||
        bufferedDelta >= 2 ||
        percentDelta >= 10
      ) {
        streamProgressRef.current = {
          phase,
          chunks: chunksLoaded,
          buffered: bufferedSeconds,
          percent
        };
        logInfo('stream', 'Stream progress', {
          id: props.token.id.toString(),
          phase,
          chunksLoaded,
          totalChunks,
          bufferedSeconds: bufferedSeconds.toFixed(2),
          percent: percent.toFixed(1)
        });
      }
    };

    const updateBufferedSeconds = (phase: StreamPhase) => {
      const seconds = getBufferedSeconds(mediaRef.current);
      setStreamBufferedSeconds(seconds);
      updateStreamStatus({
        phase,
        bufferedSeconds: seconds,
        chunksLoaded: nextIndex
      });
      logStreamProgress(phase, nextIndex, seconds);
      return seconds;
    };

    const appendBufferAsync = (buffer: Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        if (!sourceBuffer || cancelled) {
          reject(new Error('Stream buffer unavailable'));
          return;
        }
        let timeoutHandle: number | null = null;
        const clearHandlers = () => {
          if (timeoutHandle !== null && typeof window !== 'undefined') {
            window.clearTimeout(timeoutHandle);
          }
          sourceBuffer?.removeEventListener('error', handleError);
          sourceBuffer?.removeEventListener('updateend', handleUpdateEnd);
        };
        const handleError = () => {
          clearHandlers();
          reject(new Error('Stream append failed'));
        };
        const handleUpdateEnd = () => {
          clearHandlers();
          resolve();
        };
        const handleTimeout = () => {
          clearHandlers();
          reject(new Error('Stream append timed out'));
        };
        if (typeof window !== 'undefined') {
          timeoutHandle = window.setTimeout(
            handleTimeout,
            STREAM_APPEND_TIMEOUT_MS
          );
        }
        sourceBuffer.addEventListener('error', handleError, { once: true });
        sourceBuffer.addEventListener('updateend', handleUpdateEnd, { once: true });
        try {
          sourceBuffer.appendBuffer(buffer);
        } catch (error) {
          clearHandlers();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

    const fetchChunk = async (index: bigint) => {
      const chunk = await props.client.getChunk(
        props.token.id,
        index,
        props.senderAddress
      );
      if (!chunk || chunk.length === 0) {
        throw new Error(`Missing chunk ${index.toString()}`);
      }
      return chunk;
    };

    const fetchBatch = async (start: number, size: number) => {
      const end = Math.min(totalChunks, start + size);
      const indexes = Array.from({ length: end - start }, (_, offset) =>
        BigInt(start + offset)
      );
      if (indexes.length === 0) {
        return [] as Uint8Array[];
      }
      if (props.client.supportsChunkBatchRead && indexes.length > 1) {
        try {
          const batch = await props.client.getChunkBatch(
            props.token.id,
            indexes,
            props.senderAddress
          );
          const resolved = new Array<Uint8Array>(indexes.length);
          const missing: number[] = [];
          for (let idx = 0; idx < indexes.length; idx += 1) {
            const chunk = batch[idx];
            if (chunk && chunk.length > 0) {
              resolved[idx] = chunk;
            } else {
              missing.push(idx);
            }
          }
          if (missing.length > 0) {
            logWarn('stream', 'Batch read missing chunks; retrying individually', {
              id: props.token.id.toString(),
              missing: missing.map((idx) => indexes[idx].toString())
            });
            for (const idx of missing) {
              resolved[idx] = await fetchChunk(indexes[idx]);
            }
          }
          return resolved;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logWarn('stream', 'Batch read failed; using per-chunk', {
            id: props.token.id.toString(),
            error: message
          });
        }
      }
      const resolved: Uint8Array[] = [];
      for (const index of indexes) {
        resolved.push(await fetchChunk(index));
      }
      return resolved;
    };

    const cancelLazyLoad = () => {
      if (lazyLoadHandle === null) {
        return;
      }
      if (lazyLoadMode === 'idle' && typeof window !== 'undefined') {
        window.cancelIdleCallback?.(lazyLoadHandle);
      } else if (typeof window !== 'undefined') {
        window.clearTimeout(lazyLoadHandle);
      }
      lazyLoadHandle = null;
      lazyLoadMode = null;
    };

    const scheduleLazyLoad = () => {
      if (cancelled || loadingRemaining || nextIndex >= totalChunks) {
        return;
      }
      cancelLazyLoad();
      const start = () => {
        if (cancelled || loadingRemaining) {
          return;
        }
        void loadRemaining();
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        lazyLoadHandle = window.requestIdleCallback(start, { timeout: 5000 });
        lazyLoadMode = 'idle';
      } else if (typeof window !== 'undefined') {
        lazyLoadHandle = window.setTimeout(start, 5000);
        lazyLoadMode = 'timeout';
      }
    };

    const persistPreviewCache = async () => {
      if (!canCachePreview) {
        return;
      }
      const previewChunkCount = previewBaseChunks + previewChunks.length;
      if (previewChunkCount <= 0 || previewChunkCount > totalChunks) {
        return;
      }
      const chunkSize = previewChunkSize || previewBase?.length || 0;
      if (chunkSize <= 0) {
        return;
      }
      const combined = previewBase
        ? joinChunks([previewBase, ...previewChunks])
        : joinChunks(previewChunks);
      await saveInscriptionPreviewToCache(
        props.contractId,
        props.token.id,
        combined,
        {
          mimeType: streamMimeType,
          chunks: previewChunkCount,
          totalChunks,
          totalSize: totalSizeNumber,
          chunkSize
        }
      );
    };

    const persistFullCache = async () => {
      if (!enableTempFullCache || fullCacheChunks.length === 0) {
        return;
      }
      const combined = joinChunks(fullCacheChunks);
      if (combined.length < totalSizeNumber) {
        return;
      }
      const trimmed =
        combined.length > totalSizeNumber
          ? combined.slice(0, totalSizeNumber)
          : combined;
      await saveInscriptionToTempCache(
        props.contractId,
        props.token.id,
        trimmed,
        streamMimeType ?? null,
        TEMP_CACHE_TTL_MS
      );
    };

    const hydratePreviewFromCache = async () => {
      if (!canCachePreview) {
        return;
      }
      const cached = await loadInscriptionPreviewFromCache(
        props.contractId,
        props.token.id
      );
      if (
        !cached ||
        cached.totalChunks !== totalChunks ||
        cached.totalSize !== totalSizeNumber ||
        cached.chunks <= 0 ||
        cached.chunks > totalChunks ||
        cached.chunkSize <= 0
      ) {
        return;
      }
      previewBase = cached.data;
      previewBaseChunks = cached.chunks;
      previewChunkSize = cached.chunkSize;
      if (enableTempFullCache) {
        fullCacheChunks.push(cached.data);
      }
      await appendBufferAsync(cached.data);
      nextIndex = cached.chunks;
      logInfo('stream', 'Loaded stream preview from cache', {
        id: props.token.id.toString(),
        chunks: cached.chunks,
        bytes: cached.data.length
      });
    };

    const bufferInitial = async () => {
      try {
        const initialLimit = Math.min(totalChunks, STREAM_MAX_INITIAL_CHUNKS);
        let bufferedSeconds = updateBufferedSeconds('buffering');
        if (bufferedSeconds >= STREAM_TARGET_SECONDS) {
          setStreamPhase('playable');
          updateStreamStatus({
            phase: 'playable',
            bufferedSeconds,
            chunksLoaded: nextIndex
          });
          logInfo('stream', 'Stream ready to play', {
            id: props.token.id.toString(),
            bufferedSeconds: bufferedSeconds.toFixed(2),
            chunksLoaded: nextIndex
          });
          await persistPreviewCache();
          scheduleLazyLoad();
          return;
        }
        while (!cancelled && nextIndex < initialLimit) {
          const batchSize = Math.min(
            STREAM_BATCH_SIZE,
            initialLimit - nextIndex
          );
          const chunks = await fetchBatch(nextIndex, batchSize);
          for (const chunk of chunks) {
            if (cancelled) {
              return;
            }
            if (!previewChunkSize) {
              previewChunkSize = chunk.length;
            }
            previewChunks.push(chunk);
            if (enableTempFullCache) {
              fullCacheChunks.push(chunk);
            }
            await appendBufferAsync(chunk);
            nextIndex += 1;
          }
          bufferedSeconds = updateBufferedSeconds('buffering');
          if (bufferedSeconds >= STREAM_TARGET_SECONDS) {
            break;
          }
        }
        if (cancelled) {
          return;
        }
        bufferedSeconds = updateBufferedSeconds('buffering');
        if (nextIndex >= totalChunks) {
          setStreamPhase('complete');
          updateStreamStatus({
            phase: 'complete',
            bufferedSeconds,
            chunksLoaded: nextIndex
          });
          logInfo('stream', 'Streaming complete', {
            id: props.token.id.toString()
          });
          if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
          await persistPreviewCache();
          await persistFullCache();
          return;
        }
        setStreamPhase('playable');
        updateStreamStatus({
          phase: 'playable',
          bufferedSeconds,
          chunksLoaded: nextIndex
        });
        logInfo('stream', 'Stream ready to play', {
          id: props.token.id.toString(),
          bufferedSeconds: bufferedSeconds.toFixed(2),
          chunksLoaded: nextIndex
        });
        await persistPreviewCache();
        scheduleLazyLoad();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStreamPhase('error');
        setStreamError(message);
        updateStreamStatus({
          phase: 'error',
          bufferedSeconds: streamBufferedSeconds,
          chunksLoaded: nextIndex
        });
        logWarn('stream', 'Stream buffering failed', {
          id: props.token.id.toString(),
          error: message
        });
        if (nextIndex === 0) {
          setForceFullLoad(true);
        }
      }
    };

    const loadRemaining = async () => {
      if (loadingRemaining || nextIndex >= totalChunks || cancelled) {
        return;
      }
      loadingRemaining = true;
      cancelLazyLoad();
      setStreamPhase('loading');
      updateStreamStatus({
        phase: 'loading',
        bufferedSeconds: streamBufferedSeconds,
        chunksLoaded: nextIndex
      });
      logInfo('stream', 'Streaming remainder', {
        id: props.token.id.toString(),
        fromChunk: nextIndex,
        totalChunks
      });
      try {
        while (!cancelled && nextIndex < totalChunks) {
          const batchSize = Math.min(
            STREAM_BATCH_SIZE,
            totalChunks - nextIndex
          );
          const chunks = await fetchBatch(nextIndex, batchSize);
          for (const chunk of chunks) {
            if (cancelled) {
              return;
            }
            if (enableTempFullCache) {
              fullCacheChunks.push(chunk);
            }
            await appendBufferAsync(chunk);
            nextIndex += 1;
          }
          updateBufferedSeconds('loading');
        }
        if (!cancelled && mediaSource.readyState === 'open') {
          mediaSource.endOfStream();
        }
        if (!cancelled) {
          setStreamPhase('complete');
          updateStreamStatus({
            phase: 'complete',
            bufferedSeconds: streamBufferedSeconds,
            chunksLoaded: nextIndex
          });
          logInfo('stream', 'Streaming complete', {
            id: props.token.id.toString()
          });
          await persistFullCache();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStreamPhase('error');
        setStreamError(message);
        updateStreamStatus({
          phase: 'error',
          bufferedSeconds: streamBufferedSeconds,
          chunksLoaded: nextIndex
        });
        logWarn('stream', 'Stream load failed', {
          id: props.token.id.toString(),
          error: message
        });
      }
    };

    streamStartRef.current = () => {
      cancelLazyLoad();
      void loadRemaining();
    };

    let sourceOpenTimeout: number | null = null;
    const handleSourceOpen = () => {
      if (cancelled) {
        return;
      }
      if (sourceOpenTimeout !== null && typeof window !== 'undefined') {
        window.clearTimeout(sourceOpenTimeout);
        sourceOpenTimeout = null;
      }
      let lastError: string | null = null;
      let selectedMime: string | null = null;
      for (const candidate of streamMimeCandidates) {
        try {
          sourceBuffer = mediaSource.addSourceBuffer(candidate);
          selectedMime = candidate;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      if (!sourceBuffer) {
        const message = lastError ?? 'No supported mime type for streaming';
        setStreamPhase('error');
        setStreamError(message);
        setForceFullLoad(true);
        logWarn('stream', 'Stream source buffer unavailable', {
          id: props.token.id.toString(),
          error: message,
          candidates: streamMimeCandidates
        });
        return;
      }
      sourceBuffer.mode = 'sequence';
      logInfo('stream', 'Stream source buffer ready', {
        id: props.token.id.toString(),
        mimeType: selectedMime
      });
      const start = async () => {
        await hydratePreviewFromCache();
        await bufferInitial();
      };
      void start();
    };

    mediaSource.addEventListener('sourceopen', handleSourceOpen);
    if (typeof window !== 'undefined') {
      sourceOpenTimeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        if (mediaSource.readyState === 'open') {
          return;
        }
        const message = 'MediaSource did not open in time';
        setStreamPhase('error');
        setStreamError(message);
        updateStreamStatus({
          phase: 'error',
          bufferedSeconds: streamBufferedSeconds,
          chunksLoaded: nextIndex
        });
        setForceFullLoad(true);
        logWarn('stream', 'Stream sourceopen timeout', {
          id: props.token.id.toString(),
          mimeType: streamMimeType ?? null
        });
      }, STREAM_SOURCEOPEN_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      cancelLazyLoad();
      streamStartRef.current = null;
      mediaSource.removeEventListener('sourceopen', handleSourceOpen);
      if (sourceOpenTimeout !== null && typeof window !== 'undefined') {
        window.clearTimeout(sourceOpenTimeout);
      }
      if (mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream();
        } catch (error) {
          // ignore cleanup errors
        }
      }
      URL.revokeObjectURL(objectUrl);
    };
  }, [
    shouldStream,
    props.token.id,
    props.token.meta?.totalChunks,
    props.token.meta?.totalSize,
    props.senderAddress,
    props.client,
    props.contractId,
    streamMimeType,
    updateStreamStatus,
    clearStreamStatus
  ]);

  const textPreview =
    contentQuery.data &&
    contentQuery.data.length > 0 &&
    resolvedMediaKind === 'text'
      ? getTextPreview(contentQuery.data, contentQuery.data.length)
      : null;
  const jsonImagePreview = useMemo(() => {
    if (!contentQuery.data || resolvedMimeType !== 'application/json') {
      return null;
    }
    try {
      const decoded = new TextDecoder().decode(contentQuery.data);
      return extractImageFromMetadata(JSON.parse(decoded));
    } catch (error) {
      return null;
    }
  }, [contentQuery.data, resolvedMimeType]);
  const htmlPreview = useMemo(() => {
    if (!contentQuery.data || !isHtmlDocument) {
      return null;
    }
    return new TextDecoder().decode(contentQuery.data);
  }, [contentQuery.data, isHtmlDocument]);

  const setHtmlFrameRef = useCallback((node: HTMLIFrameElement | null) => {
    setBridgeSource(node?.contentWindow ?? null);
  }, []);

  const bridgeId = useMemo(() => {
    if (!isHtmlDocument || !htmlPreview) {
      return null;
    }
    return createBridgeId();
  }, [isHtmlDocument, htmlPreview, props.token.id, props.contractId]);

  useEffect(() => {
    if (!bridgeId || !isHtmlDocument || !htmlPreview) {
      return;
    }
    const dispose = registerRecursiveBridge({
      bridgeId,
      contract: props.client.contract,
      senderAddress: props.senderAddress,
      source: bridgeSource ?? undefined
    });
    return () => dispose();
  }, [
    bridgeId,
    isHtmlDocument,
    htmlPreview,
    props.client.contract,
    props.senderAddress,
    bridgeSource
  ]);

  const htmlDoc = htmlPreview && bridgeId
    ? injectRecursiveBridgeHtml(htmlPreview, bridgeId)
    : htmlPreview;
  const allowTokenUriPreview = !tokenUriFailed && shouldAllowTokenUriPreview({
    hasMeta: !!props.token.meta,
    contentError: contentQuery.isError,
    streamPhase,
    hasPreviewContent,
    shouldStream
  });
  const allowTokenUriFallback = allowTokenUriPreview;
  useEffect(() => {
    const key = `${allowTokenUriPreview}:${streamPhase}:${isStreamableKind}:${mediaSourceSupported}`;
    if (tokenUriGateLogRef.current === key) {
      return;
    }
    tokenUriGateLogRef.current = key;
    logDebug('token-uri', 'Token uri preview gating', {
      id: props.token.id.toString(),
      allowTokenUriFallback,
      allowTokenUriPreview,
      streamPhase,
      streamable: isStreamableKind,
      mediaSourceSupported,
      loadRequested
    });
  }, [
    props.token.id,
    allowTokenUriFallback,
    allowTokenUriPreview,
    streamPhase,
    isStreamableKind,
    mediaSourceSupported,
    loadRequested
  ]);

  const tokenUriQuery = useQuery({
    queryKey: [
      'viewer',
      props.contractId,
      'token-uri-image',
      props.token.id.toString(),
      props.token.tokenUri ?? 'none'
    ],
    queryFn: () => fetchTokenImageFromUri(props.token.tokenUri),
    enabled: allowTokenUriPreview && !!props.token.tokenUri && isActiveTab,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const tokenUriPreview = allowTokenUriPreview ? tokenUriQuery.data : null;
  const directTokenUri =
    props.token.tokenUri &&
    (isHttpUrl(props.token.tokenUri) || isDataUri(props.token.tokenUri))
      ? props.token.tokenUri
      : null;
  const normalizeImageUrl = useCallback((value: string) => {
    if (value.startsWith('ipfs://')) {
      let path = value.slice('ipfs://'.length);
      if (path.startsWith('ipfs/')) {
        path = path.slice('ipfs/'.length);
      }
      return `https://ipfs.io/ipfs/${path}`;
    }
    if (value.startsWith('ar://')) {
      const path = value.slice('ar://'.length);
      return `https://arweave.net/${path}`;
    }
    return value;
  }, []);
  const thumbnailCandidate = useMemo(() => {
    if (
      contentQuery.data &&
      contentQuery.data.length > 0 &&
      (resolvedMediaKind === 'image' || resolvedMediaKind === 'svg')
    ) {
      return { source: 'on-chain', label: 'On-chain bytes' };
    }
    if (resolvedMediaKind === 'svg' && svgPreview) {
      return { source: 'svg-preview', label: 'SVG preview' };
    }
    if (allowTokenUriPreview && tokenUriPreview) {
      return { source: 'token-uri', label: 'Token URI image' };
    }
    if (jsonImagePreview) {
      const normalized = normalizeImageUrl(jsonImagePreview);
      if (isHttpUrl(normalized) || isDataUri(normalized)) {
        return { source: 'metadata-image', label: 'Metadata image' };
      }
    }
    if (allowTokenUriFallback && directTokenUri) {
      return { source: 'token-uri-direct', label: 'Token URI (direct)' };
    }
    return null;
  }, [
    contentQuery.data,
    resolvedMediaKind,
    svgPreview,
    allowTokenUriPreview,
    tokenUriPreview,
    jsonImagePreview,
    allowTokenUriFallback,
    directTokenUri,
    normalizeImageUrl
  ]);
  const fetchImageBytes = useCallback(async (url: string) => {
    const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const headerType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim();
    const dataUriMatch = url.startsWith('data:')
      ? url.match(/^data:([^;,]+)[;,]/i)
      : null;
    const dataUriType = dataUriMatch ? dataUriMatch[1].toLowerCase() : null;
    const sniffed = sniffMimeType(bytes);
    const mimeType = headerType || dataUriType || sniffed || null;
    return { bytes, mimeType };
  }, []);
  const handleGenerateThumbnail = useCallback(async () => {
    if (thumbnailPending) {
      return;
    }
    setThumbnailPending(true);
    setThumbnailStatusMessage('Generating...');
    try {
      let bytes: Uint8Array | null = null;
      let sourceMimeType: string | null = null;
      let source = thumbnailCandidate?.source ?? null;
      if (
        contentQuery.data &&
        contentQuery.data.length > 0 &&
        (resolvedMediaKind === 'image' || resolvedMediaKind === 'svg')
      ) {
        bytes = contentQuery.data;
        sourceMimeType = resolvedMimeType ?? mimeType ?? sniffMimeType(bytes);
        source = 'on-chain';
      } else if (resolvedMediaKind === 'svg' && svgPreview) {
        const result = await fetchImageBytes(svgPreview);
        bytes = result.bytes;
        sourceMimeType = result.mimeType ?? 'image/svg+xml';
        source = 'svg-preview';
      } else if (allowTokenUriPreview && tokenUriPreview) {
        const result = await fetchImageBytes(tokenUriPreview);
        bytes = result.bytes;
        sourceMimeType = result.mimeType;
        source = 'token-uri';
      } else if (jsonImagePreview) {
        const normalized = normalizeImageUrl(jsonImagePreview);
        if (isHttpUrl(normalized) || isDataUri(normalized)) {
          const result = await fetchImageBytes(normalized);
          bytes = result.bytes;
          sourceMimeType = result.mimeType;
          source = 'metadata-image';
        }
      } else if (allowTokenUriFallback && directTokenUri) {
        const result = await fetchImageBytes(directTokenUri);
        bytes = result.bytes;
        sourceMimeType = result.mimeType;
        source = 'token-uri-direct';
      }
      if (!bytes || bytes.length === 0) {
        setThumbnailStatusMessage('No image source available');
        return;
      }
      const resolvedMime = sourceMimeType ?? sniffMimeType(bytes);
      const resolvedKind = getMediaKind(resolvedMime ?? null);
      if (resolvedKind !== 'image' && resolvedKind !== 'svg') {
        setThumbnailStatusMessage('Source is not an image');
        logWarn('thumbnail', 'Thumbnail source is not an image', {
          id: props.token.id.toString(),
          source,
          mimeType: resolvedMime ?? null
        });
        return;
      }
      const result = await createImageThumbnail({
        bytes,
        mimeType: resolvedMime,
        size: THUMBNAIL_SIZE
      });
      if (!result || result.data.length === 0) {
        setThumbnailStatusMessage('Thumbnail generation failed');
        return;
      }
      await saveInscriptionThumbnailToCache(
        props.contractId,
        props.token.id,
        result.data,
        {
          mimeType: result.mimeType,
          width: result.width,
          height: result.height
        }
      );
      const value = {
        data: result.data,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height
      };
      queryClient.setQueryData(
        getTokenThumbnailKey(props.contractId, props.token.id),
        value
      );
      queryClient.setQueryData(thumbnailRecordKey, {
        id: buildInscriptionThumbnailCacheKey(props.contractId, props.token.id),
        value,
        timestamp: Date.now()
      });
      setThumbnailStatusMessage(`Saved ${formatBytes(result.data.length)}`);
      logInfo('thumbnail', 'Generated thumbnail via preview', {
        id: props.token.id.toString(),
        source,
        bytes: result.data.length,
        mimeType: result.mimeType ?? null,
        width: result.width,
        height: result.height
      });
    } catch (error) {
      setThumbnailStatusMessage('Thumbnail generation failed');
      logWarn('thumbnail', 'Thumbnail generation failed', {
        id: props.token.id.toString(),
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setThumbnailPending(false);
    }
  }, [
    thumbnailPending,
    thumbnailCandidate?.source,
    contentQuery.data,
    resolvedMediaKind,
    resolvedMimeType,
    mimeType,
    svgPreview,
    allowTokenUriPreview,
    tokenUriPreview,
    jsonImagePreview,
    allowTokenUriFallback,
    directTokenUri,
    fetchImageBytes,
    normalizeImageUrl,
    props.contractId,
    props.token.id,
    queryClient,
    thumbnailRecordKey
  ]);
  const imagePreviewOrigin = useMemo(() => {
    if (resolvedMediaKind === 'svg' && svgPreview) {
      return 'svg-preview';
    }
    if (resolvedMediaKind === 'image' && contentUrl) {
      return 'on-chain';
    }
    if (tokenUriPreview) {
      return 'token-uri';
    }
    if (resolvedMediaKind === 'text' && textPreview && jsonImagePreview) {
      return 'metadata-image';
    }
    return null;
  }, [
    resolvedMediaKind,
    svgPreview,
    contentUrl,
    tokenUriPreview,
    textPreview,
    jsonImagePreview
  ]);
  const previewImageClassName =
    pixelatePreview && imagePreviewOrigin !== 'svg-preview'
      ? 'preview-media--pixelated'
      : undefined;
  const mediaSourceUrl = streamUrl ?? contentUrl;
  const isStreamBuffering = shouldStream && streamPhase === 'buffering';
  const isStreamLoading = shouldStream && streamPhase === 'loading';
  const isStreamError = shouldStream && streamPhase === 'error';
  const showLoadButton =
    !autoLoad &&
    totalSize !== null &&
    !svgPreview &&
    !loadRequested &&
    !hasPreviewContent;
  const showFallbackLoadButton =
    tokenUriFailed &&
    totalSize !== null &&
    !svgPreview &&
    !loadRequested;
  const fullscreenSource =
    contentUrl || svgPreview || tokenUriPreview || directTokenUri;
  const handleBackToViewer = () => {
    if (typeof document === 'undefined') {
      return;
    }
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    }
  };
  const handleOpenFullscreen = () => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!fullscreenSource) {
      return;
    }
    window.open(fullscreenSource, '_blank', 'noopener,noreferrer');
  };

  const handleCopyValue = (value: string | null) => {
    if (!value) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
      return;
    }
    if (typeof window !== 'undefined') {
      window.prompt('Copy to clipboard:', value);
    }
  };

  const handlePreviewImageLoad = useCallback(
    (source: string, url: string | null) =>
      (event: SyntheticEvent<HTMLImageElement>) => {
        if (!url) {
          return;
        }
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const naturalWidth = target.naturalWidth || 0;
        const naturalHeight = target.naturalHeight || 0;
        const normalizedMime = (resolvedMimeType ?? mimeType ?? '').toLowerCase();
        const urlLower = url.toLowerCase();
        const isSvgSource =
          source === 'svg-preview' ||
          normalizedMime.includes('svg') ||
          urlLower.startsWith('data:image/svg') ||
          urlLower.includes('.svg');
        let nextPixelate = false;
        if (
          !isSvgSource &&
          naturalWidth > 0 &&
          naturalHeight > 0 &&
          rect.width > 0 &&
          rect.height > 0
        ) {
          const scaleX = rect.width / naturalWidth;
          const scaleY = rect.height / naturalHeight;
          const scale = Math.max(scaleX, scaleY);
          const maxNatural = Math.max(naturalWidth, naturalHeight);
          nextPixelate = scale >= 1.2 && maxNatural <= 512;
        }
        setPixelatePreview((previous) =>
          previous === nextPixelate ? previous : nextPixelate
        );
        if (!shouldLog('preview', 'debug')) {
          return;
        }
        const logKey = `${props.token.id.toString()}-${source}`;
        if (imageMetricsLogRef.current === logKey) {
          return;
        }
        imageMetricsLogRef.current = logKey;
        const computed =
          typeof window !== 'undefined' ? window.getComputedStyle(target) : null;
        const sourceType = url.startsWith('data:')
          ? 'data-uri'
          : url.startsWith('blob:')
            ? 'blob'
            : 'url';
        logDebug('preview', 'Token preview image metrics', {
          id: props.token.id.toString(),
          source,
          sourceType,
          mimeType: resolvedMimeType ?? mimeType ?? null,
          mediaKind: resolvedMediaKind,
          totalSize: totalSize !== null ? totalSize.toString() : null,
          bytesLoaded: contentBytes,
          naturalWidth,
          naturalHeight,
          renderedWidth: Math.round(rect.width),
          renderedHeight: Math.round(rect.height),
          objectFit: computed?.objectFit ?? null,
          objectPosition: computed?.objectPosition ?? null,
          allowTokenUriFallback,
          allowTokenUriPreview
        });
      },
    [
      props.token.id,
      resolvedMimeType,
      mimeType,
      resolvedMediaKind,
      totalSize,
      contentBytes,
      allowTokenUriFallback,
      allowTokenUriPreview
    ]
  );

  const handlePreviewImageError = useCallback(
    (source: string, url: string | null) =>
      (event: SyntheticEvent<HTMLImageElement>) => {
        if (!url) {
          return;
        }
        setPixelatePreview(false);
        if (source.startsWith('token-uri')) {
          setTokenUriFailed(true);
          if (
            totalSize !== null &&
            totalSize <= MAX_AUTO_PREVIEW_BYTES &&
            !loadRequested
          ) {
            setLoadRequested(true);
          }
        }
        if (!shouldLog('preview', 'warn')) {
          return;
        }
        const logKey = `${props.token.id.toString()}-${source}-error`;
        if (imageErrorLogRef.current === logKey) {
          return;
        }
        imageErrorLogRef.current = logKey;
        const target = event.currentTarget;
        const sourceType = url.startsWith('data:')
          ? 'data-uri'
          : url.startsWith('blob:')
            ? 'blob'
            : 'url';
        const diagnosticHints: string[] = [];
        if (!contentQuery.data || contentQuery.data.length === 0) {
          diagnosticHints.push('no-bytes');
        }
        if (contentQuery.isError) {
          diagnosticHints.push('content-fetch-error');
        }
        if (sniffedMimeType && resolvedMimeType && sniffedMimeType !== resolvedMimeType) {
          diagnosticHints.push('mime-mismatch');
        }
        if (
          sniffedKind &&
          sniffedKind !== 'image' &&
          sniffedKind !== 'svg' &&
          sniffedKind !== 'binary'
        ) {
          diagnosticHints.push('bytes-not-image');
        }
        if (resolvedMediaKind !== 'image' && resolvedMediaKind !== 'svg') {
          diagnosticHints.push('resolved-not-image');
        }
        if (source.startsWith('token-uri')) {
          diagnosticHints.push('token-uri-fallback');
        }
        logWarn('preview', 'Token preview image failed to load', {
          id: props.token.id.toString(),
          source,
          sourceType,
          mimeType: resolvedMimeType ?? mimeType ?? null,
          metaMimeType: mimeType ?? null,
          sniffedMimeType,
          mediaKind: resolvedMediaKind,
          sniffedKind,
          totalSize: totalSize !== null ? totalSize.toString() : null,
          bytesLoaded: contentBytes,
          currentSrc: target.currentSrc || target.src || null,
          contentStatus: contentQuery.status,
          allowTokenUriFallback,
          allowTokenUriPreview,
          diagnosticHints: diagnosticHints.length > 0 ? diagnosticHints : null
        });
      },
    [
      props.token.id,
      resolvedMimeType,
      mimeType,
      resolvedMediaKind,
      sniffedMimeType,
      sniffedKind,
      totalSize,
      contentBytes,
      contentQuery.data,
      contentQuery.isError,
      contentQuery.status,
      allowTokenUriFallback,
      allowTokenUriPreview,
      loadRequested
    ]
  );

  useEffect(() => {
    if (!showLoadButton || loadGateLoggedRef.current) {
      return;
    }
    loadGateLoggedRef.current = true;
    logInfo('preview', 'Preview gated until load', {
      id: props.token.id.toString(),
      totalSize: totalSize !== null ? totalSize.toString() : null,
      autoLoad,
      autoStream,
      hasPreviewContent,
      streamPhase,
      streamable: isStreamableKind,
      mediaSourceSupported
    });
  }, [
    showLoadButton,
    props.token.id,
    totalSize,
    autoLoad,
    autoStream,
    hasPreviewContent,
    streamPhase,
    isStreamableKind,
    mediaSourceSupported
  ]);

  useEffect(() => {
    if (contentQuery.data && contentQuery.data.length > 0) {
      const bytes = contentQuery.data.length;
      if (lastContentLogRef.current !== bytes) {
        lastContentLogRef.current = bytes;
        logDebug('preview', 'Token content loaded', {
          id: props.token.id.toString(),
          bytes
        });
      }
    }
  }, [contentQuery.data, props.token.id]);

  useEffect(() => {
    if (tokenUriQuery.data) {
      if (!tokenUriLoggedRef.current) {
        tokenUriLoggedRef.current = true;
        logDebug('preview', 'Token uri preview resolved', {
          id: props.token.id.toString()
        });
      }
    }
  }, [tokenUriQuery.data, props.token.id]);

  useEffect(() => {
    if (!imagePreviewOrigin) {
      return;
    }
    const logKey = `${props.token.id.toString()}-${imagePreviewOrigin}`;
    if (previewSourceLogRef.current === logKey) {
      return;
    }
    previewSourceLogRef.current = logKey;
    logDebug('preview', 'Token preview source selected', {
      id: props.token.id.toString(),
      source: imagePreviewOrigin,
      mimeType: resolvedMimeType ?? mimeType ?? null,
      mediaKind: resolvedMediaKind,
      totalSize: totalSize !== null ? totalSize.toString() : null,
      bytesLoaded: contentBytes,
      allowTokenUriFallback,
      allowTokenUriPreview
    });
  }, [
    imagePreviewOrigin,
    props.token.id,
    resolvedMimeType,
    mimeType,
    resolvedMediaKind,
    totalSize,
    contentBytes,
    allowTokenUriFallback,
    allowTokenUriPreview
  ]);

  return (
    <div className="preview-panel preview-panel--art">
      <div className="preview-stage">
        <div className="preview-stage__top">
          <div className="preview-stage__badges" aria-label="Token metadata">
            <span className="preview-pill preview-pill--strong">{tokenIdLabel}</span>
            <span className="preview-pill" title={mediaBadgeTitle}>
              {mediaBadge}
            </span>
          </div>
          <div className="preview-stage__actions">
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={handleOpenFullscreen}
              disabled={!fullscreenSource}
              title="Open the current media source in a new tab"
            >
              Open
            </button>
            {showLoadButton && (
              <button
                type="button"
                className="button button--ghost button--mini"
                onClick={() => setLoadRequested(true)}
                disabled={!isActiveTab}
                title={
                  isActiveTab
                    ? 'Fetch on-chain bytes for this token'
                    : 'Activate this tab to load on-chain content'
                }
              >
                Load
              </button>
            )}
            {!showLoadButton && showFallbackLoadButton && (
              <button
                type="button"
                className="button button--ghost button--mini"
                onClick={() => setLoadRequested(true)}
                disabled={!isActiveTab}
                title={
                  isActiveTab
                    ? 'Fetch on-chain bytes for this token'
                    : 'Activate this tab to load on-chain content'
                }
              >
                Load
              </button>
            )}
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={handleBackToViewer}
            >
              Viewer
            </button>
          </div>
        </div>

        <div className="preview-stage__frame" role="region" aria-label="Artwork preview">
          <div className="square-frame">
            <div className="square-frame__content preview-stage__content">
              {!props.token.meta && (
                <div className="preview-stage__empty">
                  <p>Metadata unavailable for this inscription.</p>
                </div>
              )}

              {props.token.meta && showLoadButton && (
                <div className="preview-stage__notice">
                  <p>
                    Preview is paused for large content. Click <strong>Load</strong>{' '}
                    to fetch on-chain bytes.
                  </p>
                </div>
              )}
              {props.token.meta && !showLoadButton && showFallbackLoadButton && (
                <div className="preview-stage__notice">
                  <p>
                    Token URI preview failed. Click <strong>Load</strong> to fetch
                    on-chain bytes.
                  </p>
                </div>
              )}

              {contentQuery.isLoading && (
                <div className="preview-stage__notice">
                  <p>Loading on-chain content...</p>
                </div>
              )}

              {isStreamBuffering && (
                <div className="preview-stage__notice">
                  <p>
                    Buffering {resolvedMediaKind}...
                    {streamBufferedSeconds > 0
                      ? ` ${streamBufferedSeconds.toFixed(1)}s buffered`
                      : ''}
                  </p>
                </div>
              )}

              {isStreamLoading && (
                <div className="preview-stage__notice">
                  <p>Loading remaining {resolvedMediaKind}...</p>
                </div>
              )}

              {shouldStream && streamPhase === 'playable' && (
                <div className="preview-stage__notice">
                  <p>Ready to play. Full file loads as playback starts.</p>
                </div>
              )}

              {contentQuery.isError && (
                <div className="preview-stage__notice">
                  <p>Unable to load on-chain content for this inscription.</p>
                </div>
              )}

              {isStreamError && (
                <div className="preview-stage__notice">
                  <p title={streamError ?? undefined}>
                    Unable to stream on-chain content for this inscription.
                  </p>
                </div>
              )}

              {!contentQuery.isLoading &&
                !contentQuery.isError &&
                !isStreamError &&
                (svgPreview ||
                  (contentQuery.data && contentQuery.data.length > 0) ||
                  mediaSourceUrl ||
                  tokenUriPreview) && (
                  <>
                    {resolvedMediaKind === 'svg' && svgPreview ? (
                      <img
                        src={svgPreview}
                        alt="SVG preview"
                        loading="lazy"
                        className={previewImageClassName}
                        onLoad={handlePreviewImageLoad('svg-preview', svgPreview)}
                        onError={handlePreviewImageError('svg-preview', svgPreview)}
                      />
                    ) : resolvedMediaKind === 'image' && contentUrl ? (
                      <img
                        src={contentUrl}
                        alt="Image preview"
                        loading="lazy"
                        className={previewImageClassName}
                        onLoad={handlePreviewImageLoad('on-chain', contentUrl)}
                        onError={handlePreviewImageError('on-chain', contentUrl)}
                      />
                    ) : resolvedMediaKind === 'audio' && mediaSourceUrl ? (
                      <audio
                        ref={(node) => {
                          mediaRef.current = node;
                        }}
                        controls
                        preload="metadata"
                        src={mediaSourceUrl}
                        onPlay={() => streamStartRef.current?.()}
                      />
                    ) : resolvedMediaKind === 'video' && mediaSourceUrl ? (
                      <video
                        ref={(node) => {
                          mediaRef.current = node;
                        }}
                        controls
                        preload="metadata"
                        src={mediaSourceUrl}
                        poster={tokenUriPreview ?? undefined}
                        onPlay={() => streamStartRef.current?.()}
                      />
                    ) : tokenUriPreview ? (
                      <img
                        src={tokenUriPreview}
                        alt="Token URI preview"
                        loading="lazy"
                        className={previewImageClassName}
                        onLoad={handlePreviewImageLoad('token-uri', tokenUriPreview)}
                        onError={handlePreviewImageError('token-uri', tokenUriPreview)}
                      />
                    ) : resolvedMediaKind === 'html' ? (
                      <div className="preview-stage__html">
                        {isPdf ? (
                          contentUrl ? (
                            <iframe
                              title={`inscription-${props.token.id.toString()}`}
                              sandbox=""
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              src={contentUrl}
                            />
                          ) : (
                            <p>PDF preview unavailable.</p>
                          )
                        ) : htmlDoc ? (
                          <iframe
                            title={`inscription-${props.token.id.toString()}`}
                            sandbox="allow-scripts"
                            ref={setHtmlFrameRef}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            srcDoc={htmlDoc}
                          />
                        ) : (
                          <p>HTML preview unavailable.</p>
                        )}
                      </div>
                    ) : resolvedMediaKind === 'text' && textPreview ? (
                      <div className="preview-stage__text">
                        {jsonImagePreview && (
                          <img
                            src={jsonImagePreview}
                            alt="Metadata preview"
                            loading="lazy"
                            onLoad={handlePreviewImageLoad(
                              'metadata-image',
                              jsonImagePreview
                            )}
                            onError={handlePreviewImageError(
                              'metadata-image',
                              jsonImagePreview
                            )}
                          />
                        )}
                        <pre>{textPreview.text}</pre>
                      </div>
                    ) : contentUrl ? (
                      <a
                        className="preview-stage__download"
                        href={contentUrl}
                        download={`inscription-${props.token.id}`}
                      >
                        Download content
                      </a>
                    ) : (
                      <div className="preview-stage__empty">
                        <p>Preview unavailable for this content type.</p>
                      </div>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>

        <div className="preview-stage__bottom">
          <details className="preview-drawer">
            <summary>Details</summary>
            <div className="preview-drawer__body">
              <div className="meta-grid meta-grid--dense">
                <div>
                  <span className="meta-label">Owner</span>
                  <span className="meta-value meta-value--truncate" title={ownerAddress}>
                    {ownerAddress}
                  </span>
                  <div className="meta-actions">
                    <button
                      type="button"
                      className="button button--ghost button--mini"
                      onClick={() => handleCopyValue(ownerAddress)}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <span className="meta-label">Creator</span>
                  <span
                    className="meta-value meta-value--truncate"
                    title={creatorAddress ?? ''}
                  >
                    {creatorAddress ?? 'Unknown'}
                  </span>
                  <div className="meta-actions">
                    <button
                      type="button"
                      className="button button--ghost button--mini"
                      onClick={() => handleCopyValue(creatorAddress)}
                      disabled={!creatorAddress}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <span className="meta-label">Token URI</span>
                  <span
                    className="meta-value meta-value--truncate"
                    title={tokenUriValue ?? ''}
                  >
                    {tokenUriLabel}
                  </span>
                  <div className="meta-actions">
                    <button
                      type="button"
                      className="button button--ghost button--mini"
                      onClick={() => handleCopyValue(tokenUriValue)}
                      disabled={!tokenUriValue}
                    >
                      Copy
                    </button>
                    {tokenUriLink && (
                      <a
                        className="button button--ghost button--mini"
                        href={tokenUriLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </div>
                <div className="thumbnail-diagnostic">
                  <span className="meta-label">Thumbnail</span>
                  <span className="meta-value">{thumbnailStatus}</span>
                  <span className="thumbnail-diagnostic__meta">
                    Fallback: {thumbnailFallbackLabel}
                  </span>
                  <span className="thumbnail-diagnostic__meta">
                    Candidate: {thumbnailCandidate ? thumbnailCandidate.label : 'None'}
                  </span>
                  {thumbnailValue?.mimeType && (
                    <span className="thumbnail-diagnostic__meta">
                      Mime: {thumbnailValue.mimeType}
                    </span>
                  )}
                  {thumbnailValue?.data && (
                    <span className="thumbnail-diagnostic__meta">
                      Bytes: {thumbnailValue.data.length.toString()}
                    </span>
                  )}
                  {thumbnailTimestamp && (
                    <span className="thumbnail-diagnostic__meta">
                      Cached: {thumbnailTimestamp}
                    </span>
                  )}
                  <div className="thumbnail-diagnostic__actions">
                    <button
                      type="button"
                      className="button button--ghost button--mini"
                      onClick={handleGenerateThumbnail}
                      disabled={!thumbnailCandidate || thumbnailPending}
                    >
                      {thumbnailPending
                        ? 'Generating...'
                        : thumbnailValue
                          ? 'Refresh'
                          : 'Generate'}
                    </button>
                    {thumbnailStatusMessage && (
                      <span className="thumbnail-diagnostic__status">
                        {thumbnailStatusMessage}
                      </span>
                    )}
                  </div>
                  {thumbnailUrl && (
                    <img
                      className="thumbnail-diagnostic__image"
                      src={thumbnailUrl}
                      alt="Thumbnail preview"
                      loading="lazy"
                    />
                  )}
                </div>
                <div>
                  <span className="meta-label">Mime type</span>
                  <span className="meta-value">
                    {props.token.meta?.mimeType ?? 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Total size</span>
                  <span className="meta-value">
                    {props.token.meta
                      ? formatBytes(props.token.meta.totalSize)
                      : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Chunks</span>
                  <span className="meta-value">
                    {props.token.meta ? props.token.meta.totalChunks.toString() : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Sealed</span>
                  <span className="meta-value">
                    {props.token.meta ? (props.token.meta.sealed ? 'Yes' : 'No') : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Final hash</span>
                  <span className="meta-value meta-value--truncate" title={finalHash ?? ''}>
                    {finalHashLabel}
                  </span>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
