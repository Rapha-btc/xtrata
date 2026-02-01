import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import { getContractId } from './lib/contract/config';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkMismatch } from './lib/network/guard';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import MintScreen from './screens/MintScreen';
import ViewerScreen from './screens/ViewerScreen';
import MyWalletScreen from './screens/MyWalletScreen';

const walletSessionStore = createWalletSessionStore();

const SECTION_KEYS = [
  'docs',
  'wallet-session',
  'mint',
  'collection-viewer',
  'my-wallet'
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const buildCollapsedState = (collapsed: boolean) =>
  SECTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = collapsed;
      return acc;
    },
    {} as Record<SectionKey, boolean>
  );

export default function PublicApp() {
  const contract = PUBLIC_CONTRACT;
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState(() =>
    buildCollapsedState(false)
  );
  const tabGuard = useActiveTabGuard();

  const queryClient = useQueryClient();
  const contractId = getContractId(contract);
  const mismatch = getNetworkMismatch(contract.network, walletSession.network);
  const readOnlySender = walletSession.address ?? contract.address;

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata Public',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const hasHiroApiKey =
    typeof __XSTRATA_HAS_HIRO_KEY__ !== 'undefined' &&
    __XSTRATA_HAS_HIRO_KEY__;
  const showRateLimitWarning = rateLimitWarning && !hasHiroApiKey;

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCollapseAll = () => {
    setCollapsedSections(buildCollapsedState(true));
  };

  const handleExpandAll = () => {
    setCollapsedSections(buildCollapsedState(false));
  };

  useEffect(() => {
    if (hasHiroApiKey) {
      return;
    }
    const handler = () => {
      setRateLimitWarning(true);
    };
    window.addEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    return () => {
      window.removeEventListener(RATE_LIMIT_WARNING_EVENT, handler);
    };
  }, [hasHiroApiKey]);

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

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

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line no-console
    console.log(`[mint] Seal submitted, txId=${payload.txId}`);
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="eyebrow">Data Inscription Portal</span>
        <h1>xtrata</h1>
        <p>View the collection, mint an inscription, and manage your wallet.</p>
      </header>
      <nav className="app__nav">
        <a className="button button--ghost app__nav-link" href="#docs">
          Docs
        </a>
        <a className="button button--ghost app__nav-link" href="#wallet-session">
          Wallet
        </a>
        <a className="button button--ghost app__nav-link" href="#mint">
          Mint
        </a>
        <a className="button button--ghost app__nav-link" href="#collection-viewer">
          Viewer
        </a>
        <a className="button button--ghost app__nav-link" href="#my-wallet">
          My wallet
        </a>
      </nav>
      {!tabGuard.isActive && (
        <div className="app__notice">
          <div className="alert">
            <div>
              <strong>Another xtrata tab is active.</strong> This tab is paused
              to avoid loading conflicts.
            </div>
            <button
              className="button"
              type="button"
              onClick={tabGuard.takeControl}
            >
              Make this tab active
            </button>
          </div>
        </div>
      )}
      <div className="app__controls">
        <div className="app__controls-group">
          <button
            className="button button--ghost"
            type="button"
            onClick={handleCollapseAll}
          >
            Collapse all
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={handleExpandAll}
          >
            Expand all
          </button>
        </div>
      </div>
      <main className="app__main">
        <section
          className={`panel app-section${collapsedSections.docs ? ' panel--collapsed' : ''}`}
          id="docs"
        >
          <div className="panel__header">
            <div>
              <h2>Docs</h2>
              <p>Quick links for protocol details, contracts, and releases.</p>
            </div>
            <div className="panel__actions">
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('docs')}
                aria-expanded={!collapsedSections.docs}
              >
                {collapsedSections.docs ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <div className="meta-grid">
              <div>
                <span className="meta-label">GitHub</span>
                <a
                  className="meta-value"
                  href="https://github.com/stxtrata/xtrata"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/stxtrata/xtrata
                </a>
              </div>
              <div>
                <span className="meta-label">Docs</span>
                <a
                  className="meta-value"
                  href="https://github.com/stxtrata/xtrata/tree/main/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  docs/
                </a>
              </div>
              <div>
                <span className="meta-label">README</span>
                <a
                  className="meta-value"
                  href="https://github.com/stxtrata/xtrata/blob/main/README.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  README.md
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`panel app-section${collapsedSections['wallet-session'] ? ' panel--collapsed' : ''}`}
          id="wallet-session"
        >
          <div className="panel__header">
            <div>
              <h2>Wallet</h2>
              <p>Connect a wallet to mint and manage your inscriptions.</p>
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
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('wallet-session')}
                aria-expanded={!collapsedSections['wallet-session']}
              >
                {collapsedSections['wallet-session'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <div className="meta-grid">
              <div>
                <span className="meta-label">Address</span>
                <span className="meta-value">
                  {walletSession.address ?? 'Not connected'}
                </span>
              </div>
              <div>
                <span className="meta-label">Wallet network</span>
                <span className="meta-value">
                  {walletSession.network ?? 'unknown'}
                </span>
              </div>
              <div>
                <span className="meta-label">Contract</span>
                <span className="meta-value">{contractId}</span>
              </div>
            </div>
            {mismatch && (
              <div className="alert">
                Wallet is on {mismatch.actual}. Switch to {mismatch.expected}{' '}
                to mint with this contract.
              </div>
            )}
            {showRateLimitWarning && (
              <div className="alert">
                <div>
                  <strong>Rate limit detected.</strong> No Hiro API key is
                  configured for the dev proxy. Set HIRO_API_KEY in .env.local
                  and restart the dev server.
                </div>
                <button
                  className="button button--ghost"
                  onClick={() => setRateLimitWarning(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </section>

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

        <ViewerScreen
          contract={contract}
          senderAddress={readOnlySender}
          focusKey={viewerFocusKey ?? undefined}
          collapsed={collapsedSections['collection-viewer']}
          onToggleCollapse={() => toggleSection('collection-viewer')}
          isActiveTab={tabGuard.isActive}
        />

        <MyWalletScreen
          contract={contract}
          walletSession={walletSession}
          senderAddress={readOnlySender}
          collapsed={collapsedSections['my-wallet']}
          onToggleCollapse={() => toggleSection('my-wallet')}
          isActiveTab={tabGuard.isActive}
        />
      </main>
    </div>
  );
}
