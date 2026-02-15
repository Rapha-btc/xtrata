import { useEffect, useState } from 'react';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';

type CollectionRecord = {
  id: string;
  slug: string;
  artist_address: string;
  contract_address: string | null;
  display_name: string | null;
  state: string;
};

export default function CollectionListPanel() {
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedCollectionId, setCopiedCollectionId] = useState<string | null>(null);
  const { walletSession } = useManageWallet();
  const connectedAddress = walletSession.address?.trim() ?? '';

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const query = connectedAddress
          ? `?artistAddress=${encodeURIComponent(connectedAddress)}`
          : '';
        const response = await fetch(`/collections${query}`, {
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
      }
    };
    load();
    return () => controller.abort();
  }, [connectedAddress]);

  if (error) {
    return <div className="alert">{error}</div>;
  }

  if (collections.length === 0) {
    return (
      <p>
        No collections yet for this wallet. Create one in the deploy wizard.
      </p>
    );
  }

  const copyCollectionId = async (collectionId: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(collectionId);
        setCopiedCollectionId(collectionId);
        window.setTimeout(() => {
          setCopiedCollectionId((current) => (current === collectionId ? null : current));
        }, 1500);
      }
    } catch {
      setCopiedCollectionId(null);
    }
  };

  return (
    <div className="collection-list">
      <p className="meta-value">
        Showing {collections.length} drop{collections.length === 1 ? '' : 's'} for{' '}
        <code>{connectedAddress || 'current wallet'}</code>
      </p>
      {collections.map((collection) => (
        <div key={collection.id} className="collection-list__item">
          <strong>{collection.display_name ?? collection.slug}</strong>
          <p>{collection.slug} · {collection.state}</p>
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
          <p>{collection.contract_address ?? 'contract pending'}</p>
        </div>
      ))}
    </div>
  );
}
