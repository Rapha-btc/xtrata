import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { chunkCount, hexDigest } from '../lib/asset-utils';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import InfoTooltip from './InfoTooltip';

type ManagedAsset = {
  asset_id: string;
  path: string;
  filename: string | null;
  mime_type: string;
  total_bytes: number;
  total_chunks: number;
  expected_hash: string | null;
  state: string;
  created_at: number;
  expires_at?: number | null;
};

export default function AssetStagingPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAssets = async () => {
    if (!collectionId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/collections/${collectionId}/assets`);
      const payload = await parseManageJsonResponse<ManagedAsset[]>(
        response,
        'Collection assets'
      );
      setAssets(payload);
    } catch (error) {
      setStatus(toManageApiErrorMessage(error, 'Load failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [collectionId]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collectionId) {
      setStatus('Enter a collection id first.');
      return;
    }
    if (!selectedFile) {
      setStatus('Pick a file to stage');
      return;
    }
    setStatus('Requesting upload URL…');
    try {
      const tokenResponse = await fetch(`/collections/${collectionId}/upload-url`);
      const token = await parseManageJsonResponse<{ uploadUrl: string; key: string }>(
        tokenResponse,
        'Upload URL'
      );
      await fetch(token.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        body: selectedFile
      });
      const expectedHash = await hexDigest(selectedFile);
      const metadataResponse = await fetch(`/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.webkitRelativePath || selectedFile.name,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          totalBytes: selectedFile.size,
          totalChunks: chunkCount(selectedFile.size),
          expectedHash,
          storageKey: token.key
        })
      });
      const payload = await parseManageJsonResponse<{ asset_id: string }>(
        metadataResponse,
        'Asset metadata'
      );
      setStatus(`Asset staged (${payload.asset_id})`);
      setSelectedFile(null);
      void loadAssets();
    } catch (error) {
      setStatus(toManageApiErrorMessage(error, 'Upload error'));
    }
  };

  return (
    <div className="asset-staging-panel">
      <form className="field" onSubmit={handleSubmit}>
        <label className="field__label">
          <span className="info-label">
            Collection ID
            <InfoTooltip text="Use the ID shown in Step 1 under 'Your drops'. It identifies which drop these files belong to." />
          </span>
          <input
            className="input"
            placeholder="Paste collection ID from Your drops"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
          />
          <span className="field__hint">
            Tip: click "Copy ID" in Your drops, then paste it here.
          </span>
        </label>
        <label className="field__label">
          <span className="info-label">
            Select file
            <InfoTooltip text="Upload one artwork file at a time. The app records hash and chunk metadata automatically." />
          </span>
          <input className="input" type="file" onChange={handleFileChange} />
          <span className="field__hint">
            You can repeat this to build your staged asset list.
          </span>
        </label>
        <div className="mint-actions">
          <button className="button" type="submit" disabled={!selectedFile}>
            Upload to storage
          </button>
        </div>
      </form>
      {status && <p className="meta-value">{status}</p>}
      <div className="asset-staging__list">
        <h3>Staged assets</h3>
        {loading && <p>Loading…</p>}
        {!loading && assets.length === 0 && <p>No staged assets yet.</p>}
        <ul>
          {assets.map((asset) => (
            <li key={asset.asset_id}>
              <strong>{asset.filename ?? asset.path}</strong> · {Math.round(asset.total_bytes / 1024)} KB ·{' '}
              {asset.state}
              {asset.expires_at && (
                <>
                  {' '}
                  · expires {new Date(asset.expires_at).toLocaleString()}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
