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
  decodeTokenUriToImage,
  extractImageFromMetadata,
  fetchTokenImageFromUri,
  fetchOnChainContent,
  getMediaKind,
  getTextPreview,
  isDataUri,
  isHttpUrl,
  isLikelyImageUrl,
  MAX_THUMBNAIL_BYTES,
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

type TokenCardMediaProps = {
  token: TokenSummary;
  contractId: string;
  senderAddress: string;
  client: XtrataClient;
  isActiveTab?: boolean;
};

export default function TokenCardMedia(props: TokenCardMediaProps) {
  const isActiveTab = props.isActiveTab !== false;
  const queryClient = useQueryClient();
  const lastPreviewLogRef = useRef<string | null>(null);
  const lastImageLogRef = useRef<string | null>(null);
  const lastImageErrorRef = useRef<string | null>(null);
  const thumbnailGenRef = useRef(false);
  const [bridgeSource, setBridgeSource] = useState<MessageEventSource | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
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
    !!thumbnailQuery.data?.data && thumbnailQuery.data.data.length > 0;
  const shouldLoad =
    !!props.token.meta &&
    totalSize !== null &&
    totalSize <= MAX_THUMBNAIL_BYTES &&
    !svgPreview &&
    !hasThumbnail &&
    (mediaKind === 'image' ||
      mediaKind === 'svg' ||
      mediaKind === 'text' ||
      mediaKind === 'html' ||
      mediaKind === 'binary');
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
    queryKey: getTokenContentKey(props.contractId, props.token.id),
    queryFn: () =>
      fetchOnChainContent({
        client: props.client,
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
      resolvedMimeType !== 'application/pdf'
    ) {
      return null;
    }
    return createObjectUrl(contentQuery.data, resolvedMimeType ?? mimeType);
  }, [contentQuery.data, resolvedKind, resolvedMimeType, mimeType]);

  useEffect(() => {
    if (!contentUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(contentUrl);
    };
  }, [contentUrl]);

  useEffect(() => {
    lastPreviewLogRef.current = null;
    lastImageLogRef.current = null;
    lastImageErrorRef.current = null;
    thumbnailGenRef.current = false;
    setThumbnailFailed(false);
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
    !props.token.meta ||
    contentQuery.isError ||
    !shouldLoad ||
    mediaKind === 'audio' ||
    mediaKind === 'video';
  const tokenUriImage = allowTokenUriFallback
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
      allowTokenUriFallback && !tokenUriImage && !!props.token.tokenUri && isActiveTab,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const tokenUriPreview = allowTokenUriFallback ? tokenUriQuery.data : null;
  const directTokenUri =
    allowTokenUriFallback &&
    props.token.tokenUri &&
    (isDataUri(props.token.tokenUri) ||
      (isHttpUrl(props.token.tokenUri) &&
        isLikelyImageUrl(props.token.tokenUri)))
      ? props.token.tokenUri
      : null;

  const imagePreviewSource =
    svgPreview ||
    resolvedThumbnailUrl ||
    (resolvedKind === 'image' || resolvedKind === 'svg' ? contentUrl : null) ||
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
    if (resolvedThumbnailUrl) {
      return 'thumbnail-cache';
    }
    if ((resolvedKind === 'image' || resolvedKind === 'svg') && contentUrl) {
      return 'on-chain';
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

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      if (!imagePreviewSource || !imagePreviewOrigin) {
        return;
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
      props.token.tokenUri
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
    mediaElement = (
      <img
        src={imagePreviewSource}
        alt="token preview"
        loading="lazy"
        onLoad={handleImageLoad}
        onError={handleImageError}
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
