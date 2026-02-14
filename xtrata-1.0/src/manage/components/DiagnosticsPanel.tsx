import { useState, type ChangeEvent } from 'react';
import { chunkCount, hexDigest } from '../lib/asset-utils';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';

type DbHealth = {
  collectionsCount: number;
  assetsCount: number;
  reservationsCount: number;
  timestamp: number;
};

export default function DiagnosticsPanel() {
  const [collectionId, setCollectionId] = useState('');
  const [dbStatus, setDbStatus] = useState<string | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [storageStatus, setStorageStatus] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [debugKey, setDebugKey] = useState<string | null>(null);

  const runDatabaseCheck = async () => {
    setDbLoading(true);
    setDbStatus('Checking database connectivity…');
    setDbHealth(null);
    try {
      const response = await fetch('/collections/health');
      const payload = await parseManageJsonResponse<DbHealth>(
        response,
        'Collections health'
      );
      setDbHealth(payload);
      setDbStatus('Database reachable');
    } catch (error) {
      setDbStatus(toManageApiErrorMessage(error, 'Database error'));
    } finally {
      setDbLoading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  const runStorageTest = async () => {
    if (!collectionId) {
      setStorageStatus('Collection id required for storage test.');
      return;
    }
    if (!selectedFile) {
      setStorageStatus('Select a file before running the storage test.');
      return;
    }
    setStorageLoading(true);
    setStorageStatus('Requesting upload URL…');
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
      setStorageStatus(`Storage test asset saved (${payload.asset_id})`);
      setDebugKey(token.key);
      setSelectedFile(null);
    } catch (error) {
      setStorageStatus(toManageApiErrorMessage(error, 'Storage test failed'));
    } finally {
      setStorageLoading(false);
    }
  };

  return (
    <div className="diagnostics-panel">
      <div className="meta-grid">
        <div>
          <span className="meta-label">Database health</span>
          <span className="meta-value">Ping the D1 connection via `/collections/health`.</span>
        </div>
        <div className="panel__actions">
          <button className="button button--ghost" type="button" onClick={runDatabaseCheck} disabled={dbLoading}>
            {dbLoading ? 'Checking…' : 'Check database'}
          </button>
        </div>
      </div>
      {dbStatus && <p className="meta-value">{dbStatus}</p>}
      {dbHealth && (
        <div className="meta-grid">
          <div>
            <span className="meta-label">collections</span>
            <span className="meta-value">{dbHealth.collectionsCount}</span>
          </div>
          <div>
            <span className="meta-label">assets</span>
            <span className="meta-value">{dbHealth.assetsCount}</span>
          </div>
          <div>
            <span className="meta-label">reservations</span>
            <span className="meta-value">{dbHealth.reservationsCount}</span>
          </div>
        </div>
      )}

      <label className="field">
        <span className="field__label">Collection ID</span>
        <input className="input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">File to upload for storage test</span>
        <input className="input" type="file" onChange={handleFileChange} />
      </label>
      <div className="mint-actions">
        <button className="button" type="button" onClick={runStorageTest} disabled={storageLoading}>
          {storageLoading ? 'Uploading…' : 'Upload test file'}
        </button>
      </div>
      {storageStatus && <p className="meta-value">{storageStatus}</p>}
      {debugKey && (
        <p className="meta-value">
          Last upload key: <code>{debugKey}</code>
        </p>
      )}
    </div>
  );
}
