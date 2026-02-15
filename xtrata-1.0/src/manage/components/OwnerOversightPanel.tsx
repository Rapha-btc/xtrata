import { useEffect, useMemo, useState } from 'react';
import AddressLabel from '../../components/AddressLabel';
import {
  getArtistAllowlistBnsNames,
  getArtistAllowlistLiteralAddresses,
  parseArtistAllowlist,
  XTRATA_OWNER_ADDRESS
} from '../../config/manage';
import { resolveBnsAddress } from '../../lib/bns/resolver';
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

const normalizeAddress = (value: string) => value.trim().toUpperCase();

const formatStateLabel = (value: string) => {
  const cleaned = value.replace(/[-_]+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'draft';
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

          {artistCollections.map((collection) => (
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
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
