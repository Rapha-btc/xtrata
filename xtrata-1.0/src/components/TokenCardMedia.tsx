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
import { getContractId } from '../lib/contract/config';
import type { StreamStatus, TokenSummary } from '../lib/viewer/types';
import {
  decodeTokenUriToImage,
  extractImageFromMetadata,
  fetchTokenImageFromUri,
  fetchOnChainContent,
  getFiniteAnimatedImageReplayDelayMs,
  getMediaKind,
  getTextPreview,
  isDataUri,
  isHttpUrl,
  isLikelyImageUrl,
  resolveMimeType,
  sniffMimeType
} from '../lib/viewer/content';
import { getTokenContentKey, getTokenThumbnailKey } from '../lib/viewer/queries';
import {
  loadInscriptionThumbnailFromCache,
  saveInscriptionThumbnailToCache,
  deleteInscriptionThumbnailFromCache
} from '../lib/viewer/cache';
import { createImageThumbnail, THUMBNAIL_SIZE } from '../lib/viewer/thumbnail';
import { logDebug, logWarn, shouldLog } from '../lib/utils/logger';
import {
  createBridgeId,
  injectRecursiveBridgeHtml,
  registerRecursiveBridge
} from '../lib/viewer/recursive';
import { createObjectUrl } from '../lib/utils/blob';

const MAX_GRID_EAGER_FULL_LOAD_BYTES = 4n * 1024n * 1024n;
const MAX_ANIMATED_PNG_PROBE_BYTES = 512n * 1024n;

type TokenCardMediaProps = {
  token: TokenSummary;
  contractId: string;
  senderAddress: string;
  client: XtrataClient;
  fallbackClient?: XtrataClient | null;
  isActiveTab?: boolean;
  pixelateOnUpscale?: boolean;
  preferFullResolution?: boolean;
  letterboxNonSquare?: boolean;
};

export default function TokenCardMedia(props: TokenCardMediaProps) {
  const isActiveTab = props.isActiveTab !== false;
  const queryClient = useQueryClient();
  const lastPreviewLogRef = useRef<string | null>(null);
  const lastImageLogRef = useRef<string | null>(null);
  const lastImageErrorRef = useRef<string | null>(null);
  const thumbnailGenRef = useRef(false);
  const contentUrlRef = useRef<string | null>(null);
  const [bridgeSource, setBridgeSource] = useState<MessageEventSource | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [onChainFailed, setOnChainFailed] = useState(false);
  const [tokenUriFailed, setTokenUriFailed] = useState(false);
  const [tokenUriDeferred, setTokenUriDeferred] = useState(false);
  const [pixelatePreview, setPixelatePreview] = useState(false);
  const [letterboxPreview, setLetterboxPreview] = useState(false);
  const [animatedReplayTick, setAnimatedReplayTick] = useState(0);
  const setHtmlFrameRef = useCallback((node: HTMLIFrameElement | null) => {
    setBridgeSource(node?.contentWindow ?? null);
  }, []);
  const mimeType = props.token.meta?.mimeType ?? null;
  const mediaKind = getMediaKind(mimeType);
  const totalSize = props.token.meta?.totalSize ?? null;
  const svgPreview = props.token.svgDataUri ?? null;
  const streamStatusKey = useMemo(
    () => [
      'viewer',
      props.contractId,
      'stream-status',
      props.token.id.toString()
    ],
    [props.contractId, props.token.id]
  );
  const streamStatusQuery = useQuery<StreamStatus>({
    queryKey: streamStatusKey,
    queryFn: () => null,
    initialData: () =>
      (queryClient.getQueryData(streamStatusKey) as StreamStatus) ?? null,
    enabled: false,
    staleTime: Infinity
  });
  const streamStatus = streamStatusQuery.data;
  const fallbackContentContractId = useMemo(
    () =>
      props.fallbackClient
        ? getContractId(props.fallbackClient.contract)
        : 'none',
    [props.fallbackClient]
  );
  const contentQueryKey = useMemo(
    () => [
      ...getTokenContentKey(props.contractId, props.token.id),
      'chunk-source',
      fallbackContentContractId
    ],
    [props.contractId, props.token.id, fallbackContentContractId]
  );
  const thumbnailQuery = useQuery({
    queryKey: getTokenThumbnailKey(props.contractId, props.token.id),
    queryFn: () =>
      loadInscriptionThumbnailFromCache(props.contractId, props.token.id),
    enabled: isActiveTab,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const hasThumbnail =
    !thumbnailFailed &&
    !!thumbnailQuery.data?.data &&
    thumbnailQuery.data.data.length > 0;
  const normalizedMetaMimeType = (mimeType ?? '').toLowerCase();
  const isGifMetaMimeType = normalizedMetaMimeType === 'image/gif';
  const isPngAnimationProbeCandidate =
    normalizedMetaMimeType === 'image/png' &&
    totalSize !== null &&
    totalSize <= MAX_ANIMATED_PNG_PROBE_BYTES;
  const isWithinGridEagerLoadWindow =
    totalSize !== null && totalSize <= MAX_GRID_EAGER_FULL_LOAD_BYTES;
  const isAnimatedImageMetaCandidate =
    isGifMetaMimeType ||
    normalizedMetaMimeType === 'image/webp' ||
    normalizedMetaMimeType === 'image/apng' ||
    isPngAnimationProbeCandidate;
  const shouldLoadPlaybackMedia =
    !!props.token.meta &&
    (isWithinGridEagerLoadWindow || props.preferFullResolution) &&
    !svgPreview &&
    (mediaKind === 'video' || mediaKind === 'audio');
  const shouldLoadNonVideo =
    !!props.token.meta &&
    (isWithinGridEagerLoadWindow || props.preferFullResolution) &&
    !svgPreview &&
    (!hasThumbnail ||
      props.preferFullResolution ||
      isWithinGridEagerLoadWindow ||
      isAnimatedImageMetaCandidate) &&
    (mediaKind === 'image' ||
      mediaKind === 'svg' ||
      mediaKind === 'text' ||
      mediaKind === 'html' ||
      mediaKind === 'binary');
  const shouldLoad = shouldLoadPlaybackMedia || shouldLoadNonVideo;
  const showStreamProgress =
    !!streamStatus &&
    (streamStatus.phase === 'buffering' || streamStatus.phase === 'loading');
  const progressPercent =
    streamStatus && streamStatus.totalChunks > 0
      ? Math.min(
          100,
          Math.round((streamStatus.chunksLoaded / streamStatus.totalChunks) * 100)
        )
      : 0;
  const progressLabel = streamStatus
    ? streamStatus.phase === 'buffering'
      ? `Buffering ${streamStatus.bufferedSeconds.toFixed(1)}s`
      : `Loading ${progressPercent}%`
    : null;

  const contentQuery = useQuery({
    queryKey: contentQueryKey,
    queryFn: () =>
      fetchOnChainContent({
        client: props.client,
        fallbackClient: props.fallbackClient ?? null,
        cacheContractId: props.contractId,
        id: props.token.id,
        senderAddress: props.senderAddress,
        totalSize: props.token.meta?.totalSize ?? 0n,
        mimeType: props.token.meta?.mimeType ?? null
      }),
    enabled: shouldLoad && isActiveTab,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const resolvedMimeType = resolveMimeType(mimeType, contentQuery.data);
  const resolvedKind = getMediaKind(resolvedMimeType);
  const contentBytes = contentQuery.data ? contentQuery.data.length : null;
  const sniffedMimeType = useMemo(
    () => (contentQuery.data ? sniffMimeType(contentQuery.data) : null),
    [contentQuery.data]
  );
  const sniffedKind = sniffedMimeType ? getMediaKind(sniffedMimeType) : null;

  const thumbnailUrl = useMemo(() => {
    if (!thumbnailQuery.data || !thumbnailQuery.data.data) {
      return null;
    }
    if (thumbnailQuery.data.data.length === 0) {
      return null;
    }
    return createObjectUrl(
      thumbnailQuery.data.data,
      thumbnailQuery.data.mimeType ?? 'image/webp'
    );
  }, [thumbnailQuery.data]);

  const resolvedThumbnailUrl = thumbnailFailed ? null : thumbnailUrl;

  useEffect(() => {
    if (!resolvedThumbnailUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(resolvedThumbnailUrl);
    };
  }, [resolvedThumbnailUrl]);

  const contentUrl = useMemo(() => {
    if (!contentQuery.data || contentQuery.data.length === 0) {
      return null;
    }
    if (
      resolvedKind !== 'image' &&
      resolvedKind !== 'svg' &&
      resolvedKind !== 'video' &&
      resolvedMimeType !== 'application/pdf'
    ) {
      return null;
    }
    return createObjectUrl(contentQuery.data, resolvedMimeType ?? mimeType);
  }, [contentQuery.data, resolvedKind, resolvedMimeType, mimeType]);

  useEffect(() => {
    if (contentUrlRef.current !== contentUrl) {
      contentUrlRef.current = contentUrl;
      if (contentUrl && shouldLog('preview', 'debug')) {
        logDebug('preview', 'Token card blob url created', {
          id: props.token.id.toString(),
          url: contentUrl
        });
      }
    }
    if (!contentUrl) {
      return;
    }
    return () => {
      if (shouldLog('preview', 'debug')) {
        logDebug('preview', 'Token card blob url revoked', {
          id: props.token.id.toString(),
          url: contentUrl
        });
      }
      URL.revokeObjectURL(contentUrl);
    };
  }, [contentUrl, props.token.id]);

  useEffect(() => {
    lastPreviewLogRef.current = null;
    lastImageLogRef.current = null;
    lastImageErrorRef.current = null;
    thumbnailGenRef.current = false;
    contentUrlRef.current = null;
    setThumbnailFailed(false);
    setOnChainFailed(false);
    setTokenUriFailed(false);
    setTokenUriDeferred(false);
    setPixelatePreview(false);
    setLetterboxPreview(false);
    setAnimatedReplayTick(0);
  }, [props.token.id]);

  useEffect(() => {
    if (thumbnailQuery.data && thumbnailQuery.data.data?.length > 0) {
      setThumbnailFailed(false);
    }
  }, [thumbnailQuery.data]);

  useEffect(() => {
    if (!isActiveTab) {
      return;
    }
    if (!contentQuery.data || contentQuery.data.length === 0) {
      return;
    }
    if (resolvedKind !== 'image') {
      return;
    }
    if (hasThumbnail) {
      return;
    }
    if (thumbnailGenRef.current) {
      return;
    }
    thumbnailGenRef.current = true;
    const run = async () => {
      try {
        const result = await createImageThumbnail({
          bytes: contentQuery.data,
          mimeType: resolvedMimeType ?? mimeType,
          size: THUMBNAIL_SIZE
        });
        if (!result || result.data.length === 0) {
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
        queryClient.setQueryData(
          getTokenThumbnailKey(props.contractId, props.token.id),
          {
            data: result.data,
            mimeType: result.mimeType,
            width: result.width,
            height: result.height
          }
        );
        logDebug('thumbnail', 'Generated image thumbnail', {
          id: props.token.id.toString(),
          size: result.data.length
        });
      } catch (error) {
        logWarn('thumbnail', 'Thumbnail generation failed', {
          id: props.token.id.toString(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
    void run().finally(() => {
      thumbnailGenRef.current = false;
    });
  }, [
    isActiveTab,
    contentQuery.data,
    resolvedKind,
    hasThumbnail,
    resolvedMimeType,
    mimeType,
    props.contractId,
    props.token.id,
    queryClient
  ]);

  const isHtmlDocument =
    resolvedMimeType === 'text/html' ||
    resolvedMimeType === 'application/xhtml+xml';
  const isPdf = resolvedMimeType === 'application/pdf';

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

  const textPreview = useMemo(() => {
    if (!contentQuery.data || resolvedKind !== 'text') {
      return null;
    }
    return getTextPreview(contentQuery.data, 2000);
  }, [contentQuery.data, resolvedKind]);

  const htmlPreview = useMemo(() => {
    if (!contentQuery.data || !isHtmlDocument) {
      return null;
    }
    return new TextDecoder().decode(contentQuery.data);
  }, [contentQuery.data, isHtmlDocument]);

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
  const allowTokenUriFallback =
    !hasThumbnail &&
    ((mediaKind === 'video' || mediaKind === 'audio')
      ? totalSize === null || totalSize > MAX_GRID_EAGER_FULL_LOAD_BYTES
      : totalSize !== null && totalSize > MAX_GRID_EAGER_FULL_LOAD_BYTES);
  const shouldDeferTokenUri = mediaKind === 'video' || mediaKind === 'audio';
  useEffect(() => {
    if (!allowTokenUriFallback || !shouldDeferTokenUri) {
      setTokenUriDeferred(true);
      return;
    }
    let cancelled = false;
    const enable = () => {
      if (!cancelled) {
        setTokenUriDeferred(true);
      }
    };
    if (typeof window !== 'undefined') {
      const idleWindow = window as Window & {
        requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleWindow.requestIdleCallback) {
        const id = idleWindow.requestIdleCallback(enable, { timeout: 2000 });
        return () => {
          cancelled = true;
          idleWindow.cancelIdleCallback?.(id);
        };
      }
      const timeoutId = window.setTimeout(enable, 700);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }
    enable();
    return () => {
      cancelled = true;
    };
  }, [allowTokenUriFallback, shouldDeferTokenUri, props.token.id]);
  const tokenUriEnabled =
    allowTokenUriFallback && (!shouldDeferTokenUri || tokenUriDeferred) && !tokenUriFailed;
  const tokenUriImage = tokenUriEnabled
    ? decodeTokenUriToImage(props.token.tokenUri)
    : null;
  const tokenUriQuery = useQuery({
    queryKey: [
      'viewer',
      props.contractId,
      'token-uri-image',
      props.token.id.toString(),
      props.token.tokenUri ?? 'none'
    ],
    queryFn: () => fetchTokenImageFromUri(props.token.tokenUri),
    enabled:
      tokenUriEnabled && !tokenUriImage && !!props.token.tokenUri && isActiveTab,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const tokenUriPreview = tokenUriEnabled ? tokenUriQuery.data : null;
  const directTokenUri =
    tokenUriEnabled &&
    props.token.tokenUri &&
    (isDataUri(props.token.tokenUri) ||
      (isHttpUrl(props.token.tokenUri) &&
        isLikelyImageUrl(props.token.tokenUri)))
      ? props.token.tokenUri
      : null;

  const finiteAnimatedReplayDelayMs = useMemo(() => {
    if (!contentQuery.data || contentQuery.data.length === 0) {
      return null;
    }
    if (resolvedKind !== 'image') {
      return null;
    }
    return getFiniteAnimatedImageReplayDelayMs(
      contentQuery.data,
      resolvedMimeType ?? mimeType ?? null
    );
  }, [contentQuery.data, resolvedKind, resolvedMimeType, mimeType]);
  const onChainPreviewSource =
    !onChainFailed &&
    (resolvedKind === 'image' || resolvedKind === 'svg' ? contentUrl : null);
  const preferFullResolution =
    !!props.preferFullResolution ||
    isWithinGridEagerLoadWindow ||
    isGifMetaMimeType ||
    !!finiteAnimatedReplayDelayMs;
  const primaryImageSource = preferFullResolution
    ? onChainPreviewSource
    : resolvedThumbnailUrl;
  const primaryImageOrigin = preferFullResolution ? 'on-chain' : 'thumbnail-cache';
  const secondaryImageSource = preferFullResolution
    ? resolvedThumbnailUrl
    : onChainPreviewSource;
  const secondaryImageOrigin = preferFullResolution ? 'thumbnail-cache' : 'on-chain';
  const imagePreviewSource =
    svgPreview ||
    primaryImageSource ||
    secondaryImageSource ||
    jsonImagePreview ||
    tokenUriImage ||
    tokenUriPreview ||
    (directTokenUri && (mediaKind === 'image' || mediaKind === 'svg')
      ? directTokenUri
      : null);
  const imagePreviewOrigin = (() => {
    if (svgPreview) {
      return 'svg-preview';
    }
    if (primaryImageSource) {
      return primaryImageOrigin;
    }
    if (secondaryImageSource) {
      return secondaryImageOrigin;
    }
    if (jsonImagePreview) {
      return 'metadata-image';
    }
    if (tokenUriImage) {
      return 'token-uri-inline';
    }
    if (tokenUriPreview) {
      return 'token-uri-fetch';
    }
    if (directTokenUri && (mediaKind === 'image' || mediaKind === 'svg')) {
      return 'token-uri-direct';
    }
    return null;
  })();
  const shouldReplayFiniteAnimatedImage =
    imagePreviewOrigin === 'on-chain' &&
    !!imagePreviewSource &&
    !!finiteAnimatedReplayDelayMs;

  useEffect(() => {
    setAnimatedReplayTick(0);
  }, [props.token.id, imagePreviewSource, imagePreviewOrigin]);

  useEffect(() => {
    if (
      !isActiveTab ||
      !shouldReplayFiniteAnimatedImage ||
      !finiteAnimatedReplayDelayMs
    ) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const intervalId = window.setInterval(() => {
      setAnimatedReplayTick((previous) => previous + 1);
    }, finiteAnimatedReplayDelayMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActiveTab, shouldReplayFiniteAnimatedImage, finiteAnimatedReplayDelayMs]);

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      if (!imagePreviewSource || !imagePreviewOrigin) {
        return;
      }
      if (props.pixelateOnUpscale) {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const naturalWidth = target.naturalWidth || 0;
        const naturalHeight = target.naturalHeight || 0;
        const normalizedMime = (resolvedMimeType ?? mimeType ?? '').toLowerCase();
        const urlLower = imagePreviewSource.toLowerCase();
        const isSvgSource =
          imagePreviewOrigin === 'svg-preview' ||
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
      }
      if (props.letterboxNonSquare) {
        const target = event.currentTarget;
        const naturalWidth = target.naturalWidth || 0;
        const naturalHeight = target.naturalHeight || 0;
        if (naturalWidth > 0 && naturalHeight > 0) {
          const aspect = naturalWidth / naturalHeight;
          const nonSquare = aspect < 0.95 || aspect > 1.05;
          setLetterboxPreview((previous) =>
            previous === nonSquare ? previous : nonSquare
          );
        }
      }
      if (!shouldLog('preview', 'debug')) {
        return;
      }
      const logKey = `${props.token.id.toString()}-${imagePreviewOrigin}`;
      if (lastImageLogRef.current === logKey) {
        return;
      }
      lastImageLogRef.current = logKey;
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const computed =
        typeof window !== 'undefined' ? window.getComputedStyle(target) : null;
      const sourceType = imagePreviewSource.startsWith('data:')
        ? 'data-uri'
        : imagePreviewSource.startsWith('blob:')
          ? 'blob'
          : 'url';
      logDebug('preview', 'Token card image metrics', {
        id: props.token.id.toString(),
        source: imagePreviewOrigin,
        sourceType,
        mimeType: resolvedMimeType ?? mimeType ?? null,
        mediaKind: resolvedKind,
        totalSize: totalSize !== null ? totalSize.toString() : null,
        bytesLoaded: contentBytes,
        naturalWidth: target.naturalWidth,
        naturalHeight: target.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        objectFit: computed?.objectFit ?? null,
        objectPosition: computed?.objectPosition ?? null,
        allowTokenUriFallback
      });
    },
    [
      imagePreviewSource,
      imagePreviewOrigin,
      props.pixelateOnUpscale,
      props.token.id,
      resolvedMimeType,
      mimeType,
      resolvedKind,
      totalSize,
      contentBytes,
      allowTokenUriFallback
    ]
  );

  const handleImageError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      if (!imagePreviewSource || !imagePreviewOrigin) {
        return;
      }
      if (imagePreviewOrigin === 'thumbnail-cache') {
        setThumbnailFailed(true);
        queryClient.setQueryData(
          getTokenThumbnailKey(props.contractId, props.token.id),
          null
        );
        void deleteInscriptionThumbnailFromCache(
          props.contractId,
          props.token.id
        );
      } else if (imagePreviewOrigin === 'on-chain') {
        setOnChainFailed(true);
      } else if (imagePreviewOrigin.startsWith('token-uri')) {
        setTokenUriFailed(true);
      }
      if (!shouldLog('preview', 'warn')) {
        return;
      }
      const logKey = `${props.token.id.toString()}-${imagePreviewOrigin}-error`;
      if (lastImageErrorRef.current === logKey) {
        return;
      }
      lastImageErrorRef.current = logKey;
      const target = event.currentTarget;
      const sourceType = imagePreviewSource.startsWith('data:')
        ? 'data-uri'
        : imagePreviewSource.startsWith('blob:')
          ? 'blob'
          : 'url';
      const diagnosticHints: string[] = [];
      if (
        imagePreviewSource.startsWith('blob:') &&
        contentUrlRef.current &&
        imagePreviewSource !== contentUrlRef.current
      ) {
        diagnosticHints.push('stale-blob-url');
      }
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
      if (resolvedKind !== 'image' && resolvedKind !== 'svg') {
        diagnosticHints.push('resolved-not-image');
      }
      if (imagePreviewOrigin.startsWith('token-uri')) {
        diagnosticHints.push('token-uri-fallback');
      }
      if (imagePreviewOrigin === 'thumbnail-cache') {
        diagnosticHints.push('thumbnail-cache');
      }
      logWarn('preview', 'Token card image failed to load', {
        id: props.token.id.toString(),
        source: imagePreviewOrigin,
        sourceType,
        thumbnailBytes: thumbnailQuery.data?.data?.length ?? null,
        mimeType: resolvedMimeType ?? mimeType ?? null,
        metaMimeType: mimeType ?? null,
        sniffedMimeType,
        mediaKind: resolvedKind,
        sniffedKind,
        totalSize: totalSize !== null ? totalSize.toString() : null,
        bytesLoaded: contentBytes,
        currentSrc: target.currentSrc || target.src || null,
        contentStatus: contentQuery.status,
        allowTokenUriFallback,
        hasTokenUri: !!props.token.tokenUri,
        diagnosticHints: diagnosticHints.length > 0 ? diagnosticHints : null
      });
    },
    [
      imagePreviewSource,
      imagePreviewOrigin,
      props.token.id,
      props.contractId,
      resolvedMimeType,
      mimeType,
      resolvedKind,
      sniffedMimeType,
      sniffedKind,
      totalSize,
      contentBytes,
      queryClient,
      contentQuery.data,
      contentQuery.isError,
      contentQuery.status,
      allowTokenUriFallback,
      props.token.tokenUri,
      thumbnailQuery.data?.data?.length
    ]
  );

  const previewLabel =
    resolvedMimeType ??
    mimeType ??
    (mediaKind === 'binary' ? 'Binary data' : mediaKind.toUpperCase());
  const docBadge = (() => {
    if (isPdf) {
      return 'PDF';
    }
    switch (resolvedKind) {
      case 'image':
        return 'IMG';
      case 'svg':
        return 'SVG';
      case 'audio':
        return 'AUDIO';
      case 'video':
        return 'VIDEO';
      case 'text':
        return 'TXT';
      case 'html':
        return 'HTML';
      case 'binary':
        return 'BIN';
      default:
        return 'DATA';
    }
  })();
  const docTitle = resolvedMimeType ?? mimeType ?? previewLabel;
  const docSnippet =
    textPreview && textPreview.text
      ? (() => {
          const firstLine =
            textPreview.text.split('\n').find((line) => line.trim().length > 0) ??
            textPreview.text;
          const trimmed = firstLine.trim();
          if (trimmed.length <= 120) {
            return trimmed;
          }
          return `${trimmed.slice(0, 120)}...`;
        })()
      : null;

  const renderDocCard = (options: {
    label: string;
    title?: string | null;
    snippet?: string | null;
    showPlay?: boolean;
  }) => (
    <div
      className={`token-card__doc${options.showPlay ? ' token-card__doc--media' : ''}`}
    >
      <div className="token-card__doc-icon">{options.label}</div>
      <div className="token-card__doc-body">
        <span className="token-card__doc-title">
          {options.title ?? options.label}
        </span>
        {options.snippet && (
          <span className="token-card__doc-text">{options.snippet}</span>
        )}
      </div>
      {options.showPlay && (
        <span className="token-card__doc-play" aria-hidden="true" />
      )}
    </div>
  );

  let mediaElement: JSX.Element;
  if (isHtmlDocument && htmlDoc) {
    if (lastPreviewLogRef.current !== 'html') {
      lastPreviewLogRef.current = 'html';
      logDebug('preview', 'Token card HTML preview resolved', {
        id: props.token.id.toString()
      });
    }
    mediaElement = (
      <iframe
        title={`inscription-${props.token.id.toString()}`}
        sandbox="allow-scripts"
        ref={setHtmlFrameRef}
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={htmlDoc}
      />
    );
  } else if (isPdf && contentUrl) {
    mediaElement = (
      <iframe
        title={`inscription-${props.token.id.toString()}`}
        sandbox=""
        referrerPolicy="no-referrer"
        loading="lazy"
        src={contentUrl}
      />
    );
  } else if (resolvedKind === 'video' && contentUrl) {
    mediaElement = (
      <video
        src={contentUrl}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        onLoadedData={(event) => {
          const video = event.currentTarget;
          const playAttempt = video.play();
          if (playAttempt && typeof playAttempt.catch === 'function') {
            void playAttempt.catch(() => {
              // Browsers may still block autoplay in some contexts.
            });
          }
        }}
      />
    );
  } else if (imagePreviewSource) {
    const sourceType = imagePreviewSource.startsWith('data:')
      ? 'data-uri'
      : imagePreviewSource.startsWith('blob:')
        ? 'blob'
        : 'url';
    const previewLogKey = `${sourceType}-${imagePreviewOrigin ?? 'unknown'}`;
    if (lastPreviewLogRef.current !== previewLogKey) {
      lastPreviewLogRef.current = previewLogKey;
      logDebug('preview', 'Token card preview resolved', {
        id: props.token.id.toString(),
        source: sourceType,
        origin: imagePreviewOrigin,
        mimeType: resolvedMimeType ?? mimeType ?? null,
        mediaKind: resolvedKind,
        totalSize: totalSize !== null ? totalSize.toString() : null,
        bytesLoaded: contentBytes,
        allowTokenUriFallback,
        hasTokenUri: !!props.token.tokenUri
      });
    }
    const previewClassName = [
      pixelatePreview ? 'preview-media--pixelated' : null,
      letterboxPreview ? 'preview-media--letterbox' : null
    ]
      .filter(Boolean)
      .join(' ');
    mediaElement = (
      <img
        key={
          shouldReplayFiniteAnimatedImage
            ? `animated-loop-${props.token.id.toString()}-${animatedReplayTick}`
            : undefined
        }
        src={imagePreviewSource}
        alt="token preview"
        loading="lazy"
        onLoad={handleImageLoad}
        onError={handleImageError}
        className={previewClassName || undefined}
      />
    );
  } else if (textPreview && !jsonImagePreview) {
    mediaElement = renderDocCard({
      label: docBadge,
      title: docTitle,
      snippet: docSnippet
    });
  } else if (resolvedKind === 'audio' || resolvedKind === 'video') {
    mediaElement = renderDocCard({
      label: docBadge,
      title: docTitle,
      snippet: 'Preview on selection.',
      showPlay: true
    });
  } else if (contentQuery.isLoading) {
    mediaElement = (
      <div className="token-card__placeholder">Loading preview...</div>
    );
  } else {
    if (contentQuery.isError) {
      logWarn('preview', 'Token card preview failed', {
        id: props.token.id.toString(),
        error:
          contentQuery.error instanceof Error
            ? contentQuery.error.message
            : String(contentQuery.error ?? 'unknown')
      });
    }
    mediaElement = renderDocCard({
      label: docBadge,
      title: previewLabel,
      snippet: docSnippet
    });
  }

  return (
    <>
      {mediaElement}
      {showStreamProgress && progressLabel && (
        <div className="token-card__progress" aria-hidden="true">
          <div className="token-card__progress-label">{progressLabel}</div>
          <div className="token-card__progress-bar">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
    </>
  );
}
