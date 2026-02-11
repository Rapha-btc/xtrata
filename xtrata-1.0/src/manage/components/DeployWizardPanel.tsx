import { useState } from 'react';
import { showContractDeploy } from '@stacks/connect';
import { toStacksNetwork } from '../../lib/network/stacks';
import { useManageWallet } from '../ManageWalletContext';
import source from '../../../contracts/clarinet/contracts/xtrata-collection-mint-v1.1.clar?raw';

type CollectionDraft = {
  id: string;
  slug: string;
  artist_address: string;
  display_name: string | null;
  state: string;
  contract_address: string | null;
};

export default function DeployWizardPanel() {
  const [slug, setSlug] = useState('');
  const [artistAddress, setArtistAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contractName, setContractName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionDraft | null>(null);
  const { walletSession, connect } = useManageWallet();

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    try {
      const response = await fetch('/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, artistAddress, displayName, contractAddress: null })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error ?? 'Creation failed');
      }
      const payload = await response.json();
      setCollection(payload);
      setStatus(`Collection created (${payload.id})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deploy error');
    }
  };

  const handleDeploy = async () => {
    if (!collection) {
      setStatus('Create a collection first.');
      return;
    }
    if (!walletSession.address) {
      await connect();
    }
    const contract = contractName.trim() || `xtrata-collection-${collection.slug}`;
    try {
      await showContractDeploy({
        contractAddress: walletSession.address!,
        contractName: contract,
        source,
        network: toStacksNetwork(walletSession.network ?? 'mainnet'),
        appDetails: {
          name: 'Xtrata Manage Deploy'
        },
        onFinish: async (payload) => {
          setStatus(`Deploy submitted: ${payload.txId}`);
          const patch = await fetch(`/collections/${collection.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractAddress: walletSession.address, contractName: contract })
          });
          if (patch.ok) {
            const updated = await patch.json();
            setCollection(updated);
          }
        },
        onCancel: () => setStatus('Deploy cancelled')
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deploy flow failed');
    }
  };

  return (
    <form className="deploy-wizard" onSubmit={handleCreate}>
      <label className="field">
        <span className="field__label">Slug</span>
        <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Artist address</span>
        <input className="input" value={artistAddress} onChange={(event) => setArtistAddress(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Display name</span>
        <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Contract name (optional)</span>
        <input className="input" value={contractName} onChange={(event) => setContractName(event.target.value)} />
      </label>
      <div className="mint-actions">
        <button className="button" type="submit">
          Create collection draft
        </button>
      </div>
      {collection && (
        <div className="mint-actions">
          <button className="button button--ghost" type="button" onClick={handleDeploy}>
            Deploy contract
          </button>
          <p className="meta-value">Contract address: {collection.contract_address ?? 'pending'}</p>
        </div>
      )}
      {status && <p className="meta-value">{status}</p>}
    </form>
  );
}
