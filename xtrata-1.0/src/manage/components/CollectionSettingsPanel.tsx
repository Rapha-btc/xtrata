import { useState } from 'react';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import InfoTooltip from './InfoTooltip';

export default function CollectionSettingsPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [artistAddress, setArtistAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [state, setState] = useState('draft');
  const [message, setMessage] = useState<string | null>(null);

  const loadCollection = async () => {
    if (!collectionId) {
      return;
    }
    try {
      const response = await fetch(`/collections/${collectionId}`);
      const payload = await parseManageJsonResponse<{
        display_name?: string | null;
        artist_address?: string | null;
        contract_address?: string | null;
        state?: string | null;
      }>(response, 'Collection');
      setDisplayName(payload.display_name ?? '');
      setArtistAddress(payload.artist_address ?? '');
      setContractAddress(payload.contract_address ?? '');
      setState(payload.state ?? 'draft');
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Unable to load collection'));
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
        body: JSON.stringify({ displayName, artistAddress, contractAddress })
      });
      await parseManageJsonResponse(response, 'Collection update');
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(toManageApiErrorMessage(error, 'Update error'));
    }
  };

  return (
    <div className="collection-settings-panel">
      <label className="field">
        <span className="field__label info-label">
          Collection ID
          <InfoTooltip text="Use the ID from 'Your drops' to load the exact draft you want to edit." />
        </span>
        <input
          className="input"
          placeholder="Paste collection ID from Your drops"
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
        />
        <button className="button button--ghost" type="button" onClick={loadCollection}>
          Load
        </button>
      </label>
      <label className="field">
        <span className="field__label info-label">
          Display name
          <InfoTooltip text="Public-facing name shown in manager listings. This does not redeploy the contract." />
        </span>
        <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label info-label">
          Artist address
          <InfoTooltip text="Primary artist wallet tied to this draft. Keep this in sync with deploy wizard payout settings." />
        </span>
        <input
          className="input"
          value={artistAddress}
          onChange={(event) => setArtistAddress(event.target.value.trim().toUpperCase())}
        />
      </label>
      <label className="field">
        <span className="field__label info-label">
          Contract address
          <InfoTooltip text="Stacks address that deployed/owns the collection contract for this draft." />
        </span>
        <input className="input" value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label info-label">
          Contract state
          <InfoTooltip text="Read-only status from backend: draft means not live, published means live." />
        </span>
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
