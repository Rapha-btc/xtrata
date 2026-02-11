import { useState } from 'react';

export default function CollectionSettingsPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [state, setState] = useState('draft');
  const [message, setMessage] = useState<string | null>(null);

  const loadCollection = async () => {
    if (!collectionId) {
      return;
    }
    try {
      const response = await fetch(`/collections/${collectionId}`);
      if (!response.ok) {
        throw new Error('Not found');
      }
      const payload = await response.json();
      setDisplayName(payload.display_name ?? '');
      setContractAddress(payload.contract_address ?? '');
      setState(payload.state ?? 'draft');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load collection');
    }
  };

  const saveSettings = async () => {
    if (!collectionId) {
      setMessage('Set a collection id first.');
      return;
    }
    try {
      const response = await fetch(`/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, contractAddress })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error ?? 'Update failed');
      }
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update error');
    }
  };

  return (
    <div className="collection-settings-panel">
      <label className="field">
        <span className="field__label">Collection ID</span>
        <input className="input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} />
        <button className="button button--ghost" type="button" onClick={loadCollection}>
          Load
        </button>
      </label>
      <label className="field">
        <span className="field__label">Display name</span>
        <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Contract name</span>
        <input className="input" value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Contract state</span>
        <select className="select" value={state} onChange={(event) => setState(event.target.value)} disabled>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <div className="mint-actions">
        <button className="button" type="button" onClick={saveSettings}>
          Save settings
        </button>
      </div>
      {message && <div className="alert">{message}</div>}
    </div>
  );
}
