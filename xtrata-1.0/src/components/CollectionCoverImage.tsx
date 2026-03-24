import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  isSvgCoverImageMimeType,
  normalizeCoverImageSource,
  resolveCollectionCoverImageUrl,
  resolveCollectionCoverInscriptionReference
} from '../lib/collections/cover-image';
import { parseContractPrincipal } from '../lib/collections/contract-link';
import { createXtrataClient } from '../lib/contract/client';
import { getNetworkFromAddress } from '../lib/network/guard';
import { fetchOnChainContent } from '../lib/viewer/content';
import { isExecutableRuntimeMimeType } from '../lib/viewer/runtime-open';
import { createObjectUrl } from '../lib/utils/blob';
import { logDebug, logWarn, shouldLog } from '../lib/utils/logger';

type CollectionCoverImageProps = {
  coverImage: unknown;
  collectionId?: string | null;
  fallbackCoreContractId?: string | null;
  fallbackUrl?: string | null;
  alt: string;
  placeholderClassName: string;
  emptyMessage: string;
  loadingMessage?: string;
  errorMessage?: string;
  loading?: 'lazy' | 'eager';
  debugLabel?: string;
};

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const classifyUrl = (value: string | null) => {
  if (!value) {
    return 'none';
  }
  if (value.startsWith('data:')) {
    return 'data-uri';
  }
  if (value.startsWith('/runtime/content?')) {
    return 'runtime-content';
  }
  if (value.startsWith('/collections/')) {
    return 'collection-asset-preview';
  }
  if (value.startsWith('blob:')) {
    return 'blob';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return 'http';
  }
  return 'other';
};

const toRuntimeLauncherUrl = (value: string | null, sourceUrl?: string | null) => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, 'https://xtrata.local');
    if (parsed.pathname !== '/runtime/content') {
      return null;
    }
    parsed.pathname = '/runtime/';
    if (sourceUrl) {
      parsed.searchParams.set('source', sourceUrl);
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

export default function CollectionCoverImage(props: CollectionCoverImageProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [runtimeSourceUrl, setRuntimeSourceUrl] = useState<string | null>(null);
  const [runtimeSourceState, setRuntimeSourceState] = useState<
    'idle' | 'pending' | 'ready' | 'error'
  >('idle');
  const unresolvedLogRef = useRef<string | null>(null);
  const fallbackLogRef = useRef<string | null>(null);
  const loadLogRef = useRef<string | null>(null);
  const errorLogRef = useRef<string | null>(null);
  const debugLabel = props.debugLabel ?? props.alt;
  const coverImageRecord = useMemo(() => toRecord(props.coverImage), [props.coverImage]);
  const coverSource = useMemo(
    () => normalizeCoverImageSource(coverImageRecord?.source) ?? null,
    [coverImageRecord]
  );
  const coverSummary = useMemo(
    () => ({
      source: coverSource,
      assetId:
        typeof coverImageRecord?.assetId === 'string' ? coverImageRecord.assetId : null,
      tokenId:
        typeof coverImageRecord?.tokenId === 'string'
          ? coverImageRecord.tokenId
          : typeof coverImageRecord?.inscriptionId === 'string'
            ? coverImageRecord.inscriptionId
            : null,
      mimeType:
        typeof coverImageRecord?.mimeType === 'string'
          ? coverImageRecord.mimeType
          : null,
      imageUrlKind: classifyUrl(
        typeof coverImageRecord?.imageUrl === 'string' ? coverImageRecord.imageUrl : null
      )
    }),
    [coverImageRecord, coverSource]
  );

  const directUrl = useMemo(() => {
    const resolved = resolveCollectionCoverImageUrl({
      coverImage: props.coverImage,
      collectionId: props.collectionId,
      fallbackCoreContractId: props.fallbackCoreContractId
    });
    return resolved ?? toNullableText(props.fallbackUrl);
  }, [
    props.collectionId,
    props.coverImage,
    props.fallbackCoreContractId,
    props.fallbackUrl
  ]);

  const inscriptionReference = useMemo(
    () =>
      resolveCollectionCoverInscriptionReference({
        coverImage: props.coverImage,
        fallbackCoreContractId: props.fallbackCoreContractId
      }),
    [props.coverImage, props.fallbackCoreContractId]
  );

  const shouldResolveSvg =
    !!inscriptionReference &&
    (inscriptionReference.preferDataUriRender ||
      isSvgCoverImageMimeType(inscriptionReference.mimeType));
  const coverMimeType =
    inscriptionReference?.mimeType ?? coverSummary.mimeType ?? null;

  const inscriptionContract = useMemo(() => {
    if (!inscriptionReference) {
      return null;
    }
    const parsed = parseContractPrincipal(inscriptionReference.coreContractId);
    if (!parsed) {
      return null;
    }
    return {
      address: parsed.address,
      contractName: parsed.contractName,
      network: getNetworkFromAddress(parsed.address) ?? 'mainnet'
    } as const;
  }, [inscriptionReference, shouldResolveSvg]);

  const inscriptionClient = useMemo(
    () =>
      inscriptionContract
        ? createXtrataClient({ contract: inscriptionContract })
        : null,
    [inscriptionContract]
  );
  const inscriptionMetaQuery = useQuery({
    queryKey: [
      'collection-cover',
      'meta',
      inscriptionReference?.coreContractId ?? 'none',
      inscriptionReference?.tokenId ?? 'none'
    ],
    queryFn: async () => {
      if (!inscriptionClient || !inscriptionReference) {
        return null;
      }
      return inscriptionClient.getInscriptionMeta(
        BigInt(inscriptionReference.tokenId),
        inscriptionClient.contract.address
      );
    },
    enabled: !!inscriptionClient && !!inscriptionReference,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const svgDataUriQuery = useQuery({
    queryKey: [
      'collection-cover',
      'svg-data-uri',
      inscriptionReference?.coreContractId ?? 'none',
      inscriptionReference?.tokenId ?? 'none'
    ],
    queryFn: async () => {
      if (!inscriptionClient || !inscriptionReference) {
        return null;
      }
      return inscriptionClient.getSvgDataUri(
        BigInt(inscriptionReference.tokenId),
        inscriptionClient.contract.address
      );
    },
    enabled: shouldResolveSvg && !!inscriptionClient && !!inscriptionReference,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const resolvedUrl = useMemo(() => {
    if (!shouldResolveSvg) {
      return directUrl;
    }
    if (svgDataUriQuery.data) {
      return svgDataUriQuery.data;
    }
    if (svgDataUriQuery.isError || svgDataUriQuery.status === 'success') {
      return directUrl;
    }
    return null;
  }, [
    directUrl,
    shouldResolveSvg,
    svgDataUriQuery.data,
    svgDataUriQuery.isError,
    svgDataUriQuery.status
  ]);
  const runtimeEndpointUrl = useMemo(
    () => (classifyUrl(resolvedUrl) === 'runtime-content' ? resolvedUrl : null),
    [resolvedUrl]
  );
  const shouldUseRuntimeFrame = useMemo(
    () =>
      !!runtimeEndpointUrl &&
      isExecutableRuntimeMimeType(coverMimeType),
    [runtimeEndpointUrl, coverMimeType]
  );
  const shouldUseInscriptionBlob = useMemo(
    () =>
      !!inscriptionReference &&
      !shouldResolveSvg &&
      !shouldUseRuntimeFrame,
    [inscriptionReference, shouldResolveSvg, shouldUseRuntimeFrame]
  );
  const inscriptionImageBytesQuery = useQuery({
    queryKey: [
      'collection-cover',
      'bytes',
      inscriptionReference?.coreContractId ?? 'none',
      inscriptionReference?.tokenId ?? 'none'
    ],
    queryFn: async () => {
      if (
        !inscriptionClient ||
        !inscriptionReference ||
        !inscriptionMetaQuery.data
      ) {
        return null;
      }
      return fetchOnChainContent({
        client: inscriptionClient,
        id: BigInt(inscriptionReference.tokenId),
        senderAddress: inscriptionClient.contract.address,
        totalSize: inscriptionMetaQuery.data.totalSize,
        mimeType: inscriptionMetaQuery.data.mimeType
      });
    },
    enabled:
      shouldUseInscriptionBlob &&
      !!inscriptionClient &&
      !!inscriptionReference &&
      !!inscriptionMetaQuery.data,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const inscriptionBlobUrl = useMemo(() => {
    if (!shouldUseInscriptionBlob || !inscriptionImageBytesQuery.data) {
      return null;
    }
    const mimeType =
      inscriptionMetaQuery.data?.mimeType ?? coverMimeType ?? 'application/octet-stream';
    return createObjectUrl(inscriptionImageBytesQuery.data, mimeType);
  }, [
    shouldUseInscriptionBlob,
    inscriptionImageBytesQuery.data,
    inscriptionMetaQuery.data,
    coverMimeType
  ]);
  useEffect(() => {
    if (!inscriptionBlobUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(inscriptionBlobUrl);
    };
  }, [inscriptionBlobUrl]);
  const runtimeLauncherUrl = useMemo(
    () =>
      shouldUseRuntimeFrame
        ? toRuntimeLauncherUrl(resolvedUrl, runtimeSourceUrl)
        : null,
    [resolvedUrl, runtimeSourceUrl, shouldUseRuntimeFrame]
  );

  useEffect(() => {
    if (!runtimeEndpointUrl || !shouldUseRuntimeFrame) {
      setRuntimeSourceUrl(null);
      setRuntimeSourceState('idle');
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setRuntimeSourceUrl(null);
    setRuntimeSourceState('pending');

    void fetch(runtimeEndpointUrl, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'follow'
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Runtime cover source returned HTTP ${response.status}.`);
        }
        const blob = await response.blob();
        if (blob.size <= 0) {
          throw new Error('Runtime cover source was empty.');
        }
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
          return;
        }
        setRuntimeSourceUrl(objectUrl);
        setRuntimeSourceState('ready');
        if (shouldLog('cover', 'debug')) {
          logDebug('cover', 'Collection cover runtime source prepared', {
            label: debugLabel,
            collectionId: props.collectionId ?? null,
            runtimeEndpointUrl,
            blobBytes: blob.size
          });
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setRuntimeSourceUrl(null);
        setRuntimeSourceState('error');
        logWarn('cover', 'Collection cover runtime source fetch failed', {
          label: debugLabel,
          collectionId: props.collectionId ?? null,
          runtimeEndpointUrl,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [runtimeEndpointUrl, shouldUseRuntimeFrame, debugLabel, props.collectionId]);

  useEffect(() => {
    if (!shouldLog('cover', 'debug')) {
      return;
    }
    logDebug('cover', 'Collection cover config resolved', {
      label: debugLabel,
      collectionId: props.collectionId ?? null,
      fallbackCoreContractId: props.fallbackCoreContractId ?? null,
      fallbackUrlKind: classifyUrl(toNullableText(props.fallbackUrl)),
      directUrlKind: classifyUrl(directUrl),
      runtimeEndpointUrlKind: classifyUrl(runtimeEndpointUrl),
      runtimeLauncherUrlKind: classifyUrl(runtimeLauncherUrl),
      runtimeSourceState,
      coverMimeType,
      shouldUseInscriptionBlob,
      inscriptionMetaStatus: inscriptionMetaQuery.status,
      inscriptionBytesStatus: inscriptionImageBytesQuery.status,
      shouldUseRuntimeFrame,
      cover: coverSummary,
      inscriptionReference,
      shouldResolveSvg
    });
  }, [
    debugLabel,
    props.collectionId,
    props.fallbackCoreContractId,
    props.fallbackUrl,
    directUrl,
    runtimeEndpointUrl,
    runtimeLauncherUrl,
    runtimeSourceState,
    coverMimeType,
    shouldUseInscriptionBlob,
    inscriptionMetaQuery.status,
    inscriptionImageBytesQuery.status,
    shouldUseRuntimeFrame,
    coverSummary,
    inscriptionReference,
    shouldResolveSvg
  ]);

  useEffect(() => {
    if (!shouldResolveSvg) {
      return;
    }
    if (svgDataUriQuery.isError) {
      logWarn('cover', 'Collection cover SVG data-uri lookup failed', {
        label: debugLabel,
        collectionId: props.collectionId ?? null,
        cover: coverSummary,
        inscriptionReference,
        directUrlKind: classifyUrl(directUrl),
        runtimeEndpointUrlKind: classifyUrl(runtimeEndpointUrl),
        runtimeLauncherUrlKind: classifyUrl(runtimeLauncherUrl),
        shouldUseRuntimeFrame,
        error:
          svgDataUriQuery.error instanceof Error
            ? svgDataUriQuery.error.message
            : String(svgDataUriQuery.error ?? 'unknown')
      });
      return;
    }
    if (svgDataUriQuery.status === 'success' && !svgDataUriQuery.data) {
      const logKey = `${debugLabel}|${props.collectionId ?? 'none'}|svg-null`;
      if (fallbackLogRef.current === logKey) {
        return;
      }
      fallbackLogRef.current = logKey;
      logWarn('cover', 'Collection cover SVG data-uri was empty; using URL fallback', {
        label: debugLabel,
        collectionId: props.collectionId ?? null,
        cover: coverSummary,
        inscriptionReference,
        directUrlKind: classifyUrl(directUrl)
      });
    }
  }, [
    debugLabel,
    props.collectionId,
    shouldResolveSvg,
    svgDataUriQuery.status,
    svgDataUriQuery.data,
    svgDataUriQuery.isError,
    svgDataUriQuery.error,
    coverSummary,
    inscriptionReference,
    directUrl,
    runtimeEndpointUrl,
    runtimeLauncherUrl,
    shouldUseRuntimeFrame
  ]);

  useEffect(() => {
    if (!shouldUseInscriptionBlob) {
      return;
    }
    if (inscriptionMetaQuery.isError) {
      logWarn('cover', 'Collection cover inscription meta lookup failed', {
        label: debugLabel,
        collectionId: props.collectionId ?? null,
        inscriptionReference,
        error:
          inscriptionMetaQuery.error instanceof Error
            ? inscriptionMetaQuery.error.message
            : String(inscriptionMetaQuery.error ?? 'unknown')
      });
      return;
    }
    if (inscriptionImageBytesQuery.isError) {
      logWarn('cover', 'Collection cover inscription bytes fetch failed', {
        label: debugLabel,
        collectionId: props.collectionId ?? null,
        inscriptionReference,
        metaMimeType: inscriptionMetaQuery.data?.mimeType ?? null,
        metaTotalSize:
          inscriptionMetaQuery.data?.totalSize?.toString() ?? null,
        error:
          inscriptionImageBytesQuery.error instanceof Error
            ? inscriptionImageBytesQuery.error.message
            : String(inscriptionImageBytesQuery.error ?? 'unknown')
      });
    }
  }, [
    shouldUseInscriptionBlob,
    inscriptionMetaQuery.isError,
    inscriptionMetaQuery.error,
    inscriptionMetaQuery.data,
    inscriptionImageBytesQuery.isError,
    inscriptionImageBytesQuery.error,
    debugLabel,
    props.collectionId,
    inscriptionReference
  ]);

  useEffect(() => {
    setLoadFailed(false);
  }, [resolvedUrl]);

  useEffect(() => {
    const hasConfiguredCover = !!coverImageRecord || !!toNullableText(props.fallbackUrl);
    if (!hasConfiguredCover) {
      return;
    }
    if (resolvedUrl || loadFailed || (shouldResolveSvg && svgDataUriQuery.status === 'pending')) {
      return;
    }
    const logKey = `${debugLabel}|${props.collectionId ?? 'none'}|${classifyUrl(directUrl)}`;
    if (unresolvedLogRef.current === logKey) {
      return;
    }
    unresolvedLogRef.current = logKey;
    logWarn('cover', 'Collection cover could not resolve an image source', {
      label: debugLabel,
      collectionId: props.collectionId ?? null,
      fallbackCoreContractId: props.fallbackCoreContractId ?? null,
      fallbackUrlKind: classifyUrl(toNullableText(props.fallbackUrl)),
      directUrlKind: classifyUrl(directUrl),
      runtimeEndpointUrlKind: classifyUrl(runtimeEndpointUrl),
      runtimeLauncherUrlKind: classifyUrl(runtimeLauncherUrl),
      runtimeSourceState,
      shouldUseRuntimeFrame,
      cover: coverSummary,
      inscriptionReference,
      shouldResolveSvg,
      svgQueryStatus: svgDataUriQuery.status
    });
  }, [
    debugLabel,
    props.collectionId,
    props.fallbackCoreContractId,
    props.fallbackUrl,
    coverImageRecord,
    resolvedUrl,
    loadFailed,
    directUrl,
    runtimeEndpointUrl,
    runtimeLauncherUrl,
    runtimeSourceState,
    shouldUseRuntimeFrame,
    coverSummary,
    inscriptionReference,
    shouldResolveSvg,
    svgDataUriQuery.status
  ]);

  if (
    !resolvedUrl ||
    loadFailed ||
    (shouldUseInscriptionBlob &&
      (inscriptionMetaQuery.status === 'pending' ||
        inscriptionImageBytesQuery.status === 'pending')) ||
    (shouldUseRuntimeFrame && runtimeSourceState === 'pending')
  ) {
    const message = loadFailed
      ? props.errorMessage ?? props.emptyMessage
      : shouldUseInscriptionBlob &&
          (inscriptionMetaQuery.status === 'pending' ||
            inscriptionImageBytesQuery.status === 'pending')
        ? props.loadingMessage ?? props.emptyMessage
      : shouldUseRuntimeFrame && runtimeSourceState === 'pending'
        ? props.loadingMessage ?? props.emptyMessage
      : shouldResolveSvg && !resolvedUrl
        ? props.loadingMessage ?? props.emptyMessage
        : props.emptyMessage;
    return <div className={props.placeholderClassName}>{message}</div>;
  }

  if (shouldUseRuntimeFrame && runtimeLauncherUrl) {
    return (
      <iframe
        title={props.alt}
        src={runtimeLauncherUrl}
        loading={props.loading ?? 'lazy'}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (!shouldLog('cover', 'debug')) {
            return;
          }
          const logKey = `${debugLabel}|runtime|${runtimeLauncherUrl}`;
          if (loadLogRef.current === logKey) {
            return;
          }
          loadLogRef.current = logKey;
          logDebug('cover', 'Collection cover runtime frame loaded', {
            label: debugLabel,
            collectionId: props.collectionId ?? null,
            resolvedUrlKind: classifyUrl(resolvedUrl),
            runtimeEndpointUrl,
            runtimeLauncherUrl,
            runtimeSourceState,
            shouldUseRuntimeFrame,
            cover: coverSummary,
            inscriptionReference
          });
        }}
      />
    );
  }

  return (
    <img
      src={inscriptionBlobUrl ?? resolvedUrl}
      alt={props.alt}
      loading={props.loading ?? 'lazy'}
      decoding="async"
      onLoad={() => {
        if (!shouldLog('cover', 'debug')) {
          return;
        }
        const logKey = `${debugLabel}|${resolvedUrl}`;
        if (loadLogRef.current === logKey) {
          return;
        }
        loadLogRef.current = logKey;
        logDebug('cover', 'Collection cover image loaded', {
          label: debugLabel,
          collectionId: props.collectionId ?? null,
          resolvedUrlKind: classifyUrl(inscriptionBlobUrl ?? resolvedUrl),
          inscriptionBlobUrl: !!inscriptionBlobUrl,
          cover: coverSummary,
          inscriptionReference,
          shouldUseInscriptionBlob,
          shouldResolveSvg
        });
      }}
      onError={() => {
        setLoadFailed(true);
        const logKey = `${debugLabel}|img-error|${inscriptionBlobUrl ?? resolvedUrl}`;
        if (errorLogRef.current === logKey) {
          return;
        }
        errorLogRef.current = logKey;
        logWarn('cover', 'Collection cover image element failed to load', {
          label: debugLabel,
          collectionId: props.collectionId ?? null,
          resolvedUrlKind: classifyUrl(inscriptionBlobUrl ?? resolvedUrl),
          inscriptionBlobUrl: !!inscriptionBlobUrl,
          runtimeEndpointUrlKind: classifyUrl(runtimeEndpointUrl),
          runtimeLauncherUrlKind: classifyUrl(runtimeLauncherUrl),
          shouldUseRuntimeFrame,
          cover: coverSummary,
          inscriptionReference,
          shouldUseInscriptionBlob,
          shouldResolveSvg
        });
      }}
    />
  );
}
