import { useEffect, useMemo, useState } from 'react';
import {
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  type ClarityValue,
  uintCV,
  validateStacksAddress
} from '@stacks/transactions';
import AddressLabel from '../../components/AddressLabel';
import {
  getArtistAllowlistBnsNames,
  getArtistAllowlistLiteralAddresses,
  parseArtistAllowlist,
  XTRATA_OWNER_ADDRESS
} from '../../config/manage';
import { resolveBnsAddress } from '../../lib/bns/resolver';
import { getNetworkFromAddress } from '../../lib/network/guard';
import { toStacksNetwork } from '../../lib/network/stacks';
import type { NetworkType } from '../../lib/network/types';
import { useManageWallet } from '../ManageWalletContext';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import {
  getCollectionPublicDisplayOrder,
  isCollectionVisibleOnPublicPage,
  mergeCollectionPublicDisplayOrderMetadata,
  mergeCollectionPublicVisibilityMetadata,
  sortCollectionsForPublicPage
} from '../lib/public-page';
import { resolveCollectionContractLink } from '../lib/contract-link';

type CollectionRecord = {
  id: string;
  slug: string;
  artist_address: string;
  contract_address: string | null;
  display_name: string | null;
  state: string;
  created_at?: number;
  metadata?: Record<string, unknown> | null;
};

type RuntimeAllowlistPayload = {
  raw?: unknown;
  source?: unknown;
};

type StateCount = {
  state: string;
  total: number;
};

type CollectionOversightResponse = {
  collection: {
    id: string;
    slug: string;
    artistAddress: string;
    contractAddress: string | null;
    displayName: string | null;
    state: string;
    createdAt: number;
    updatedAt: number;
  };
  deploy: {
    txId: string | null;
    deployedAt: string | null;
    contractName: string | null;
    coreContractId: string | null;
  };
  settingsPreview: {
    mintType: string | null;
    templateVersion: string | null;
    collection: Record<string, unknown> | null;
    hardcodedDefaults: Record<string, unknown> | null;
  };
  db: {
    assets: {
      total: number;
      active: number;
      totalBytes: number;
      activeBytes: number;
      totalChunks: number;
      states: StateCount[];
    };
    reservations: {
      total: number;
      states: StateCount[];
    };
    storageKeysTracked: number;
  };
  bucket: {
    available: boolean;
    binding: string | null;
    prefix: string;
    objectCount: number;
    totalBytes: number;
    scannedAll: boolean;
    sampleKeys: string[];
    error: string | null;
  };
  consistency: {
    dbKeysMissingInBucket: number;
    bucketKeysMissingInDb: number;
    sampleDbKeysMissingInBucket: string[];
    sampleBucketKeysMissingInDb: string[];
  };
};

type CollectionContractTarget = {
  address: string;
  contractName: string;
  network: NetworkType;
};

type CollectionMintSnapshot = {
  paused: boolean | null;
  finalized: boolean | null;
  mintPriceMicroStx: bigint | null;
  activePhaseId: bigint | null;
  activePhaseMintPriceMicroStx: bigint | null;
  maxSupply: bigint | null;
  mintedCount: bigint | null;
  reservedCount: bigint | null;
  remaining: bigint | null;
  refreshedAt: number;
};

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

const normalizeAddress = (value: string) => value.trim().toUpperCase();

const formatStateLabel = (value: string) => {
  const cleaned = value.replace(/[-_]+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'draft';
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  if (value < 1024) {
    return `${value.toFixed(0)} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const formatDateTime = (value: number | string | null | undefined) => {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toLocaleString();
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toLocaleString();
  }
  return 'Unknown';
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBigIntOrNull = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

const parseUintCv = (value: ClarityValue) => {
  const parsed = cvToValue(value) as unknown;
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed === 'bigint') {
    return parsed;
  }
  if (typeof parsed === 'string') {
    try {
      return BigInt(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed === 'number' && Number.isFinite(parsed)) {
    return BigInt(Math.floor(parsed));
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    const raw = (parsed as { value?: unknown }).value;
    if (typeof raw === 'bigint') {
      return raw;
    }
    if (typeof raw === 'string') {
      try {
        return BigInt(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const unwrapResponse = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    const parsed = cvToValue(value.value) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'value' in (parsed as Record<string, unknown>)
    ) {
      throw new Error(String((parsed as { value?: unknown }).value ?? 'Contract error'));
    }
    throw new Error(String(parsed ?? 'Contract error'));
  }
  return value;
};

const toMicroStxLabel = (value: bigint | null) => {
  if (value === null) {
    return 'Unknown';
  }
  const negative = value < 0n;
  const normalized = negative ? -value : value;
  const whole = normalized / 1_000_000n;
  const fraction = (normalized % 1_000_000n).toString().padStart(6, '0');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const formatted =
    trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : `${whole}`;
  return `${negative ? '-' : ''}${formatted} STX`;
};

const formatCount = (value: bigint | null) =>
  value === null ? 'Unknown' : value.toString();

const isPublishedCollectionState = (state: unknown) =>
  String(state ?? '')
    .trim()
    .toLowerCase() === 'published';

const getLivePagePath = (collection: Pick<CollectionRecord, 'slug' | 'id'>) => {
  const key = collection.slug?.trim() || collection.id.trim();
  if (!key) {
    return null;
  }
  return `/collection/${encodeURIComponent(key)}`;
};

const resolveCollectionContractTarget = (
  collection: CollectionRecord,
  oversight: CollectionOversightResponse | null
): CollectionContractTarget | null => {
  const metadata = toRecord(collection.metadata);
  const resolved = resolveCollectionContractLink({
    collectionId: collection.id,
    collectionSlug: collection.slug,
    contractAddress:
      toStringOrNull(oversight?.collection.contractAddress) ??
      toStringOrNull(collection.contract_address),
    metadata,
    deployContractAddress: toStringOrNull(oversight?.collection.contractAddress),
    deployContractName: toStringOrNull(oversight?.deploy.contractName)
  });
  if (!resolved) {
    return null;
  }
  if (
    !validateStacksAddress(resolved.address) ||
    !CONTRACT_NAME_PATTERN.test(resolved.contractName)
  ) {
    return null;
  }
  return {
    address: resolved.address,
    contractName: resolved.contractName,
    network: getNetworkFromAddress(resolved.address) ?? 'mainnet'
  };
};

const buildExplorerTxUrl = (txId: string, network: NetworkType | null) => {
  const chain = network === 'testnet' ? 'testnet' : 'mainnet';
  const normalizedTxId = txId.startsWith('0x') ? txId : `0x${txId}`;
  return `https://explorer.hiro.so/txid/${normalizedTxId}?chain=${chain}&tab=overview`;
};

const buildExplorerAddressUrl = (
  value: string,
  network: NetworkType | null
) => {
  const chain = network === 'testnet' ? 'testnet' : 'mainnet';
  return `https://explorer.hiro.so/address/${value}?chain=${chain}`;
};

const summarizeStates = (states: StateCount[]) => {
  if (states.length === 0) {
    return 'none';
  }
  return states
    .slice()
    .sort((left, right) => right.total - left.total || left.state.localeCompare(right.state))
    .map((state) => `${state.total} ${formatStateLabel(state.state)}`)
    .join(' · ');
};

export default function OwnerOversightPanel() {
  const { walletSession } = useManageWallet();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);
  const [copiedCollectionId, setCopiedCollectionId] = useState<string | null>(null);
  const [runtimeAllowlistRaw, setRuntimeAllowlistRaw] = useState('');
  const [runtimeAllowlistSource, setRuntimeAllowlistSource] = useState<string | null>(null);
  const [resolvedBnsAllowlist, setResolvedBnsAllowlist] = useState<
    Record<string, string | null>
  >({});
  const [bnsResolutionPending, setBnsResolutionPending] = useState(false);
  const [expandedByCollectionId, setExpandedByCollectionId] = useState<
    Record<string, boolean>
  >({});
  const [oversightByCollectionId, setOversightByCollectionId] = useState<
    Record<string, CollectionOversightResponse | null>
  >({});
  const [oversightLoadingByCollectionId, setOversightLoadingByCollectionId] =
    useState<Record<string, boolean>>({});
  const [oversightErrorByCollectionId, setOversightErrorByCollectionId] =
    useState<Record<string, string | null>>({});
  const [mintSnapshotByCollectionId, setMintSnapshotByCollectionId] = useState<
    Record<string, CollectionMintSnapshot | null>
  >({});
  const [mintSnapshotLoadingByCollectionId, setMintSnapshotLoadingByCollectionId] =
    useState<Record<string, boolean>>({});
  const [mintSnapshotErrorByCollectionId, setMintSnapshotErrorByCollectionId] =
    useState<Record<string, string | null>>({});
  const [publicVisibilitySavingByCollectionId, setPublicVisibilitySavingByCollectionId] =
    useState<Record<string, boolean>>({});
  const [publicVisibilityMessageByCollectionId, setPublicVisibilityMessageByCollectionId] =
    useState<Record<string, string | null>>({});
  const [publicOrderPendingCollectionId, setPublicOrderPendingCollectionId] = useState<
    string | null
  >(null);
  const [showDraftsByArtistAddress, setShowDraftsByArtistAddress] = useState<
    Record<string, boolean>
  >({});

  const buildLiteralAllowlist = useMemo(
    () => getArtistAllowlistLiteralAddresses(),
    []
  );
  const buildBnsAllowlist = useMemo(() => getArtistAllowlistBnsNames(), []);
  const runtimeAllowlist = useMemo(
    () => parseArtistAllowlist(runtimeAllowlistRaw),
    [runtimeAllowlistRaw]
  );

  const bnsAllowlist = useMemo(
    () =>
      Array.from(
        new Set([
          ...buildBnsAllowlist,
          ...Array.from(runtimeAllowlist.bnsNames.values())
        ])
      ),
    [buildBnsAllowlist, runtimeAllowlist]
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadCollections = async () => {
      setIsLoadingCollections(true);
      setError(null);
      try {
        const response = await fetch('/collections?includeArchived=1', {
          signal: controller.signal
        });
        const payload = await parseManageJsonResponse<CollectionRecord[]>(
          response,
          'Collections'
        );
        setCollections(payload);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(toManageApiErrorMessage(err, 'Unable to load collections'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCollections(false);
        }
      }
    };

    void loadCollections();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeAllowlist = async () => {
      try {
        const response = await fetch('/manage/allowlist', { cache: 'no-store' });
        const payload = await parseManageJsonResponse<RuntimeAllowlistPayload>(
          response,
          'Allowlist'
        );
        if (cancelled) {
          return;
        }
        setRuntimeAllowlistRaw(
          typeof payload.raw === 'string' ? payload.raw : ''
        );
        setRuntimeAllowlistSource(
          typeof payload.source === 'string' && payload.source.trim()
            ? payload.source
            : null
        );
      } catch {
        if (cancelled) {
          return;
        }
        setRuntimeAllowlistRaw('');
        setRuntimeAllowlistSource(null);
      }
    };

    void loadRuntimeAllowlist();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (bnsAllowlist.length === 0) {
      setResolvedBnsAllowlist({});
      setBnsResolutionPending(false);
      return () => {
        cancelled = true;
      };
    }

    setBnsResolutionPending(true);

    Promise.all(
      bnsAllowlist.map(async (name) => {
        try {
          const result = await resolveBnsAddress({
            name,
            network: walletSession.network ?? 'mainnet'
          });
          return [
            name,
            result.address ? normalizeAddress(result.address) : null
          ] as const;
        } catch {
          return [name, null] as const;
        }
      })
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setResolvedBnsAllowlist(Object.fromEntries(entries));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setBnsResolutionPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bnsAllowlist, walletSession.network]);

  const allowlistedArtistAddresses = useMemo(() => {
    const addresses = new Set<string>();
    buildLiteralAllowlist.forEach((address) => {
      addresses.add(normalizeAddress(address));
    });
    runtimeAllowlist.literalAddresses.forEach((address) => {
      addresses.add(normalizeAddress(address));
    });
    Object.values(resolvedBnsAllowlist).forEach((resolvedAddress) => {
      if (resolvedAddress) {
        addresses.add(normalizeAddress(resolvedAddress));
      }
    });
    addresses.delete(normalizeAddress(XTRATA_OWNER_ADDRESS));
    return addresses;
  }, [buildLiteralAllowlist, runtimeAllowlist, resolvedBnsAllowlist]);

  const filteredCollections = useMemo(
    () =>
      collections.filter((collection) =>
        allowlistedArtistAddresses.has(normalizeAddress(collection.artist_address))
      ),
    [allowlistedArtistAddresses, collections]
  );

  const groupedCollections = useMemo(() => {
    const grouped = new Map<string, CollectionRecord[]>();
    filteredCollections.forEach((collection) => {
      const artistAddress = normalizeAddress(collection.artist_address);
      const existing = grouped.get(artistAddress);
      if (existing) {
        existing.push(collection);
        return;
      }
      grouped.set(artistAddress, [collection]);
    });

    return Array.from(grouped.entries()).sort((left, right) => {
      if (right[1].length !== left[1].length) {
        return right[1].length - left[1].length;
      }
      return left[0].localeCompare(right[0]);
    });
  }, [filteredCollections]);

  const stateSummary = useMemo(() => {
    const counts = new Map<string, number>();
    filteredCollections.forEach((collection) => {
      const key = formatStateLabel(collection.state);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([state, count]) => `${count} ${state}`)
      .join(' · ');
  }, [filteredCollections]);
  const publicVisibleCount = useMemo(
    () =>
      filteredCollections.filter(
        (collection) =>
          isPublishedCollectionState(collection.state) &&
          isCollectionVisibleOnPublicPage(collection.metadata)
      ).length,
    [filteredCollections]
  );
  const publishedCollections = useMemo(
    () =>
      filteredCollections.filter((collection) =>
        isPublishedCollectionState(collection.state)
      ),
    [filteredCollections]
  );
  const publicVisiblePublishedCollections = useMemo(
    () =>
      sortCollectionsForPublicPage(
        publishedCollections.filter((collection) =>
          isCollectionVisibleOnPublicPage(collection.metadata)
        )
      ),
    [publishedCollections]
  );
  const hiddenPublishedCollections = useMemo(
    () =>
      [...publishedCollections]
        .filter((collection) => !isCollectionVisibleOnPublicPage(collection.metadata))
        .sort((left, right) => {
          const leftLabel = left.display_name ?? left.slug;
          const rightLabel = right.display_name ?? right.slug;
          return leftLabel.localeCompare(rightLabel);
        }),
    [publishedCollections]
  );
  const curatedPublishedCollections = useMemo(
    () => [...publicVisiblePublishedCollections, ...hiddenPublishedCollections],
    [hiddenPublishedCollections, publicVisiblePublishedCollections]
  );

  const copyCollectionId = async (collectionId: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(collectionId);
        setCopiedCollectionId(collectionId);
        window.setTimeout(() => {
          setCopiedCollectionId((current) =>
            current === collectionId ? null : current
          );
        }, 1500);
      }
    } catch {
      setCopiedCollectionId(null);
    }
  };

  const loadCollectionOversight = async (collectionId: string) => {
    setOversightLoadingByCollectionId((current) => ({
      ...current,
      [collectionId]: true
    }));
    setOversightErrorByCollectionId((current) => ({
      ...current,
      [collectionId]: null
    }));

    try {
      const response = await fetch(`/collections/${collectionId}/oversight`);
      const payload = await parseManageJsonResponse<CollectionOversightResponse>(
        response,
        'Collection oversight'
      );
      setOversightByCollectionId((current) => ({
        ...current,
        [collectionId]: payload
      }));
    } catch (loadError) {
      setOversightErrorByCollectionId((current) => ({
        ...current,
        [collectionId]: toManageApiErrorMessage(
          loadError,
          'Unable to load oversight details'
        )
      }));
    } finally {
      setOversightLoadingByCollectionId((current) => ({
        ...current,
        [collectionId]: false
      }));
    }
  };

  const callCollectionReadOnly = async (
    contract: CollectionContractTarget,
    functionName: string,
    functionArgs: ClarityValue[] = []
  ) => {
    const network = toStacksNetwork(contract.network);
    const senderAddress = walletSession.address ?? contract.address;
    const value = await callReadOnlyFunction({
      contractAddress: contract.address,
      contractName: contract.contractName,
      functionName,
      functionArgs,
      network,
      senderAddress
    });
    return unwrapResponse(value);
  };

  const loadCollectionMintSnapshot = async (
    collectionId: string,
    contract: CollectionContractTarget | null
  ) => {
    if (!contract) {
      setMintSnapshotByCollectionId((current) => ({
        ...current,
        [collectionId]: null
      }));
      setMintSnapshotErrorByCollectionId((current) => ({
        ...current,
        [collectionId]: 'Contract details are missing.'
      }));
      return;
    }

    setMintSnapshotLoadingByCollectionId((current) => ({
      ...current,
      [collectionId]: true
    }));
    setMintSnapshotErrorByCollectionId((current) => ({
      ...current,
      [collectionId]: null
    }));

    try {
      const [
        pausedCv,
        finalizedCv,
        mintPriceCv,
        maxSupplyCv,
        mintedCountCv,
        reservedCountCv,
        activePhaseCv
      ] = await Promise.all([
        callCollectionReadOnly(contract, 'is-paused'),
        callCollectionReadOnly(contract, 'get-finalized'),
        callCollectionReadOnly(contract, 'get-mint-price'),
        callCollectionReadOnly(contract, 'get-max-supply'),
        callCollectionReadOnly(contract, 'get-minted-count'),
        callCollectionReadOnly(contract, 'get-reserved-count'),
        callCollectionReadOnly(contract, 'get-active-phase')
      ]);

      const activePhaseId = parseUintCv(activePhaseCv);
      let activePhaseMintPriceMicroStx: bigint | null = null;
      if (activePhaseId !== null && activePhaseId > 0n) {
        const phaseCv = await callCollectionReadOnly(contract, 'get-phase', [
          uintCV(activePhaseId)
        ]);
        if (phaseCv.type === ClarityType.OptionalSome) {
          const tuple = phaseCv.value;
          if (tuple.type === ClarityType.Tuple) {
            const phasePriceCv = tuple.data['mint-price'];
            if (phasePriceCv) {
              activePhaseMintPriceMicroStx = parseUintCv(phasePriceCv);
            }
          }
        }
      }

      const pausedRaw = cvToValue(pausedCv) as unknown;
      const finalizedRaw = cvToValue(finalizedCv) as unknown;
      const mintPriceMicroStx = parseUintCv(mintPriceCv);
      const maxSupply = parseUintCv(maxSupplyCv);
      const mintedCount = parseUintCv(mintedCountCv);
      const reservedCount = parseUintCv(reservedCountCv);
      const remaining =
        maxSupply === null || mintedCount === null || reservedCount === null
          ? null
          : maxSupply - mintedCount - reservedCount;

      setMintSnapshotByCollectionId((current) => ({
        ...current,
        [collectionId]: {
          paused: typeof pausedRaw === 'boolean' ? pausedRaw : null,
          finalized: typeof finalizedRaw === 'boolean' ? finalizedRaw : null,
          mintPriceMicroStx,
          activePhaseId,
          activePhaseMintPriceMicroStx,
          maxSupply,
          mintedCount,
          reservedCount,
          remaining,
          refreshedAt: Date.now()
        }
      }));
    } catch (loadError) {
      setMintSnapshotErrorByCollectionId((current) => ({
        ...current,
        [collectionId]: toManageApiErrorMessage(
          loadError,
          'Unable to load on-chain mint status'
        )
      }));
    } finally {
      setMintSnapshotLoadingByCollectionId((current) => ({
        ...current,
        [collectionId]: false
      }));
    }
  };

  const setCollectionPublicVisibility = async (
    collection: CollectionRecord,
    visible: boolean
  ) => {
    if (!isPublishedCollectionState(collection.state)) {
      setPublicVisibilityMessageByCollectionId((current) => ({
        ...current,
        [collection.id]: 'Publish this collection first to manage public page visibility.'
      }));
      return;
    }
    let nextMetadata = mergeCollectionPublicVisibilityMetadata(
      collection.metadata ?? null,
      visible
    );
    if (visible) {
      nextMetadata = mergeCollectionPublicDisplayOrderMetadata(
        nextMetadata,
        publicVisiblePublishedCollections.length + 1
      );
    }

    setPublicVisibilitySavingByCollectionId((current) => ({
      ...current,
      [collection.id]: true
    }));
    setPublicVisibilityMessageByCollectionId((current) => ({
      ...current,
      [collection.id]: null
    }));

    try {
      const response = await fetch(`/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: nextMetadata })
      });
      const updated = await parseManageJsonResponse<CollectionRecord>(
        response,
        'Update public visibility'
      );
      setCollections((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      setPublicVisibilityMessageByCollectionId((current) => ({
        ...current,
        [collection.id]: visible
          ? 'Visible on public page.'
          : 'Hidden from public page.'
      }));
    } catch (updateError) {
      setPublicVisibilityMessageByCollectionId((current) => ({
        ...current,
        [collection.id]: toManageApiErrorMessage(
          updateError,
          'Unable to update public visibility'
        )
      }));
    } finally {
      setPublicVisibilitySavingByCollectionId((current) => ({
        ...current,
        [collection.id]: false
      }));
    }
  };

  const movePublicOrder = async (
    collectionId: string,
    direction: 'up' | 'down'
  ) => {
    const ordered = sortCollectionsForPublicPage(publicVisiblePublishedCollections);
    const currentIndex = ordered.findIndex((collection) => collection.id === collectionId);
    if (currentIndex === -1) {
      return;
    }
    const delta = direction === 'up' ? -1 : 1;
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }

    const reordered = [...ordered];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const nextOrderById = new Map<string, number>();
    reordered.forEach((collection, index) => {
      nextOrderById.set(collection.id, index + 1);
    });
    const changed = reordered.filter((collection) => {
      const nextOrder = nextOrderById.get(collection.id) ?? null;
      return (
        nextOrder !== null &&
        getCollectionPublicDisplayOrder(collection.metadata) !== nextOrder
      );
    });
    if (changed.length === 0) {
      return;
    }

    setPublicOrderPendingCollectionId(collectionId);
    setPublicVisibilityMessageByCollectionId((current) => ({
      ...current,
      [collectionId]: null
    }));

    try {
      const updatedById = new Map<string, CollectionRecord>();
      for (const collection of changed) {
        const nextOrder = nextOrderById.get(collection.id);
        if (!nextOrder) {
          continue;
        }
        const response = await fetch(`/collections/${collection.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: mergeCollectionPublicDisplayOrderMetadata(
              collection.metadata ?? null,
              nextOrder
            )
          })
        });
        const updated = await parseManageJsonResponse<CollectionRecord>(
          response,
          'Update public display order'
        );
        updatedById.set(updated.id, updated);
      }

      if (updatedById.size > 0) {
        setCollections((current) =>
          current.map((entry) => updatedById.get(entry.id) ?? entry)
        );
      }

      setPublicVisibilityMessageByCollectionId((current) => ({
        ...current,
        [collectionId]: `${moved.display_name ?? moved.slug} is now position ${
          targetIndex + 1
        } on the public page.`
      }));
    } catch (updateError) {
      setPublicVisibilityMessageByCollectionId((current) => ({
        ...current,
        [collectionId]: toManageApiErrorMessage(
          updateError,
          'Unable to update public page order.'
        )
      }));
    } finally {
      setPublicOrderPendingCollectionId(null);
    }
  };

  const toggleCollectionDetails = (
    collection: CollectionRecord,
    collectionOversight: CollectionOversightResponse | null
  ) => {
    const collectionId = collection.id;
    const nextExpanded = !Boolean(expandedByCollectionId[collectionId]);
    setExpandedByCollectionId((current) => ({
      ...current,
      [collectionId]: nextExpanded
    }));

    if (
      nextExpanded &&
      !oversightByCollectionId[collectionId] &&
      !oversightLoadingByCollectionId[collectionId]
    ) {
      void loadCollectionOversight(collectionId);
    }

    if (nextExpanded) {
      const target = resolveCollectionContractTarget(collection, collectionOversight);
      if (
        !mintSnapshotByCollectionId[collectionId] &&
        !mintSnapshotLoadingByCollectionId[collectionId]
      ) {
        void loadCollectionMintSnapshot(collectionId, target);
      }
    }
  };

  const refreshCollectionDetails = (
    collection: CollectionRecord,
    collectionOversight: CollectionOversightResponse | null
  ) => {
    const collectionId = collection.id;
    void loadCollectionOversight(collectionId);
    void loadCollectionMintSnapshot(
      collectionId,
      resolveCollectionContractTarget(collection, collectionOversight)
    );
  };

  if (error) {
    return <div className="alert">{error}</div>;
  }

  return (
    <div className="collection-list collection-list--oversight">
      <div className="meta-grid">
        <div>
          <span className="meta-label">Allowlisted artists</span>
          <span className="meta-value">{allowlistedArtistAddresses.size}</span>
        </div>
        <div>
          <span className="meta-label">Artists with drops</span>
          <span className="meta-value">{groupedCollections.length}</span>
        </div>
        <div>
          <span className="meta-label">Drops tracked</span>
          <span className="meta-value">{filteredCollections.length}</span>
        </div>
        <div>
          <span className="meta-label">Visible on public page</span>
          <span className="meta-value">{publicVisibleCount}</span>
        </div>
        <div>
          <span className="meta-label">State mix</span>
          <span className="meta-value">{stateSummary || 'No drops yet'}</span>
        </div>
      </div>
      <p className="collection-list__summary">
        Source: {runtimeAllowlistSource ? `${runtimeAllowlistSource} + build` : 'build allowlist'}
      </p>
      {bnsResolutionPending && (
        <p className="collection-list__summary">Resolving .btc allowlist names...</p>
      )}
      <div className="collection-list__group">
        <div className="collection-list__group-header">
          <h3 className="collection-list__group-title">Public page curation</h3>
          <span className="badge badge--neutral">
            {publicVisiblePublishedCollections.length} visible
          </span>
        </div>
        <p className="collection-list__summary">
          Only Xtrata admin can choose which published drops appear on the public
          page and set their display order.
        </p>
        {publishedCollections.length === 0 ? (
          <p className="collection-list__summary">
            No published collections are ready for public curation yet.
          </p>
        ) : (
          curatedPublishedCollections.map((collection) => {
            const isPublicVisible = isCollectionVisibleOnPublicPage(collection.metadata);
            const visibilitySaving = Boolean(
              publicVisibilitySavingByCollectionId[collection.id]
            );
            const visibilityMessage =
              publicVisibilityMessageByCollectionId[collection.id] ?? null;
            const orderedIndex = publicVisiblePublishedCollections.findIndex(
              (entry) => entry.id === collection.id
            );

            return (
              <div
                key={`public-curation-${collection.id}`}
                className="collection-list__item collection-list__item--compact"
              >
                <div className="collection-list__compact-row">
                  <div className="collection-list__compact-main">
                    <strong>
                      {isPublicVisible && orderedIndex >= 0
                        ? `${orderedIndex + 1}. `
                        : ''}
                      {collection.display_name ?? collection.slug}
                    </strong>
                    <p className="collection-list__compact-meta">
                      {collection.slug} ·{' '}
                      <AddressLabel
                        address={collection.artist_address}
                        network={walletSession.network}
                        showAddressWhenNamed
                      />{' '}
                      · {isPublicVisible ? 'Visible on public page' : 'Hidden from public page'}
                    </p>
                    {visibilityMessage && (
                      <p className="collection-list__summary">{visibilityMessage}</p>
                    )}
                  </div>
                  <div className="mint-actions">
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() =>
                        void setCollectionPublicVisibility(
                          collection,
                          !isPublicVisible
                        )
                      }
                      disabled={visibilitySaving || publicOrderPendingCollectionId !== null}
                    >
                      {visibilitySaving
                        ? 'Saving...'
                        : isPublicVisible
                          ? 'Hide'
                          : 'Show'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => void movePublicOrder(collection.id, 'up')}
                      disabled={
                        !isPublicVisible ||
                        visibilitySaving ||
                        publicOrderPendingCollectionId !== null ||
                        orderedIndex <= 0
                      }
                    >
                      Up
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => void movePublicOrder(collection.id, 'down')}
                      disabled={
                        !isPublicVisible ||
                        visibilitySaving ||
                        publicOrderPendingCollectionId !== null ||
                        orderedIndex === -1 ||
                        orderedIndex === publicVisiblePublishedCollections.length - 1
                      }
                    >
                      Down
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {isLoadingCollections && <p>Loading allowlisted artist activity...</p>}
      {!isLoadingCollections && filteredCollections.length === 0 && (
        <p>No collections found yet for other allowlisted artists.</p>
      )}

      {groupedCollections.map(([artistAddress, artistCollections]) => {
        const publishedCollections = artistCollections.filter((collection) =>
          isPublishedCollectionState(collection.state)
        );
        const draftCollections = artistCollections.filter(
          (collection) => !isPublishedCollectionState(collection.state)
        );
        const archivedCollectionsCount = draftCollections.filter(
          (collection) => collection.state.trim().toLowerCase() === 'archived'
        ).length;
        const draftsVisible = Boolean(showDraftsByArtistAddress[artistAddress]);
        const visibleArtistCollections = [
          ...publishedCollections,
          ...draftCollections.filter(
            (collection) => draftsVisible || Boolean(expandedByCollectionId[collection.id])
          )
        ];

        return (
          <article className="collection-list__group" key={artistAddress}>
            <div className="collection-list__group-header">
              <p className="collection-list__group-title">
                <AddressLabel
                  address={artistAddress}
                  network={walletSession.network}
                  showAddressWhenNamed
                />
              </p>
              <span className="badge badge--neutral">
                {artistCollections.length} drop
                {artistCollections.length === 1 ? '' : 's'}
              </span>
            </div>

            {draftCollections.length > 0 && (
              <div className="collection-list__draft-summary">
                <p className="collection-list__summary">
                  Unpublished activity: {draftCollections.length} attempt
                  {draftCollections.length === 1 ? '' : 's'}{' '}
                  {archivedCollectionsCount > 0
                    ? `(includes ${archivedCollectionsCount} removed). `
                    : ''}
                  {draftsVisible ? 'shown.' : 'hidden by default.'}
                </p>
                <div className="mint-actions">
                  <button
                    className="button button--ghost button--mini"
                    type="button"
                    onClick={() =>
                      setShowDraftsByArtistAddress((current) => ({
                        ...current,
                        [artistAddress]: !draftsVisible
                      }))
                    }
                  >
                    {draftsVisible ? 'Hide drafts' : 'Show drafts'}
                  </button>
                </div>
              </div>
            )}

            {visibleArtistCollections.map((collection) => {
            const collectionOversight = oversightByCollectionId[collection.id] ?? null;
            const detailError = oversightErrorByCollectionId[collection.id] ?? null;
            const detailLoading = Boolean(oversightLoadingByCollectionId[collection.id]);
            const detailOpen = Boolean(expandedByCollectionId[collection.id]);
            const mintSnapshot = mintSnapshotByCollectionId[collection.id] ?? null;
            const mintSnapshotLoading = Boolean(
              mintSnapshotLoadingByCollectionId[collection.id]
            );
            const mintSnapshotError = mintSnapshotErrorByCollectionId[collection.id] ?? null;
            const collectionContractTarget = resolveCollectionContractTarget(
              collection,
              collectionOversight
            );
            const livePagePath = getLivePagePath(collection);
            const isPublished = isPublishedCollectionState(collection.state);
            const isMintLiveOnChain =
              mintSnapshot === null
                ? true
                : mintSnapshot.paused !== true && mintSnapshot.finalized !== true;
            const showLiveMintPageLink =
              Boolean(livePagePath) &&
              isPublished &&
              Boolean(collectionContractTarget) &&
              isMintLiveOnChain;
            const liveMintPageAvailabilityLabel = !isPublished
              ? 'Unavailable until the collection is published and live.'
              : !collectionContractTarget
                ? 'Unavailable until contract deployment is confirmed.'
                : !isMintLiveOnChain
                  ? 'Unavailable while contract is paused or finalized.'
                  : 'Unavailable';
            const isPublicVisible = isCollectionVisibleOnPublicPage(collection.metadata);
            const deployTxId = collectionOversight?.deploy.txId ?? null;
            const deployTxUrl = deployTxId
              ? buildExplorerTxUrl(deployTxId, walletSession.network ?? null)
              : null;
            const contractName = collectionOversight?.deploy.contractName ?? null;
            const contractAddress = collectionOversight?.collection.contractAddress ?? null;
            const contractId =
              contractAddress && contractName
                ? `${contractAddress}.${contractName}`
                : null;
            const contractUrl = contractId
              ? buildExplorerAddressUrl(contractId, walletSession.network ?? null)
              : null;
            const maxSupply = mintSnapshot?.maxSupply ?? null;
            const mintedCount = mintSnapshot?.mintedCount ?? null;
            const reservedCount = mintSnapshot?.reservedCount ?? null;
            const remainingCount = mintSnapshot?.remaining ?? null;
            const pausedLabel =
              mintSnapshot?.paused === null || mintSnapshot?.paused === undefined
                ? 'Unknown'
                : mintSnapshot.paused
                  ? 'Yes'
                  : 'No';
            const finalizedLabel =
              mintSnapshot?.finalized === null || mintSnapshot?.finalized === undefined
                ? 'Unknown'
                : mintSnapshot.finalized
                  ? 'Yes'
                  : 'No';
            const onChainMintPriceMicroStx =
              mintSnapshot?.activePhaseMintPriceMicroStx ??
              mintSnapshot?.mintPriceMicroStx ??
              null;
            const activeMintPriceLabel = toMicroStxLabel(onChainMintPriceMicroStx);
            const collectionSettings = collectionOversight?.settingsPreview.collection ?? null;
            const collectionName =
              toStringOrNull(collectionSettings?.name) ??
              collectionOversight?.collection.displayName ??
              collection.display_name ??
              'Unknown';
            const symbol = toStringOrNull(collectionSettings?.symbol) ?? 'Unknown';
            const supply = toNumberOrNull(collectionSettings?.supply);
            const draftMintPriceMicroStx = toBigIntOrNull(
              collectionSettings?.mintPriceMicroStx
            );
            const draftMintPriceLabel =
              draftMintPriceMicroStx !== null
                ? toMicroStxLabel(draftMintPriceMicroStx)
                : (() => {
                    const mintPriceStx = toStringOrNull(collectionSettings?.mintPriceStx);
                    return mintPriceStx ? `${mintPriceStx} STX` : null;
                  })();
            const mintPriceDrift =
              onChainMintPriceMicroStx !== null &&
              draftMintPriceMicroStx !== null &&
              onChainMintPriceMicroStx !== draftMintPriceMicroStx;
            const artistRecipient = toStringOrNull(
              collectionOversight?.settingsPreview.hardcodedDefaults?.recipients &&
                (
                  collectionOversight.settingsPreview.hardcodedDefaults
                    .recipients as Record<string, unknown>
                ).artist
            );
            const marketplaceRecipient = toStringOrNull(
              collectionOversight?.settingsPreview.hardcodedDefaults?.recipients &&
                (
                  collectionOversight.settingsPreview.hardcodedDefaults
                    .recipients as Record<string, unknown>
                ).marketplace
            );
            const operatorRecipient = toStringOrNull(
              collectionOversight?.settingsPreview.hardcodedDefaults?.recipients &&
                (
                  collectionOversight.settingsPreview.hardcodedDefaults
                    .recipients as Record<string, unknown>
                ).operator
            );
            const formattedState = formatStateLabel(collection.state);
            const displayName = collection.display_name ?? collection.slug;
            const showCompactUnpublishedRow = !isPublished && !detailOpen;
            const publicVisibilityLabel = isPublished
              ? isPublicVisible
                ? 'Visible'
                : 'Hidden'
              : 'Unavailable until published';

            return (
              <div
                key={collection.id}
                className={`collection-list__item${showCompactUnpublishedRow ? ' collection-list__item--compact' : ''}`}
              >
                {showCompactUnpublishedRow ? (
                  <div className="collection-list__compact-row">
                    <div className="collection-list__compact-main">
                      <strong>{displayName}</strong>
                      <p className="collection-list__compact-meta">
                        {collection.slug} · {formattedState} · ID <code>{collection.id}</code>
                      </p>
                    </div>
                    <div className="mint-actions">
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() => void copyCollectionId(collection.id)}
                      >
                        {copiedCollectionId === collection.id ? 'Copied' : 'Copy ID'}
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() =>
                          toggleCollectionDetails(collection, collectionOversight)
                        }
                      >
                        Expand
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{displayName}</strong>
                    <p>
                      {collection.slug} · {formattedState}
                    </p>
                    <p className="meta-value">
                      Collection ID: <code>{collection.id}</code>
                    </p>
                    <div className="mint-actions">
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() => void copyCollectionId(collection.id)}
                      >
                        {copiedCollectionId === collection.id ? 'Copied' : 'Copy ID'}
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() =>
                          toggleCollectionDetails(collection, collectionOversight)
                        }
                      >
                        {detailOpen ? 'Hide full oversight' : 'Show full oversight'}
                      </button>
                      {showLiveMintPageLink && livePagePath && (
                        <a
                          className="button button--ghost button--mini"
                          href={livePagePath}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open live mint page
                        </a>
                      )}
                      {isPublished ? (
                        <span className="meta-value">
                          Public page curation lives in the owner-only list above.
                        </span>
                      ) : (
                        <span className="meta-value">
                          Publish first to enable public visibility.
                        </span>
                      )}
                      {detailOpen && (
                        <button
                          className="button button--ghost button--mini"
                          type="button"
                          onClick={() =>
                            refreshCollectionDetails(collection, collectionOversight)
                          }
                          disabled={detailLoading}
                        >
                          {detailLoading ? 'Refreshing...' : 'Refresh details'}
                        </button>
                      )}
                    </div>
                    <p className="meta-value">
                      Contract owner:{' '}
                      {collection.contract_address ? (
                        <AddressLabel
                          address={collection.contract_address}
                          network={walletSession.network}
                          showAddressWhenNamed
                        />
                      ) : (
                        'contract pending'
                      )}
                    </p>
                  </>
                )}

                {detailOpen && (
                  <div className="collection-list__details">
                    {detailLoading && <p className="meta-value">Loading oversight details...</p>}
                    {detailError && <div className="alert">{detailError}</div>}
                    {collectionOversight && !detailLoading && (
                      <>
                        <div className="collection-list__details-grid">
                          <div>
                            <span className="meta-label">Public page visibility</span>
                            <span className="meta-value">
                              {publicVisibilityLabel}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Live mint page</span>
                            <span className="meta-value">
                              {showLiveMintPageLink && livePagePath ? (
                                <a href={livePagePath} target="_blank" rel="noreferrer">
                                  {livePagePath}
                                </a>
                              ) : (
                                liveMintPageAvailabilityLabel
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">On-chain minted / max</span>
                            <span className="meta-value">
                              {formatCount(mintedCount)} / {formatCount(maxSupply)}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">On-chain reserved</span>
                            <span className="meta-value">{formatCount(reservedCount)}</span>
                          </div>
                          <div>
                            <span className="meta-label">On-chain remaining</span>
                            <span className="meta-value">{formatCount(remainingCount)}</span>
                          </div>
                          <div>
                            <span className="meta-label">Mint price</span>
                            <span className="meta-value">{activeMintPriceLabel}</span>
                          </div>
                          <div>
                            <span className="meta-label">On-chain paused</span>
                            <span className="meta-value">{pausedLabel}</span>
                          </div>
                          <div>
                            <span className="meta-label">On-chain finalized</span>
                            <span className="meta-value">{finalizedLabel}</span>
                          </div>
                          <div>
                            <span className="meta-label">Collection name</span>
                            <span className="meta-value">{collectionName}</span>
                          </div>
                          <div>
                            <span className="meta-label">Mint type</span>
                            <span className="meta-value">
                              {collectionOversight.settingsPreview.mintType ?? 'Unknown'}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Template</span>
                            <span className="meta-value">
                              {collectionOversight.settingsPreview.templateVersion ?? 'Unknown'}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Symbol</span>
                            <span className="meta-value">{symbol}</span>
                          </div>
                          <div>
                            <span className="meta-label">Supply</span>
                            <span className="meta-value">
                              {supply === null ? 'Unknown' : supply.toLocaleString()}
                            </span>
                          </div>
                          {mintPriceDrift && (
                            <div>
                              <span className="meta-label">Draft template price</span>
                              <span className="meta-value">
                                {draftMintPriceLabel ?? 'Unknown'}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="meta-label">Created</span>
                            <span className="meta-value">
                              {formatDateTime(collectionOversight.collection.createdAt)}
                            </span>
                          </div>
                          <div>
                            <span className="meta-label">Updated</span>
                            <span className="meta-value">
                              {formatDateTime(collectionOversight.collection.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <div className="collection-list__details-grid">
                          <div className="collection-list__details-card">
                            <span className="meta-label">Deployment</span>
                            <p className="meta-value">
                              TX:{' '}
                              {deployTxUrl ? (
                                <a
                                  href={deployTxUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open in Hiro Explorer
                                </a>
                              ) : (
                                'not recorded'
                              )}
                            </p>
                            <p className="meta-value">
                              Contract:{' '}
                              {contractUrl && contractId ? (
                                <a
                                  href={contractUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {contractId}
                                </a>
                              ) : (
                                'pending'
                              )}
                            </p>
                            <p className="meta-value">
                              Deployed:{' '}
                              {formatDateTime(collectionOversight.deploy.deployedAt)}
                            </p>
                            <p className="meta-value">
                              Core target:{' '}
                              {collectionOversight.deploy.coreContractId ?? 'Unknown'}
                            </p>
                            {mintSnapshot && (
                              <p className="meta-value">
                                Status refreshed:{' '}
                                {new Date(mintSnapshot.refreshedAt).toLocaleTimeString()}
                              </p>
                            )}
                            {mintSnapshotLoading && (
                              <p className="meta-value">Refreshing on-chain mint status...</p>
                            )}
                            {mintSnapshotError && (
                              <p className="meta-value">Mint status error: {mintSnapshotError}</p>
                            )}
                            {mintPriceDrift && (
                              <p className="meta-value">
                                Draft metadata price is stale. Contract price above is the live mint
                                price.
                              </p>
                            )}
                            {!collectionContractTarget && (
                              <p className="meta-value">
                                Contract target is incomplete, so on-chain mint status is unavailable.
                              </p>
                            )}
                          </div>

                          <div className="collection-list__details-card">
                            <span className="meta-label">DB assets</span>
                            <p className="meta-value">
                              Total: {collectionOversight.db.assets.total} · Active:{' '}
                              {collectionOversight.db.assets.active}
                            </p>
                            <p className="meta-value">
                              Bytes: {formatBytes(collectionOversight.db.assets.totalBytes)} · Active:{' '}
                              {formatBytes(collectionOversight.db.assets.activeBytes)}
                            </p>
                            <p className="meta-value">
                              Chunks: {collectionOversight.db.assets.totalChunks}
                            </p>
                            <p className="meta-value">
                              States: {summarizeStates(collectionOversight.db.assets.states)}
                            </p>
                          </div>

                          <div className="collection-list__details-card">
                            <span className="meta-label">Reservations</span>
                            <p className="meta-value">
                              Total: {collectionOversight.db.reservations.total}
                            </p>
                            <p className="meta-value">
                              States: {summarizeStates(collectionOversight.db.reservations.states)}
                            </p>
                          </div>

                          <div className="collection-list__details-card">
                            <span className="meta-label">Bucket ({collectionOversight.bucket.binding ?? 'none'})</span>
                            <p className="meta-value">
                              Prefix: <code>{collectionOversight.bucket.prefix}</code>
                            </p>
                            <p className="meta-value">
                              Objects: {collectionOversight.bucket.objectCount} · Bytes:{' '}
                              {formatBytes(collectionOversight.bucket.totalBytes)}
                            </p>
                            <p className="meta-value">
                              Full scan: {collectionOversight.bucket.scannedAll ? 'yes' : 'partial'}
                            </p>
                            {collectionOversight.bucket.error && (
                              <p className="meta-value">Bucket error: {collectionOversight.bucket.error}</p>
                            )}
                            {collectionOversight.bucket.sampleKeys.length > 0 && (
                              <p className="meta-value">
                                Sample keys: {collectionOversight.bucket.sampleKeys.length}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="collection-list__details-grid">
                          <div className="collection-list__details-card">
                            <span className="meta-label">Data consistency</span>
                            <p className="meta-value">
                              DB storage keys: {collectionOversight.db.storageKeysTracked}
                            </p>
                            <p className="meta-value">
                              DB keys missing in bucket:{' '}
                              {collectionOversight.consistency.dbKeysMissingInBucket}
                            </p>
                            <p className="meta-value">
                              Bucket keys missing in DB:{' '}
                              {collectionOversight.consistency.bucketKeysMissingInDb}
                            </p>
                            {collectionOversight.consistency.sampleDbKeysMissingInBucket.length > 0 && (
                              <p className="meta-value">
                                Missing DB key sample:{' '}
                                <code>
                                  {collectionOversight.consistency.sampleDbKeysMissingInBucket[0]}
                                </code>
                              </p>
                            )}
                            {collectionOversight.consistency.sampleBucketKeysMissingInDb.length > 0 && (
                              <p className="meta-value">
                                Missing bucket key sample:{' '}
                                <code>
                                  {collectionOversight.consistency.sampleBucketKeysMissingInDb[0]}
                                </code>
                              </p>
                            )}
                          </div>

                          <div className="collection-list__details-card">
                            <span className="meta-label">Recipients (template defaults)</span>
                            <p className="meta-value">
                              Artist:{' '}
                              <span className="address-value--full">
                                {artistRecipient ?? 'Unknown'}
                              </span>
                            </p>
                            <p className="meta-value">
                              Marketplace:{' '}
                              <span className="address-value--full">
                                {marketplaceRecipient ?? 'Unknown'}
                              </span>
                            </p>
                            <p className="meta-value">
                              Operator:{' '}
                              <span className="address-value--full">
                                {operatorRecipient ?? 'Unknown'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </article>
        );
      })}
    </div>
  );
}
