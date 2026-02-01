import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { showContractDeploy } from '@stacks/connect';
import { useQueryClient } from '@tanstack/react-query';
import { validateStacksAddress } from '@stacks/transactions';
import { getContractId } from './lib/contract/config';
import { CONTRACT_REGISTRY } from './lib/contract/registry';
import { createContractSelectionStore } from './lib/contract/selection';
import { RATE_LIMIT_WARNING_EVENT } from './lib/network/rate-limit';
import { getNetworkMismatch } from './lib/network/guard';
import { getViewerKey } from './lib/viewer/queries';
import { createStacksWalletAdapter } from './lib/wallet/adapter';
import { createWalletSessionStore } from './lib/wallet/session';
import { getWalletLookupState } from './lib/wallet/lookup';
import { useActiveTabGuard } from './lib/utils/tab-guard';
import MyWalletScreen from './screens/MyWalletScreen';
import MintScreen from './screens/MintScreen';
import ViewerScreen from './screens/ViewerScreen';
import ContractAdminScreen from './screens/ContractAdminScreen';
import WalletLookupScreen from './screens/WalletLookupScreen';

const contractSelectionStore = createContractSelectionStore(CONTRACT_REGISTRY);
const walletSessionStore = createWalletSessionStore();

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const SECTION_KEYS = [
  'wallet-lookup',
  'wallet-session',
  'active-contract',
  'deploy-contract',
  'contract-admin',
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

const normalizeContractName = (raw: string) => {
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/\./g, '-');
  return {
    normalized,
    changed: normalized !== trimmed,
    valid: CONTRACT_NAME_PATTERN.test(normalized)
  };
};

const parseDeployContractName = (raw: string) => {
  const trimmed = raw.trim();
  const warnings: string[] = [];
  if (!trimmed) {
    return { name: null, address: null, reason: 'empty', warnings };
  }

  let address: string | null = null;
  let nameInput = trimmed;
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    const candidateAddress = parts[0]?.trim();
    if (candidateAddress && validateStacksAddress(candidateAddress)) {
      address = candidateAddress;
      nameInput = parts.slice(1).join('.').trim();
      if (!nameInput) {
        return { name: null, address, reason: 'missing-name', warnings };
      }
    }
  }

  const normalized = normalizeContractName(nameInput);
  if (normalized.changed) {
    warnings.push(`Normalized contract name: ${nameInput} -> ${normalized.normalized}`);
  }
  if (address) {
    warnings.push('Address prefix ignored; deployment uses the connected wallet.');
  }
  if (!normalized.valid) {
    return {
      name: null,
      address,
      reason: 'invalid-name',
      warnings,
      normalizedName: normalized.normalized
    };
  }

  return {
    name: normalized.normalized,
    address,
    reason: normalized.changed ? 'normalized-name' : 'name-only',
    warnings,
    normalizedName: normalized.normalized
  };
};

export default function App() {
  const [selectedContract, setSelectedContract] = useState(() =>
    contractSelectionStore.load()
  );
  const [walletSession, setWalletSession] = useState(() =>
    walletSessionStore.load()
  );
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [deployName, setDeployName] = useState('');
  const [deploySource, setDeploySource] = useState('');
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployPending, setDeployPending] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [walletPending, setWalletPending] = useState(false);
  const [viewerFocusKey, setViewerFocusKey] = useState<number | null>(null);
  const [walletLookupInput, setWalletLookupInput] = useState('');
  const [walletLookupTouched, setWalletLookupTouched] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(() =>
    buildCollapsedState(false)
  );
  const tabGuard = useActiveTabGuard();

  const queryClient = useQueryClient();

  const walletAdapter = useMemo(
    () =>
      createStacksWalletAdapter({
        appName: 'xtrata v15.1',
        appIcon:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>'
      }),
    []
  );

  const hasHiroApiKey =
    typeof __XSTRATA_HAS_HIRO_KEY__ !== 'undefined' &&
    __XSTRATA_HAS_HIRO_KEY__;
  const mismatch = getNetworkMismatch(
    selectedContract.network,
    walletSession.network
  );
  const readOnlySender =
    walletSession.address ?? selectedContract.address;
  const walletLookupState = useMemo(
    () => getWalletLookupState(walletLookupInput, walletSession.address ?? null),
    [walletLookupInput, walletSession.address]
  );
  const compatibleContract = walletSession.network
    ? CONTRACT_REGISTRY.find(
        (entry) => entry.network === walletSession.network
      )
    : null;

  const handleContractChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    const next =
      CONTRACT_REGISTRY.find((entry) => getContractId(entry) === nextId) ??
      CONTRACT_REGISTRY[0];
    setSelectedContract(next);
    contractSelectionStore.save(next);
  };

  const handleResolveMismatch = async () => {
    if (compatibleContract) {
      setSelectedContract(compatibleContract);
      contractSelectionStore.save(compatibleContract);
      return;
    }
    setWalletPending(true);
    try {
      await walletAdapter.disconnect();
    } finally {
      setWalletSession(walletAdapter.getSession());
      setWalletPending(false);
    }
  };

  const contractId = getContractId(selectedContract);
  const walletStatus = walletSession.isConnected ? 'Connected' : 'Disconnected';
  const walletNetwork = walletSession.network ?? 'unknown';
  const showRateLimitWarning = rateLimitWarning && !hasHiroApiKey;
  const deployNetwork = walletSession.network ?? selectedContract.network;

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

  const appendDeployLog = (message: string) => {
    setDeployLog((prev) => {
      const next = [...prev, message];
      return next.slice(-20);
    });
    // eslint-disable-next-line no-console
    console.log(`[deploy] ${message}`);
  };

  const handleDeployContract = () => {
    const source = deploySource.trim();
    if (!source) {
      setDeployStatus('Paste the Clarity contract source before deploying.');
      appendDeployLog('Deploy blocked: missing source.');
      return;
    }
    const parsed = parseDeployContractName(deployName);
    if (parsed.warnings.length > 0) {
      parsed.warnings.forEach((warning) => appendDeployLog(warning));
    }
    if (!parsed.name) {
      setDeployStatus(
        'Contract name must use letters, numbers, hyphens/underscores, and no dots.'
      );
      appendDeployLog(
        `Deploy blocked: invalid name (${parsed.reason ?? 'unknown'}).`
      );
      if (parsed.normalizedName && !parsed.address) {
        setDeployName(parsed.normalizedName);
      }
      return;
    }
    if (parsed.normalizedName && !parsed.address) {
      setDeployName(parsed.normalizedName);
    }

    setDeployPending(true);
    setDeployStatus('Waiting for wallet confirmation...');
    appendDeployLog(`Deploying ${parsed.name} (${parsed.reason}) on ${deployNetwork}.`);
    appendDeployLog(`Source length: ${source.length} chars.`);

    try {
      showContractDeploy({
        contractName: parsed.name,
        codeBody: source,
        network: deployNetwork,
        onFinish: (payload) => {
          setDeployPending(false);
          setDeployStatus(`Deployment submitted: ${payload.txId}`);
          appendDeployLog(`Deployment submitted. txId=${payload.txId}`);
        },
        onCancel: () => {
          setDeployPending(false);
          setDeployStatus('Deployment cancelled or failed in wallet.');
          appendDeployLog('Deployment cancelled or failed in wallet.');
        }
      });
      appendDeployLog('Wallet prompt opened.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeployPending(false);
      setDeployStatus(`Deployment failed: ${message}`);
      appendDeployLog(`Deployment failed: ${message}`);
    }
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
        <span className="eyebrow">Contract-driven UI rebuild</span>
        <h1>xtrata v15.1</h1>
        <p>
          Select the deployed contract and keep the UI aligned with the wallet
          network.
        </p>
      </header>
      <nav className="app__nav">
        <a className="button button--ghost app__nav-link" href="#wallet-lookup">
          Wallet lookup
        </a>
        <a className="button button--ghost app__nav-link" href="#wallet-session">
          Wallet session
        </a>
        <a className="button button--ghost app__nav-link" href="#active-contract">
          Active contract
        </a>
        <a className="button button--ghost app__nav-link" href="#deploy-contract">
          Deploy
        </a>
        <a className="button button--ghost app__nav-link" href="#contract-admin">
          Contract admin
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
        <div className="app__modules app__modules--compact">
          <WalletLookupScreen
            walletSession={walletSession}
            lookupState={walletLookupState}
            lookupTouched={walletLookupTouched}
            onLookupTouched={setWalletLookupTouched}
            onLookupInputChange={setWalletLookupInput}
            collapsed={collapsedSections['wallet-lookup']}
            onToggleCollapse={() => toggleSection('wallet-lookup')}
          />

          <section
            className={`panel app-section${collapsedSections['wallet-session'] ? ' panel--collapsed' : ''}`}
            id="wallet-session"
          >
            <div className="panel__header">
              <div>
                <h2>Wallet session</h2>
                <p>Auto-aligns the app to the connected wallet network.</p>
              </div>
              <div className="panel__actions">
                <span className="badge badge--neutral">{walletStatus}</span>
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
                  <span className="meta-value">{walletNetwork}</span>
                </div>
              </div>
              {mismatch && (
                <div className="alert">
                  <div>
                    <strong>Network mismatch.</strong> Wallet is on{' '}
                    {mismatch.actual}, contract is {mismatch.expected}.
                  </div>
                  <button
                    className="button"
                    onClick={handleResolveMismatch}
                    disabled={walletPending}
                  >
                    {compatibleContract
                      ? `Switch to ${compatibleContract.label}`
                      : 'Disconnect wallet'}
                  </button>
                </div>
              )}
              {showRateLimitWarning && (
                <div className="alert">
                  <div>
                    <strong>Rate limit detected.</strong> No Hiro API key is
                    configured for the dev proxy. Set HIRO_API_KEY in
                    .env.local and restart the dev server.
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

          <section
            className={`panel app-section${collapsedSections['active-contract'] ? ' panel--collapsed' : ''}`}
            id="active-contract"
          >
            <div className="panel__header">
              <div>
                <h2>Active contract</h2>
                <p>Choose which deployed contract the UI targets.</p>
              </div>
              <div className="panel__actions">
                <span className={`badge badge--${selectedContract.network}`}>
                  {selectedContract.network}
                </span>
                <button
                  className="button button--ghost button--collapse"
                  type="button"
                  onClick={() => toggleSection('active-contract')}
                  aria-expanded={!collapsedSections['active-contract']}
                >
                  {collapsedSections['active-contract'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <label className="field">
                <span className="field__label">Contract registry</span>
                <select
                  className="select"
                  value={contractId}
                  onChange={handleContractChange}
                >
                  {CONTRACT_REGISTRY.map((entry) => {
                    const id = getContractId(entry);
                    return (
                      <option key={id} value={id}>
                        {entry.label}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Contract ID</span>
                  <span className="meta-value">{contractId}</span>
                </div>
                <div>
                  <span className="meta-label">Network</span>
                  <span className="meta-value">{selectedContract.network}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section
          className={`panel app-section${collapsedSections['deploy-contract'] ? ' panel--collapsed' : ''}`}
          id="deploy-contract"
        >
          <div className="panel__header">
            <div>
              <h2>Deploy contract</h2>
              <p>Paste the Clarity source and deploy via your wallet.</p>
            </div>
            <div className="panel__actions">
              <span className={`badge badge--${deployNetwork}`}>
                {deployNetwork}
              </span>
              <button
                className="button button--ghost button--collapse"
                type="button"
                onClick={() => toggleSection('deploy-contract')}
                aria-expanded={!collapsedSections['deploy-contract']}
              >
                {collapsedSections['deploy-contract'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <label className="field">
              <span className="field__label">Contract name</span>
              <input
                className="input"
                placeholder="xtrata-v1-1-1"
                value={deployName}
                onChange={(event) => {
                  setDeployName(event.target.value);
                  setDeployStatus(null);
                }}
              />
            </label>
            <label className="field">
              <span className="field__label">Contract source (Clarity)</span>
              <textarea
                className="textarea"
                placeholder="Paste the full Clarity contract source here."
                value={deploySource}
                onChange={(event) => {
                  setDeploySource(event.target.value);
                  setDeployStatus(null);
                }}
              />
            </label>
            <p>
              Deployment uses the connected wallet network when available; if no
              wallet is connected, the selected contract network is used.
            </p>
            <div className="deploy-actions">
              <button
                className="button"
                type="button"
                onClick={handleDeployContract}
                disabled={deployPending}
              >
                {deployPending ? 'Deploying...' : 'Deploy contract'}
              </button>
            </div>
            {deployStatus && <p>{deployStatus}</p>}
            {deployLog.length > 0 && (
              <div className="deploy-log">
                {deployLog.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="deploy-log__item">
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <ContractAdminScreen
          contract={selectedContract}
          walletSession={walletSession}
          collapsed={collapsedSections['contract-admin']}
          onToggleCollapse={() => toggleSection('contract-admin')}
        />

        <MintScreen
          contract={selectedContract}
          walletSession={walletSession}
          onInscriptionSealed={handleInscriptionSealed}
          collapsed={collapsedSections.mint}
          onToggleCollapse={() => toggleSection('mint')}
        />

        <ViewerScreen
          contract={selectedContract}
          senderAddress={readOnlySender}
          focusKey={viewerFocusKey ?? undefined}
          collapsed={collapsedSections['collection-viewer']}
          onToggleCollapse={() => toggleSection('collection-viewer')}
          isActiveTab={tabGuard.isActive}
        />

        <MyWalletScreen
          contract={selectedContract}
          walletSession={walletSession}
          senderAddress={readOnlySender}
          lookupAddress={walletLookupState.resolvedAddress}
          collapsed={collapsedSections['my-wallet']}
          onToggleCollapse={() => toggleSection('my-wallet')}
          isActiveTab={tabGuard.isActive}
        />
      </main>
    </div>
  );
}
