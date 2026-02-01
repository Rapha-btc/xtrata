import type { WalletSession } from '../lib/wallet/types';
import type { WalletLookupState } from '../lib/wallet/lookup';

type WalletLookupScreenProps = {
  walletSession: WalletSession;
  lookupState: WalletLookupState;
  lookupTouched: boolean;
  onLookupTouched: (value: boolean) => void;
  onLookupInputChange: (value: string) => void;
  onSearch?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export default function WalletLookupScreen(props: WalletLookupScreenProps) {
  const showEmptySearch =
    props.lookupTouched &&
    !props.lookupState.entered &&
    !props.walletSession.address;
  const showInvalidSearch = props.lookupState.entered && !props.lookupState.valid;
  const viewingAddress = props.lookupState.resolvedAddress;
  const hasManualOverride = !!props.lookupState.lookupAddress;
  const clearLabel = props.walletSession.address
    ? 'Use connected wallet'
    : 'Clear search';

  return (
    <section
      className={`panel app-section${props.collapsed ? ' panel--collapsed' : ''}`}
      id="wallet-lookup"
    >
      <div className="panel__header">
        <div>
          <h2>Wallet lookup</h2>
          <p>Search by address to view owned inscriptions.</p>
        </div>
        <div className="panel__actions">
          <button
            className="button button--ghost button--collapse"
            type="button"
            onClick={props.onToggleCollapse}
            aria-expanded={!props.collapsed}
          >
            {props.collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className="panel__body">
        <form
          className="wallet-lookup__form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onLookupTouched(true);
            if (
              props.lookupState.entered &&
              props.lookupState.valid &&
              props.onSearch
            ) {
              props.onSearch();
            }
          }}
        >
          <label className="field field--search">
            <span className="field__label">Search by wallet address</span>
            <div className="field__row">
              <input
                className={`input input--prominent${showEmptySearch ? ' input--alert' : ''}`}
                placeholder="Enter SP... or ST..."
                value={props.lookupState.input}
                onChange={(event) => props.onLookupInputChange(event.target.value)}
              />
              <button className="button" type="submit">
                Search
              </button>
            </div>
            <span className="field__hint">
              Paste a Stacks address to view holdings.
            </span>
            {showEmptySearch && (
              <span className="field__error">Enter a wallet address to search.</span>
            )}
            {showInvalidSearch && (
              <span className="field__error">Enter a valid Stacks address.</span>
            )}
          </label>
        </form>
        <div className="wallet-lookup__status">
          <span className="meta-label">Connected wallet</span>
          <span className="meta-value">
            {props.walletSession.address ?? 'Not connected'}
          </span>
          {hasManualOverride && (
            <span className="wallet-lookup__note">Using manual address override.</span>
          )}
          {props.lookupState.entered && (
            <button
              type="button"
              className="button button--ghost button--mini"
              onClick={() => {
                props.onLookupInputChange('');
                props.onLookupTouched(false);
              }}
            >
              {clearLabel}
            </button>
          )}
        </div>
        {viewingAddress && (
          <div className="wallet-lookup__status">
            <span className="meta-label">Viewing holdings for</span>
            <span className="meta-value">{viewingAddress}</span>
          </div>
        )}
      </div>
    </section>
  );
}
