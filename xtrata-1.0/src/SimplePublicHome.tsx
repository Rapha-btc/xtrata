import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PUBLIC_CONTRACT, PUBLIC_MINT_RESTRICTIONS } from './config/public';
import { getContractId } from './lib/contract/config';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkMismatch } from './lib/network/guard';
import { getStacksExplorerContractUrl } from './lib/network/explorer';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from './lib/theme/preferences';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import WalletTopBar from './components/WalletTopBar';
import MintScreen from './screens/MintScreen';
import ViewerScreen, { type ViewerMode } from './screens/ViewerScreen';

const walletSessionStore = createWalletSessionStore();

const WORKSPACE_PATH = '/workspace';

type HomeMode = 'creator' | 'protocol';

type StarterDoc = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

type LiveCollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  state: string;
  metadata?: Record<string, unknown> | null;
};

type LiveCollectionCard = {
  id: string;
  slug: string;
  name: string;
  symbol: string;
  description: string;
  livePath: string;
  coverImageUrl: string | null;
  supplyLabel: string;
};

const STARTER_DOCS: StarterDoc[] = [
  {
    title: 'How to inscribe on Xtrata',
    description: 'Plain-language walkthrough: begin, upload batches, then seal.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/xtrata-quickstart.md',
    cta: 'Read quickstart'
  },
  {
    title: 'Inscription handbook',
    description: 'Deeper technical guide for builders integrating reads and rendering.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/xtrata-inscription-handbook.md',
    cta: 'Open handbook'
  },
  {
    title: 'Artist collection launch guide',
    description: 'How artists launch collection mints and manage collection setup.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/artist-guides/collection-launch-guide.md',
    cta: 'Open artist guide'
  },
  {
    title: 'Collection template deploy guide',
    description:
      'Simplest path for artists to deploy a collection contract through the manage portal.',
    href: 'https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/artist-guides/collection-template-deploy-guide.md',
    cta: 'Open deploy guide'
  }
];

const HOME_MODE_CONTENT: Record<
  HomeMode,
  { tag: string; title: string; note: string; kicker: string }
> = {
  creator: {
    tag: 'Creator-first',
    title: 'Inscribe data on-chain in three clear steps',
    note: 'Start by browsing real inscriptions at the top, then mint below using the simplified flow.',
    kicker: 'Built for first-time creators and builders'
  },
  protocol: {
    tag: 'Protocol-first',
    title: 'Build on a verifiable on-chain data layer',
    note: 'Use this guided homepage for fast entry, then switch to Workspace for deeper controls and diagnostics.',
    kicker: 'Designed for builders integrating production flows'
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toMultilineText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

const isCollectionVisibleOnPublicPage = (metadata: unknown) => {
  const metadataRecord = toRecord(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  return toBoolean(collectionPage?.showOnPublicPage) === true;
};

const toBigIntOrNull = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

const formatBigintLabel = (value: bigint | null) =>
  value === null ? 'Unknown' : value.toString();

const resolveCollectionCoverUrl = (collection: LiveCollectionRecord) => {
  const metadata = toRecord(collection.metadata);
  const collectionPage = toRecord(metadata?.collectionPage);
  const coverImage = toRecord(collectionPage?.coverImage);
  const source = toText(coverImage?.source);
  const collectionId = toText(collection.id);
  if (source === 'collection-asset') {
    const assetId = toText(coverImage?.assetId);
    if (!collectionId || !assetId) {
      return null;
    }
    return `/collections/${encodeURIComponent(collectionId)}/asset-preview?assetId=${encodeURIComponent(assetId)}`;
  }
  if (source === 'inscribed-image-url') {
    const imageUrl = toText(coverImage?.imageUrl);
    if (imageUrl) {
      return imageUrl;
    }
  }
  return null;
};

const parseLiveCollectionsResponse = async (response: Response) => {
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Collections response is not JSON: ${text.slice(0, 120)}`);
    }
  }
  if (!response.ok) {
    const message =
      toText(toRecord(payload)?.error) || `Failed to load collections (${response.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error('Collections response is not an array.');
  }
  return payload as LiveCollectionRecord[];
};

export default function SimplePublicHome() {
  const contract = PUBLIC_CONTRACT;
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialTheme()
  );
  const [homeMode, setHomeMode] = useState<HomeMode>('creator');
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [walletPending, setWalletPending] = useState(false);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('collection');
  const [viewerCollapsed, setViewerCollapsed] = useState(false);
  const [mintCollapsed, setMintCollapsed] = useState(false);
  const [docsCollapsed, setDocsCollapsed] = useState(false);
  const [liveCollections, setLiveCollections] = useState<LiveCollectionRecord[]>([]);
  const [liveCollectionsLoading, setLiveCollectionsLoading] = useState(false);
  const [liveCollectionsError, setLiveCollectionsError] = useState<string | null>(null);
  const [liveCoverPreviewErrorByCollectionId, setLiveCoverPreviewErrorByCollectionId] = useState<
    Record<string, boolean>
  >({});
  const tabGuard = useActiveTabGuard();
  const queryClient = useQueryClient();

  const contractId = getContractId(contract);
  const contractExplorerUrl = useMemo(
    () => getStacksExplorerContractUrl(contractId, contract.network) ?? '#',
    [contractId, contract.network]
  );

  const walletLookupState = useMemo(
    () => getWalletLookupState('', walletSession.address ?? null),
    [walletSession.address]
  );
  const readOnlySender = walletSession.address ?? contract.address;
  const mismatch = getNetworkMismatch(contract.network, walletSession.network);
  const homeContent = HOME_MODE_CONTENT[homeMode];
  const liveCollectionCards = useMemo<LiveCollectionCard[]>(() => {
    return liveCollections
      .filter(
        (collection) =>
          String(collection.state ?? '')
            .trim()
            .toLowerCase() === 'published' &&
          isCollectionVisibleOnPublicPage(collection.metadata)
      )
      .map((collection) => {
        const metadata = toRecord(collection.metadata);
        const metadataCollection = toRecord(metadata?.collection);
        const metadataCollectionPage = toRecord(metadata?.collectionPage);
        const fallbackSupply = toBigIntOrNull(metadataCollection?.supply);
        const name =
          toText(metadataCollection?.name) ||
          toText(collection.display_name) ||
          toText(collection.slug) ||
          collection.id;
        const symbol = toText(metadataCollection?.symbol);
        const description =
          toMultilineText(metadataCollectionPage?.description) ||
          toMultilineText(metadataCollection?.description) ||
          'This collection is live and ready for minting.';
        const liveKey = toText(collection.slug) || collection.id;
        const livePath = `/collection/${encodeURIComponent(liveKey)}`;
        return {
          id: collection.id,
          slug: toText(collection.slug),
          name,
          symbol: symbol.length > 0 ? symbol : 'N/A',
          description,
          livePath,
          coverImageUrl: resolveCollectionCoverUrl(collection),
          supplyLabel: formatBigintLabel(fallbackSupply)
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [liveCollections]);

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

  useEffect(() => {
    setWalletSession(walletAdapter.getSession());
  }, [walletAdapter]);

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
    const controller = new AbortController();
    const loadLiveCollections = async () => {
      setLiveCollectionsLoading(true);
      setLiveCollectionsError(null);
      try {
        const response = await fetch('/collections?publishedOnly=1&publicVisibleOnly=1', {
          signal: controller.signal
        });
        const payload = await parseLiveCollectionsResponse(response);
        if (controller.signal.aborted) {
          return;
        }
        setLiveCollections(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to load live collections.';
        setLiveCollectionsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLiveCollectionsLoading(false);
        }
      }
    };

    void loadLiveCollections();

    return () => {
      controller.abort();
    };
  }, []);

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    applyThemeToDocument(nextTheme);
    writeThemePreference(nextTheme);
  };

  const handleConnectWallet = async () => {
    setWalletPending(true);
    try {
      const session = await walletAdapter.connect();
      setWalletSession(session);
    } finally {
      setWalletPending(false);
    }
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
      setWalletSession(walletAdapter.getSession());
    } finally {
      setWalletPending(false);
    }
  };

  const handleInscriptionSealed = (payload: { txId: string }) => {
    setViewerFocusKey((prev) => (prev ?? 0) + 1);
    setViewerMode('collection');
    queryClient.invalidateQueries({ queryKey: getViewerKey(contractId) });
    const anchor = document.getElementById('home-viewer');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line no-console
    console.log(`[mint] Seal submitted, txId=${payload.txId}`);
  };

  return (
    <div className={`app simple-home simple-home--${homeMode}`}>
      <header className="app__header">
        <section className="panel simple-home__hero" aria-label="Simplified homepage">
          <div className="simple-home__hero-main">
            <p className="simple-home__kicker">{homeContent.kicker}</p>
            <h1 className="app__title">
              XTRATA <span className="app__title-tag">{homeContent.tag}</span>
            </h1>
            <h2 className="simple-home__title">{homeContent.title}</h2>
            <p className="simple-home__note">{homeContent.note}</p>
            <div className="simple-home__actions">
              <a className="button" href="#mint">
                Start inscribing
              </a>
              <a className="button button--ghost" href="#starter-docs">
                Quick docs
              </a>
              <a className="button button--ghost" href={WORKSPACE_PATH}>
                Open Workspace
              </a>
            </div>
          </div>

          <div className="simple-home__tools">
            <div className="simple-home__mode-switch" role="group" aria-label="Homepage mode">
              <button
                className={`button button--ghost simple-home__mode-chip${homeMode === 'creator' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setHomeMode('creator')}
              >
                Creator-first
              </button>
              <button
                className={`button button--ghost simple-home__mode-chip${homeMode === 'protocol' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setHomeMode('protocol')}
              >
                Protocol-first
              </button>
            </div>
            <label className="theme-select" htmlFor="simple-home-theme-select">
              <span className="theme-select__label">Theme</span>
              <select
                id="simple-home-theme-select"
                className="theme-select__control"
                value={themeMode}
                onChange={handleThemeChange}
                onInput={handleThemeChange}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="simple-home__contract-meta">
              <span className="meta-label">Active contract</span>
              <a href={contractExplorerUrl} target="_blank" rel="noreferrer">
                {contractId}
              </a>
            </div>
          </div>
        </section>

        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
        />

        {mismatch && (
          <div className="alert simple-home__alert">
            Wallet is on {mismatch.actual}. Switch to {mismatch.expected} to mint with this
            contract.
          </div>
        )}

        {showRateLimitWarning && (
          <div className="alert simple-home__alert">
            <div>
              <strong>Rate limit detected.</strong> No Hiro API key is configured for the dev
              proxy. Set `HIRO_API_KEYS` (or `HIRO_API_KEY`) in `.env.local` and restart the dev
              server.
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setRateLimitWarning(false)}
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      {!tabGuard.isActive && (
        <div className="app__notice">
          <div className="alert">
            <div>
              <strong>Another xtrata tab is active.</strong> This tab is paused to avoid loading
              conflicts.
            </div>
            <button className="button" type="button" onClick={tabGuard.takeControl}>
              Make this tab active
            </button>
          </div>
        </div>
      )}

      <main className="app__main simple-home__main">
        <div id="home-viewer">
          <ViewerScreen
            contract={contract}
            senderAddress={readOnlySender}
            walletSession={walletSession}
            walletLookupState={walletLookupState}
            focusKey={viewerFocusKey ?? undefined}
            collapsed={viewerCollapsed}
            onToggleCollapse={() => setViewerCollapsed((prev) => !prev)}
            isActiveTab={tabGuard.isActive}
            mode={viewerMode}
            onModeChange={setViewerMode}
            modeLabels={{ collection: 'Explore', wallet: 'Wallet' }}
            viewerTitles={{ collection: 'Live inscription viewer', wallet: 'Wallet viewer' }}
          />
        </div>

        <section className="panel app-section simple-home__drops" id="live-drops">
          <div className="panel__header">
            <div>
              <h2>Live drops on homepage</h2>
              <p>
                This section shows artists how featured collections appear to visitors and how fast
                users can move from discovery to mint.
              </p>
            </div>
            <div className="panel__actions">
              <span className="badge badge--neutral">
                {liveCollectionsLoading ? 'Refreshing' : `${liveCollectionCards.length} live`}
              </span>
              <a className="button button--ghost" href="#mint">
                Mint from homepage
              </a>
            </div>
          </div>
          <div className="panel__body">
            {liveCollectionsError && <div className="alert">{liveCollectionsError}</div>}
            {!liveCollectionsError && liveCollectionsLoading && liveCollectionCards.length === 0 && (
              <p>Loading live drops...</p>
            )}
            {!liveCollectionsError &&
              !liveCollectionsLoading &&
              liveCollectionCards.length === 0 && (
                <p>No live drops are currently published to the public homepage.</p>
              )}
            {liveCollectionCards.length > 0 && (
              <div className="public-live-collections">
                {liveCollectionCards.map((collection) => {
                  const coverPreviewErrored = Boolean(
                    liveCoverPreviewErrorByCollectionId[collection.id]
                  );
                  return (
                    <article className="public-live-collections__card" key={collection.id}>
                      <div className="public-live-collections__media">
                        {collection.coverImageUrl && !coverPreviewErrored ? (
                          <img
                            src={collection.coverImageUrl}
                            alt={`${collection.name} cover`}
                            onLoad={() =>
                              setLiveCoverPreviewErrorByCollectionId((current) => ({
                                ...current,
                                [collection.id]: false
                              }))
                            }
                            onError={() =>
                              setLiveCoverPreviewErrorByCollectionId((current) => ({
                                ...current,
                                [collection.id]: true
                              }))
                            }
                          />
                        ) : (
                          <div className="public-live-collections__media-placeholder">
                            Collection cover image not set yet.
                          </div>
                        )}
                      </div>
                      <div className="public-live-collections__card-header">
                        <h3>{collection.name}</h3>
                        <span className="badge badge--neutral">{collection.symbol}</span>
                      </div>
                      <p className="public-live-collections__description">{collection.description}</p>
                      <div className="public-live-collections__summary">
                        <span className="public-live-collections__stat">
                          Supply: <strong>{collection.supplyLabel}</strong>
                        </span>
                        <span className="public-live-collections__stat">
                          State: <strong>Live</strong>
                        </span>
                      </div>
                      <div className="public-live-collections__card-meta">
                        <p className="meta-value">
                          Collection: <code>{collection.slug || collection.id}</code>
                        </p>
                      </div>
                      <div className="mint-actions">
                        <a className="button button--ghost button--mini" href={collection.livePath}>
                          Open collection page
                        </a>
                        <a className="button button--ghost button--mini" href="#mint">
                          Mint from homepage
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <MintScreen
          contract={contract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={mintCollapsed}
          onToggleCollapse={() => setMintCollapsed((prev) => !prev)}
          restrictions={PUBLIC_MINT_RESTRICTIONS}
        />

        <section
          className={`panel app-section simple-home__docs${docsCollapsed ? ' panel--collapsed' : ''}`}
          id="starter-docs"
        >
          <div className="panel__header">
            <div>
              <h2>Start here docs</h2>
              <p>Focused resources for first-time visitors and artist launches.</p>
            </div>
            <div className="panel__actions">
              <a className="button button--ghost" href={WORKSPACE_PATH}>
                Open Workspace
              </a>
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => setDocsCollapsed((prev) => !prev)}
                aria-expanded={!docsCollapsed}
              >
                {docsCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <div className="simple-home__docs-grid">
              {STARTER_DOCS.map((doc) => (
                <article className="simple-home__doc-card" key={doc.href}>
                  <h3>{doc.title}</h3>
                  <p>{doc.description}</p>
                  <a href={doc.href} target="_blank" rel="noreferrer">
                    {doc.cta}
                  </a>
                </article>
              ))}
            </div>

            <article className="simple-home__artist-access">
              <h3>Artist collection-mint access</h3>
              <p>
                Artist management actions are available in the `/manage` portal for approved
                wallets.
              </p>
              <ul>
                <li>Review the collection launch guide and template deploy guide first.</li>
                <li>Prepare the wallet addresses you want allowlisted for `/manage`.</li>
                <li>
                  Apply through official channels: <a href="https://x.com/XtrataLayers">@XtrataLayers</a>
                  {' '}or contact Jim.BTC (`@JimDotBTC`) for artist portal access.
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
