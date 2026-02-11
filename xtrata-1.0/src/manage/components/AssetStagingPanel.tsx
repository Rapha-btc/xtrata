import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { chunkCount, hexDigest } from '../lib/asset-utils';

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
      if (!response.ok) {
        throw new Error('Unable to load assets');
      }
      const payload = await response.json();
      setAssets(payload);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Load failed');
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
      const token = await tokenResponse.json();
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
      if (!metadataResponse.ok) {
        const payload = await metadataResponse.json();
        throw new Error(payload?.error ?? 'Meta sync failed');
      }
      const payload = await metadataResponse.json();
      setStatus(`Asset staged (${payload.asset_id})`);
      setSelectedFile(null);
      loadAssets();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload error');
    }
  };

  return (
    <div className="asset-staging-panel">
      <form className="field" onSubmit={handleSubmit}>
        <label className="field__label">
          <span>Collection ID</span>
          <input className="input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} />
        </label>
        <label className="field__label">
          <span>Select file</span>
          <input className="input" type="file" onChange={handleFileChange} />
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
