import { type ChangeEvent, type ReactNode, useMemo, useState } from 'react';
import {
  applyThemeToDocument,
  coerceThemeMode,
  resolveInitialTheme,
  THEME_OPTIONS,
  type ThemeMode,
  writeThemePreference
} from '../lib/theme/preferences';
import AddressLabel from '../components/AddressLabel';
import { isArtistAddressAllowed, getArtistAllowlist } from '../config/manage';
import { ManageWalletProvider, useManageWallet } from './ManageWalletContext';

type ArtistManagerGateProps = {
  children: ReactNode;
};

function GateContent({ children }: ArtistManagerGateProps) {
  const { walletSession, connect, disconnect } = useManageWallet();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());
  const [walletPending, setWalletPending] = useState(false);
  const connectedAddress = walletSession.address ?? null;
  const allowlist = getArtistAllowlist();
  const allowed = isArtistAddressAllowed(connectedAddress);

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextTheme = coerceThemeMode(event.target.value);
    setThemeMode(nextTheme);
    applyThemeToDocument(nextTheme);
    writeThemePreference(nextTheme);
  };

  const handleConnectWallet = async () => {
    setWalletPending(true);
    await connect();
    setWalletPending(false);
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    await disconnect();
    setWalletPending(false);
  };

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <header className="app__header">
        <span className="eyebrow">Restricted access</span>
        <h1>Artist manager</h1>
        <p>Only approved wallets may access the artist portal.</p>
      </header>
      <main className="app__main">
        <section className="panel app-section">
          <div className="panel__header">
            <div>
              <h2>Artist gate</h2>
              <p>Connect a wallet and confirm your address matches the allowlist.</p>
            </div>
            <div className="panel__actions">
              <span className="badge badge--neutral">
                {walletSession.isConnected ? 'Connected' : 'Disconnected'}
              </span>
              <label className="theme-select" htmlFor="artist-gate-theme-select">
                <span className="theme-select__label">Theme</span>
                <select
                  id="artist-gate-theme-select"
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
                <span className="meta-label">Connected address</span>
                <span className="meta-value">
                  {connectedAddress ? (
                    <AddressLabel
                      className="meta-value"
                      address={connectedAddress}
                      network={walletSession.network}
                    />
                  ) : (
                    'Not connected'
                  )}
                </span>
              </div>
              <div>
                <span className="meta-label">Allowlist</span>
                <span className="meta-value">
                  {allowlist.length > 0 ? allowlist.join(', ') : 'None'}
                </span>
              </div>
            </div>
            {!walletSession.isConnected && (
              <div className="alert">
                Connect a wallet to check access.
              </div>
            )}
            {walletSession.isConnected && !allowed && (
              <div className="alert">This wallet is not allowlisted.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ArtistManagerGate({ children }: ArtistManagerGateProps) {
  return (
    <ManageWalletProvider>
      <GateContent>{children}</GateContent>
    </ManageWalletProvider>
  );
}
