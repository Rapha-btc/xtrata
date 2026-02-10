import { useState } from 'react';

export default function PublishOpsPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Array<Record<string, unknown>>>([]);

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
    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload?.error ?? 'Publish failed');
      return;
    }
    setMessage('Collection published.');
  };

  const loadReservations = async () => {
    if (!collectionId) {
      return;
    }
    const response = await fetch(`/collections/${collectionId}/reserve`);
    if (response.ok) {
      const payload = await response.json();
      setReservations(payload);
    }
  };

  return (
    <div className="publish-ops-panel">
      <label className="field">
        <span className="field__label">Collection ID</span>
        <input className="input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} />
        <button className="button button--ghost" type="button" onClick={loadReservations}>
          Refresh reservations
        </button>
      </label>
      <div className="mint-actions">
        <button className="button" type="button" onClick={publishCollection}>
          Publish collection
        </button>
      </div>
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
