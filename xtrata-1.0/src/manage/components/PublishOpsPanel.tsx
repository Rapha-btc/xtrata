import { useEffect, useMemo, useState } from 'react';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import InfoTooltip from './InfoTooltip';

type CollectionRecord = {
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

type ManagedAsset = {
  state?: string | null;
};

type PublishReadiness = {
  loading: boolean;
  contractConnected: boolean;
  mintType: 'standard' | 'pre-inscribed';
  activeAssets: number;
  supplyTarget: number;
  error: string | null;
};

const parsePositiveInt = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
};

export default function PublishOpsPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Array<Record<string, unknown>>>([]);
  const [readiness, setReadiness] = useState<PublishReadiness>({
    loading: false,
    contractConnected: false,
    mintType: 'standard',
    activeAssets: 0,
    supplyTarget: 0,
    error: null
  });

  const loadReadiness = async () => {
    if (!collectionId) {
      setReadiness({
        loading: false,
        contractConnected: false,
        mintType: 'standard',
        activeAssets: 0,
        supplyTarget: 0,
        error: null
      });
      return;
    }

    setReadiness((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [collectionResponse, assetsResponse] = await Promise.all([
        fetch(`/collections/${collectionId}`),
        fetch(`/collections/${collectionId}/assets`)
      ]);

      const collection = await parseManageJsonResponse<CollectionRecord>(
        collectionResponse,
        'Collection'
      );
      const assets = await parseManageJsonResponse<ManagedAsset[]>(
        assetsResponse,
        'Collection assets'
      );
      const metadata = collection.metadata ?? null;
      const mintTypeRaw =
        metadata && typeof metadata.mintType === 'string'
          ? metadata.mintType
          : 'standard';
      const mintType = mintTypeRaw === 'pre-inscribed' ? 'pre-inscribed' : 'standard';
      const supplyTarget = parsePositiveInt(
        metadata &&
          typeof metadata.collection === 'object' &&
          metadata.collection !== null
          ? (metadata.collection as Record<string, unknown>).supply
          : 0
      );

      const activeAssets = assets.filter((asset) => {
        const state = String(asset.state ?? '').toLowerCase();
        return state !== 'expired' && state !== 'sold-out';
      }).length;

      setReadiness({
        loading: false,
        contractConnected: !!collection.contract_address,
        mintType,
        activeAssets,
        supplyTarget,
        error: null
      });
    } catch (error) {
      setReadiness({
        loading: false,
        contractConnected: false,
        mintType: 'standard',
        activeAssets: 0,
        supplyTarget: 0,
        error: toManageApiErrorMessage(error, 'Unable to run publish checks.')
      });
    }
  };

  const publishCollection = async () => {
    if (!collectionId) {
      setMessage('Collection id required.');
      return;
    }
    const response = await fetch(`/collections/${collectionId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'published' })
    });
    try {
      await parseManageJsonResponse(response, 'Publish');
      setMessage('Collection published.');
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Publish failed'));
    }
  };

  const loadReservations = async () => {
    if (!collectionId) {
      return;
    }
    const response = await fetch(`/collections/${collectionId}/reserve`);
    try {
      const payload = await parseManageJsonResponse<Array<Record<string, unknown>>>(
        response,
        'Reservations'
      );
      setReservations(payload);
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Unable to refresh reservations.'));
    }
  };

  useEffect(() => {
    void loadReadiness();
  }, [collectionId]);

  const publishBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!collectionId) {
      blockers.push('Enter a collection ID first.');
      return blockers;
    }
    if (readiness.loading) {
      blockers.push('Checking readiness...');
      return blockers;
    }
    if (readiness.error) {
      blockers.push(readiness.error);
      return blockers;
    }
    if (!readiness.contractConnected) {
      blockers.push('Deploy the contract in Step 1 before publishing.');
    }
    if (readiness.mintType !== 'pre-inscribed' && readiness.activeAssets <= 0) {
      blockers.push('Upload at least one artwork file in Step 2 before publishing.');
    }
    return blockers;
  }, [collectionId, readiness]);

  const canPublish = publishBlockers.length === 0;

  return (
    <div className="publish-ops-panel">
      <label className="field">
        <span className="field__label info-label">
          Collection ID
          <InfoTooltip text="Use the same ID from 'Your drops' and Step 2 so you publish and monitor the correct collection." />
        </span>
        <input
          className="input"
          placeholder="Paste collection ID from Your drops"
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
        />
        <span className="field__hint">
          Refresh reservations to see pending buyer slots for this collection.
        </span>
        <button className="button button--ghost" type="button" onClick={() => void loadReservations()}>
          Refresh reservations
        </button>
      </label>
      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title">Publish readiness</p>
        <ul>
          <li>
            Contract deployed: {readiness.contractConnected ? 'Yes' : 'No'}
          </li>
          <li>
            Launch style: {readiness.mintType === 'pre-inscribed' ? 'Pre-inscribed' : 'Standard'}
          </li>
          <li>
            Active staged assets: {readiness.activeAssets}
            {readiness.supplyTarget > 0 ? ` (target supply: ${readiness.supplyTarget})` : ''}
          </li>
        </ul>
        <div className="mint-actions">
          <button className="button button--ghost button--mini" type="button" onClick={() => void loadReadiness()}>
            Re-check readiness
          </button>
        </div>
      </div>
      <div className="mint-actions">
        <button className="button" type="button" onClick={() => void publishCollection()} disabled={!canPublish}>
          Publish collection
        </button>
        <span className="field__hint">
          Publishing marks this drop as live in the manager backend.
        </span>
      </div>
      {publishBlockers.length > 0 && (
        <div className="alert">
          <div>
            <strong>Before publishing:</strong>
            <ul>
              {publishBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {message && <div className="alert">{message}</div>}
      {reservations.length > 0 && (
        <div>
          <h3>Pending reservations</h3>
          <ul>
            {reservations.map((reservation) => (
              <li key={String(reservation.reservation_id)}>
                {reservation.asset_id} · {reservation.status} · expires {new Date(Number(reservation.expires_at ?? 0)).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
