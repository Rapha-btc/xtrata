import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  isSvgCoverImageMimeType,
  resolveCollectionCoverImageUrl,
  resolveCollectionCoverInscriptionReference
} from '../lib/collections/cover-image';
import { parseContractPrincipal } from '../lib/collections/contract-link';
import { createXtrataClient } from '../lib/contract/client';
import { getNetworkFromAddress } from '../lib/network/guard';

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
};

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export default function CollectionCoverImage(props: CollectionCoverImageProps) {
  const [loadFailed, setLoadFailed] = useState(false);

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

  const inscriptionContract = useMemo(() => {
    if (!inscriptionReference || !shouldResolveSvg) {
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

  useEffect(() => {
    setLoadFailed(false);
  }, [resolvedUrl]);

  if (!resolvedUrl || loadFailed) {
    const message = loadFailed
      ? props.errorMessage ?? props.emptyMessage
      : shouldResolveSvg && !resolvedUrl
        ? props.loadingMessage ?? props.emptyMessage
        : props.emptyMessage;
    return <div className={props.placeholderClassName}>{message}</div>;
  }

  return (
    <img
      src={resolvedUrl}
      alt={props.alt}
      loading={props.loading ?? 'lazy'}
      decoding="async"
      onError={() => setLoadFailed(true)}
    />
  );
}
