import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ADMIN_GUARD_CONTRACT } from '../config/admin';
import { getContractId } from '../lib/contract/config';
import { createXtrataClient } from '../lib/contract/client';
import { getApiBaseUrl } from '../lib/network/config';
import { isAdminAddressAllowed, getAdminAllowlist } from '../lib/admin/access';
import { createStacksWalletAdapter } from '../lib/wallet/adapter';
import { createWalletSessionStore } from '../lib/wallet/session';

type AdminGateProps = {
  children: ReactNode;
};

const walletSessionStore = createWalletSessionStore();

export default function AdminGate({ children }: AdminGateProps) {
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [ownerStatus, setOwnerStatus] = useState<string | null>(null);
  const [walletPending, setWalletPending] = useState(false);

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata Admin',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const adminClient = useMemo(
    () =>
      createXtrataClient({
        contract: ADMIN_GUARD_CONTRACT,
        apiBaseUrl: getApiBaseUrl(ADMIN_GUARD_CONTRACT.network)
      }),
    []
  );

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

  useEffect(() => {
    let active = true;
    setOwnerStatus('Loading contract owner...');
    adminClient
      .getAdmin(ADMIN_GUARD_CONTRACT.address)
      .then((owner) => {
        if (!active) {
          return;
        }
        setOwnerAddress(owner ?? null);
        setOwnerStatus(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setOwnerStatus(`Failed to load contract owner: ${message}`);
      });
    return () => {
      active = false;
    };
  }, [adminClient]);

  const handleConnectWallet = async () => {
    setWalletPending(true);
    const session = await walletAdapter.connect();
    setWalletSession(session);
    setWalletPending(false);
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    await walletAdapter.disconnect();
    setWalletSession(walletAdapter.getSession());
    setWalletPending(false);
  };

  const connectedAddress = walletSession.address ?? null;
  const allowlist = getAdminAllowlist();
  const isAllowed =
    connectedAddress && isAdminAddressAllowed(connectedAddress, ownerAddress);

  if (isAllowed) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <header className="app__header">
        <span className="eyebrow">Restricted access</span>
        <h1>Admin access required</h1>
        <p>
          Connect an approved wallet address to access the admin console.
        </p>
      </header>
      <main className="app__main">
        <section className="panel app-section">
          <div className="panel__header">
            <div>
              <h2>Admin gate</h2>
              <p>Only the contract owner or allowlisted addresses may enter.</p>
            </div>
            <div className="panel__actions">
              <span className="badge badge--neutral">
                {walletSession.isConnected ? 'Connected' : 'Disconnected'}
              </span>
              {walletSession.isConnected ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={handleDisconnectWallet}
                  disabled={walletPending}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={walletPending}
                >
                  Connect wallet
                </button>
              )}
            </div>
          </div>
          <div className="panel__body">
            <div className="meta-grid">
              <div>
                <span className="meta-label">Contract</span>
                <span className="meta-value">
                  {getContractId(ADMIN_GUARD_CONTRACT)}
                </span>
              </div>
              <div>
                <span className="meta-label">Contract owner</span>
                <span className="meta-value">
                  {ownerAddress ?? 'Unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Connected address</span>
                <span className="meta-value">
                  {connectedAddress ?? 'Not connected'}
                </span>
              </div>
              <div>
                <span className="meta-label">Allowlist</span>
                <span className="meta-value">
                  {allowlist.length > 0 ? allowlist.join(', ') : 'None'}
                </span>
              </div>
            </div>
            {ownerStatus && <div className="alert">{ownerStatus}</div>}
            {!walletSession.isConnected && (
              <div className="alert">
                Connect a wallet to check access.
              </div>
            )}
            {walletSession.isConnected && !isAllowed && (
              <div className="alert">
                This wallet is not approved for admin access.
              </div>
            )}
            <div className="mint-actions">
              <a className="button button--ghost" href="/">
                Go to public site
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
