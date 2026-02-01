import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import { getContractId } from './lib/contract/config';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkMismatch } from './lib/network/guard';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import { truncateMiddle } from './lib/utils/format';
import MintScreen from './screens/MintScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';
import WalletLookupScreen from './screens/WalletLookupScreen';

const walletSessionStore = createWalletSessionStore();

const SECTION_KEYS = [
  'wallet-lookup',
  'wallet-session',
  'docs',
  'mint',
  'collection-viewer'
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
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupTouched, setWalletLookupTouched] = useState(false);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const initial = buildCollapsedState(false);
    initial['wallet-lookup'] = true;
    initial['wallet-session'] = true;
    return initial;
  });
  const tabGuard = useActiveTabGuard();

  const queryClient = useQueryClient();
  const contractId = getContractId(contract);
  const mismatch = getNetworkMismatch(contract.network, walletSession.network);
  const readOnlySender = walletSession.address ?? contract.address;
  const walletLookupState = useMemo(
    () => getWalletLookupState(walletLookupInput, walletSession.address ?? null),
    [walletLookupInput, walletSession.address]
  );

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

  const handleWalletLookupSearch = () => {
    setViewerMode('wallet');
    const anchor = document.getElementById('collection-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleClearWalletLookup = () => {
    setWalletLookupInput('');
    setWalletLookupTouched(false);
  };

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    setViewerMode('collection');
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
        <div className="app__header-row">
          <h1 className="app__title">
            XTRATA <span className="app__title-tag">- Data Inscription Portal</span>
          </h1>
          <div className="app__toolbar">
            <nav className="app__nav">
              <a className="button button--ghost app__nav-link" href="#wallet-lookup">
                Wallet lookup
              </a>
              <a className="button button--ghost app__nav-link" href="#wallet-session">
                Wallet
              </a>
              <a
                className="button button--ghost app__nav-link"
                href="#collection-viewer"
              >
                Viewer
              </a>
              <a className="button button--ghost app__nav-link" href="#mint">
                Mint
              </a>
              <a className="button button--ghost app__nav-link" href="#docs">
                Docs
              </a>
            </nav>
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
          </div>
        </div>
        <p>View the collection, mint an inscription, and manage your wallet.</p>
      </header>
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
      <main className="app__main">
        <div className="app__modules app__modules--compact">
          <WalletLookupScreen
            walletSession={walletSession}
            lookupState={walletLookupState}
            lookupTouched={walletLookupTouched}
            onLookupTouched={setWalletLookupTouched}
            onLookupInputChange={setWalletLookupInput}
            onSearch={handleWalletLookupSearch}
            collapsed={collapsedSections['wallet-lookup']}
            onToggleCollapse={() => toggleSection('wallet-lookup')}
          />

          <section
            className={`panel app-section panel--compact wallet-session-panel${collapsedSections['wallet-session'] ? ' panel--collapsed' : ''}`}
            id="wallet-session"
          >
            <div className="panel__header">
              <div>
                <h2>Wallet</h2>
                <span className="wallet-session__inline-address">
                  {walletSession.address
                    ? truncateMiddle(walletSession.address, 6, 6)
                    : 'Not connected'}
                </span>
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
        </div>

        <ViewerScreen
          contract={contract}
          senderAddress={readOnlySender}
          walletSession={walletSession}
          walletLookupState={walletLookupState}
          focusKey={viewerFocusKey ?? undefined}
          collapsed={collapsedSections['collection-viewer']}
          onToggleCollapse={() => toggleSection('collection-viewer')}
          isActiveTab={tabGuard.isActive}
          mode={viewerMode}
          onModeChange={setViewerMode}
          onClearWalletLookup={handleClearWalletLookup}
        />

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

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
      </main>
    </div>
  );
}
