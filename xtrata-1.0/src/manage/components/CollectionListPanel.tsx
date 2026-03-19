import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';
import InfoTooltip from './InfoTooltip';

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

type CollectionReadiness = {
  ready: boolean;
  reason: string;
};

type CollectionListPanelProps = {
  activeCollectionId?: string;
  preferredCollectionId?: string;
  refreshKey?: number;
  onSelectCollection?: (collection: {
    id: string;
    label: string;
    deployed: boolean;
  }) => void;
};

const isArchived = (collection: CollectionRecord) =>
  collection.state.trim().toLowerCase() === 'archived';

const isPublished = (collection: CollectionRecord) =>
  collection.state.trim().toLowerCase() === 'published';

const getLifecycleLabel = (collection: CollectionRecord) => {
  const state = collection.state.trim().toLowerCase();
  const deployTxId =
    collection.metadata && typeof collection.metadata === 'object'
      ? String((collection.metadata as Record<string, unknown>).deployTxId ?? '').trim()
      : '';
  if (state === 'published') {
    return 'Live (locked)';
  }
  if (collection.contract_address && deployTxId) {
    return 'Deployed draft';
  }
  if (collection.contract_address) {
    return 'Contract submitted';
  }
  return 'Draft only';
};

export default function CollectionListPanel(props: CollectionListPanelProps) {
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [copiedCollectionId, setCopiedCollectionId] = useState<string | null>(null);
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const { walletSession } = useManageWallet();
  const connectedAddress = walletSession.address?.trim() ?? '';

  const loadCollections = useCallback(
    async (includeArchived: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const search = new URLSearchParams();
        if (connectedAddress) {
          search.set('artistAddress', connectedAddress);
        }
        if (includeArchived) {
          search.set('includeArchived', '1');
        }
        const query = search.toString().length > 0 ? `?${search.toString()}` : '';
        const response = await fetch(`/collections${query}`);
        const payload = await parseManageJsonResponse<CollectionRecord[]>(
          response,
          'Collections'
        );
        setCollections(payload);
      } catch (err) {
        setError(toManageApiErrorMessage(err, 'Unable to load collections'));
      } finally {
        setIsLoading(false);
      }
    },
    [connectedAddress]
  );

  useEffect(() => {
    void loadCollections(showArchived);
  }, [loadCollections, showArchived]);

  useEffect(() => {
    if (!props.refreshKey) {
      return;
    }
    void loadCollections(showArchived);
  }, [props.refreshKey, loadCollections, showArchived]);

  const archiveCollection = useCallback(
    async (collection: CollectionRecord) => {
      if (isPublished(collection)) {
        setError('Live collections stay visible in history and cannot be removed.');
        return;
      }

      setPendingCollectionId(collection.id);
      setError(null);
      setStatus(null);
      try {
        const readinessResponse = await fetch(
          `/collections/${collection.id}/readiness`,
          { cache: 'no-store' }
        );
        const readiness = await parseManageJsonResponse<CollectionReadiness>(
          readinessResponse,
          'Collection readiness'
        );

        if (readiness.ready) {
          setError(
            'This drop has a confirmed on-chain deployment and cannot be removed from the list.'
          );
          return;
        }

        const response = await fetch(`/collections/${collection.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'archived' })
        });
        const updated = await parseManageJsonResponse<CollectionRecord>(
          response,
          'Archive collection'
        );
        setCollections((current) =>
          current.map((item) => (item.id === updated.id ? updated : item))
        );
        setStatus(
          `${collection.display_name ?? collection.slug} moved to removed drafts.`
        );
      } catch (err) {
        setError(toManageApiErrorMessage(err, 'Unable to archive draft.'));
      } finally {
        setPendingCollectionId(null);
      }
    },
    []
  );

  const restoreCollection = useCallback(async (collection: CollectionRecord) => {
    setPendingCollectionId(collection.id);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'draft' })
      });
      const updated = await parseManageJsonResponse<CollectionRecord>(
        response,
        'Restore collection'
      );
      setCollections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setStatus(`${collection.display_name ?? collection.slug} restored to active drafts.`);
    } catch (err) {
      setError(toManageApiErrorMessage(err, 'Unable to restore draft.'));
    } finally {
      setPendingCollectionId(null);
    }
  }, []);

  const deleteCollection = useCallback(async (collection: CollectionRecord) => {
    setPendingCollectionId(collection.id);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/collections/${collection.id}`, {
        method: 'DELETE'
      });
      const payload = await parseManageJsonResponse<{
        removed?: {
          assets?: number;
          reservations?: number;
          bucketObjects?: number;
        };
      }>(response, 'Delete collection');
      setCollections((current) => current.filter((item) => item.id !== collection.id));
      const removedAssets = Number(payload.removed?.assets ?? 0);
      const removedObjects = Number(payload.removed?.bucketObjects ?? 0);
      setStatus(
        `Deleted ${collection.display_name ?? collection.slug}. Cleaned ${removedAssets} asset row${
          removedAssets === 1 ? '' : 's'
        } and ${removedObjects} object${removedObjects === 1 ? '' : 's'}.`
      );
    } catch (err) {
      setError(toManageApiErrorMessage(err, 'Unable to permanently delete draft.'));
    } finally {
      setPendingCollectionId(null);
    }
  }, []);

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

  const handleSelectCollection = useCallback(
    (collection: CollectionRecord) => {
      const deployTxId =
        collection.metadata && typeof collection.metadata === 'object'
          ? String((collection.metadata as Record<string, unknown>).deployTxId ?? '').trim()
          : '';
      const deployed = Boolean(collection.contract_address?.trim() && deployTxId);
      props.onSelectCollection?.({
        id: collection.id,
        label: collection.display_name ?? collection.slug,
        deployed
      });
    },
    [props.onSelectCollection]
  );

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    collection: CollectionRecord
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectCollection(collection);
    }
  };

  const activeCollections = useMemo(
    () => collections.filter((collection) => !isArchived(collection)),
    [collections]
  );
  const archivedCollections = useMemo(
    () => collections.filter((collection) => isArchived(collection)),
    [collections]
  );

  useEffect(() => {
    const preferredCollectionId = props.preferredCollectionId?.trim() ?? '';
    const activeCollectionId = props.activeCollectionId?.trim() ?? '';
    if (!preferredCollectionId || activeCollectionId) {
      return;
    }
    const preferredCollection = activeCollections.find(
      (collection) => collection.id === preferredCollectionId
    );
    if (!preferredCollection) {
      return;
    }
    handleSelectCollection(preferredCollection);
  }, [
    props.preferredCollectionId,
    props.activeCollectionId,
    activeCollections,
    handleSelectCollection
  ]);

  return (
    <div className="collection-list">
      <div className="mint-actions">
        <span className="info-label">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => {
              void loadCollections(showArchived);
            }}
            disabled={isLoading || pendingCollectionId !== null}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <InfoTooltip text="Reload the drop list for the connected wallet and current archive filter." />
        </span>
        <span className="info-label">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            disabled={isLoading || pendingCollectionId !== null}
          >
            {showArchived ? 'Hide removed drafts' : 'Show removed drafts'}
          </button>
          <InfoTooltip text="Show or hide drafts you removed from the active list." />
        </span>
      </div>

      <p className="meta-value">
        Showing {activeCollections.length} active drop
        {activeCollections.length === 1 ? '' : 's'} for{' '}
        <code>{connectedAddress || 'current wallet'}</code>
        {showArchived && ` · ${archivedCollections.length} removed`}
      </p>

      {status && <p className="meta-value">{status}</p>}
      {error && <div className="alert">{error}</div>}

      {activeCollections.length === 0 && !isLoading ? (
        <p>No active drops yet for this wallet. Create one in Step 1.</p>
      ) : (
        activeCollections.map((collection) => (
          <div
            key={collection.id}
            className={`collection-list__item${
              props.activeCollectionId === collection.id
                ? ' collection-list__item--active'
                : ''
            } collection-list__item--selectable`}
            role="button"
            tabIndex={0}
            aria-pressed={props.activeCollectionId === collection.id}
            onClick={() => handleSelectCollection(collection)}
            onKeyDown={(event) => handleCardKeyDown(event, collection)}
          >
            <strong>{collection.display_name ?? collection.slug}</strong>
            <p>
              {collection.slug} · {collection.state}
            </p>
            <p className="meta-value">
              <span className="info-label">
                Collection ID
                <InfoTooltip text="Unique manager identifier used across Step 2, Step 3, and Step 4." />
              </span>
              : <code>{collection.id}</code>
            </p>
            <p className="collection-list__status">
              <strong className="info-label">
                Lifecycle
                <InfoTooltip text="Draft-only means no deploy tx yet. Deployed draft means contract exists but drop is not published. Live means published." />
              </strong>
              : {getLifecycleLabel(collection)}
            </p>
            <div className="mint-actions">
              <span className="info-label">
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyCollectionId(collection.id);
                  }}
                  disabled={pendingCollectionId !== null}
                >
                  {copiedCollectionId === collection.id ? 'Copied' : 'Copy ID'}
                </button>
                <InfoTooltip text="Copy this drop ID to paste into other launch steps." />
              </span>
              {!isPublished(collection) && (
                <span className="info-label">
                  <button
                    className="button button--ghost button--mini"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void archiveCollection(collection);
                    }}
                    disabled={pendingCollectionId !== null}
                  >
                    {pendingCollectionId === collection.id
                      ? 'Removing...'
                      : 'Remove from list'}
                  </button>
                  <InfoTooltip text="Moves this draft to removed drafts. You can restore it later unless you permanently delete it." />
                </span>
              )}
            </div>
            <p>
              <span className="info-label">
                Contract
                <InfoTooltip text="On-chain deploy address once contract deployment has been broadcast and saved." />
              </span>
              : {collection.contract_address ?? 'contract pending'}
            </p>
          </div>
        ))
      )}

      {showArchived && (
        <>
          <p className="collection-list__summary">
            Removed drafts stay recoverable until you permanently delete them.
          </p>
          {archivedCollections.length === 0 ? (
            <p className="meta-value">No removed drafts.</p>
          ) : (
            archivedCollections.map((collection) => (
              <div
                key={collection.id}
                className={`collection-list__item${
                  props.activeCollectionId === collection.id
                    ? ' collection-list__item--active'
                    : ''
                } collection-list__item--selectable`}
                role="button"
                tabIndex={0}
                aria-pressed={props.activeCollectionId === collection.id}
                onClick={() => handleSelectCollection(collection)}
                onKeyDown={(event) => handleCardKeyDown(event, collection)}
              >
                <strong>{collection.display_name ?? collection.slug}</strong>
                <p>
                  {collection.slug} · {collection.state}
                </p>
                <p className="meta-value">
                  <span className="info-label">
                    Collection ID
                    <InfoTooltip text="Unique manager identifier used across Step 2, Step 3, and Step 4." />
                  </span>
                  : <code>{collection.id}</code>
                </p>
                <p className="collection-list__status">
                  <strong className="info-label">
                    Lifecycle
                    <InfoTooltip text="Archived drafts are hidden from active view until restored." />
                  </strong>
                  : {getLifecycleLabel(collection)}
                </p>
                <div className="mint-actions">
                  <span className="info-label">
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void restoreCollection(collection);
                      }}
                      disabled={pendingCollectionId !== null}
                    >
                      {pendingCollectionId === collection.id
                        ? 'Restoring...'
                        : 'Restore'}
                    </button>
                    <InfoTooltip text="Move this draft back to active drops." />
                  </span>
                  <span className="info-label">
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteCollection(collection);
                      }}
                      disabled={pendingCollectionId !== null}
                    >
                      {pendingCollectionId === collection.id
                        ? 'Deleting...'
                        : 'Delete permanently'}
                    </button>
                    <InfoTooltip text="Permanent cleanup of this archived draft and linked storage records. This cannot be undone." />
                  </span>
                </div>
                <p>
                  <span className="info-label">
                    Contract
                    <InfoTooltip text="On-chain deploy address once contract deployment has been broadcast and saved." />
                  </span>
                  : {collection.contract_address ?? 'contract pending'}
                </p>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
