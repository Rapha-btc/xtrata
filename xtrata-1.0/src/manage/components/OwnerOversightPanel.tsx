import { useEffect, useMemo, useState } from 'react';
import AddressLabel from '../../components/AddressLabel';
import {
  getArtistAllowlistBnsNames,
  getArtistAllowlistLiteralAddresses,
  parseArtistAllowlist,
  XTRATA_OWNER_ADDRESS
} from '../../config/manage';
import { resolveBnsAddress } from '../../lib/bns/resolver';
import type { NetworkType } from '../../lib/network/types';
import { useManageWallet } from '../ManageWalletContext';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';

type CollectionRecord = {
  id: string;
  slug: string;
  artist_address: string;
  contract_address: string | null;
  display_name: string | null;
  state: string;
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

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
        const response = await fetch('/collections', {
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

  const toggleCollectionDetails = (collectionId: string) => {
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
  };

  const refreshCollectionDetails = (collectionId: string) => {
    void loadCollectionOversight(collectionId);
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
      {isLoadingCollections && <p>Loading allowlisted artist activity...</p>}
      {!isLoadingCollections && filteredCollections.length === 0 && (
        <p>No collections found yet for other allowlisted artists.</p>
      )}

      {groupedCollections.map(([artistAddress, artistCollections]) => (
        <article className="collection-list__group" key={artistAddress}>
          <div className="collection-list__group-header">
            <p className="collection-list__group-title">
              <AddressLabel
                address={artistAddress}
                network={walletSession.network}
              />
            </p>
            <span className="badge badge--neutral">
              {artistCollections.length} drop
              {artistCollections.length === 1 ? '' : 's'}
            </span>
          </div>

          {artistCollections.map((collection) => {
            const collectionOversight = oversightByCollectionId[collection.id] ?? null;
            const detailError = oversightErrorByCollectionId[collection.id] ?? null;
            const detailLoading = Boolean(oversightLoadingByCollectionId[collection.id]);
            const detailOpen = Boolean(expandedByCollectionId[collection.id]);
            const deployTxId = collectionOversight?.deploy.txId ?? null;
            const deployTxUrl = deployTxId
              ? buildExplorerTxUrl(deployTxId, walletSession.network)
              : null;
            const contractName = collectionOversight?.deploy.contractName ?? null;
            const contractAddress = collectionOversight?.collection.contractAddress ?? null;
            const contractId =
              contractAddress && contractName
                ? `${contractAddress}.${contractName}`
                : null;
            const contractUrl = contractId
              ? buildExplorerAddressUrl(contractId, walletSession.network)
              : null;
            const collectionSettings = collectionOversight?.settingsPreview.collection ?? null;
            const collectionName =
              toStringOrNull(collectionSettings?.name) ??
              collectionOversight?.collection.displayName ??
              collection.display_name ??
              'Unknown';
            const symbol = toStringOrNull(collectionSettings?.symbol) ?? 'Unknown';
            const supply = toNumberOrNull(collectionSettings?.supply);
            const mintPriceStx =
              toStringOrNull(collectionSettings?.mintPriceStx) ??
              (() => {
                const micro = toNumberOrNull(collectionSettings?.mintPriceMicroStx);
                if (micro === null) {
                  return null;
                }
                return (micro / 1_000_000).toString();
              })();
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

            return (
              <div key={collection.id} className="collection-list__item">
                <strong>{collection.display_name ?? collection.slug}</strong>
                <p>
                  {collection.slug} · {formatStateLabel(collection.state)}
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
                    onClick={() => toggleCollectionDetails(collection.id)}
                  >
                    {detailOpen ? 'Hide full oversight' : 'Show full oversight'}
                  </button>
                  {detailOpen && (
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={() => refreshCollectionDetails(collection.id)}
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
                    />
                  ) : (
                    'contract pending'
                  )}
                </p>

                {detailOpen && (
                  <div className="collection-list__details">
                    {detailLoading && <p className="meta-value">Loading oversight details...</p>}
                    {detailError && <div className="alert">{detailError}</div>}
                    {collectionOversight && !detailLoading && (
                      <>
                        <div className="collection-list__details-grid">
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
                          <div>
                            <span className="meta-label">Mint price</span>
                            <span className="meta-value">
                              {mintPriceStx ? `${mintPriceStx} STX` : 'Unknown'}
                            </span>
                          </div>
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
      ))}
    </div>
  );
}
