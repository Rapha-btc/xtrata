import AddressLabel from './AddressLabel';
import type { WalletSession } from '../lib/wallet/types';

type WalletTopBarProps = {
  walletSession: WalletSession;
  walletPending: boolean;
  onConnect: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  className?: string;
  showAddressWhenNamed?: boolean;
};

const joinClassName = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).join(' ');

export default function WalletTopBar(props: WalletTopBarProps) {
  return (
    <section className={joinClassName('wallet-top-bar', props.className)}>
      <div className="wallet-top-bar__identity">
        <span className="wallet-top-bar__label">Connected wallet</span>
        <AddressLabel
          className="wallet-top-bar__address"
          address={props.walletSession.address}
          network={props.walletSession.network}
          fallback="Not connected"
          showAddressWhenNamed={props.showAddressWhenNamed}
        />
        <span className="wallet-top-bar__network">
          Network: {props.walletSession.network ?? 'unknown'}
        </span>
      </div>
      <div className="wallet-top-bar__actions">
        <span className="badge badge--neutral">
          {props.walletSession.isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {props.walletSession.isConnected ? (
          <button
            className="button button--ghost"
            type="button"
            onClick={props.onDisconnect}
            disabled={props.walletPending}
          >
            Disconnect
          </button>
        ) : (
          <button
            className="button"
            type="button"
            onClick={props.onConnect}
            disabled={props.walletPending}
          >
            {props.walletPending ? 'Connecting...' : 'Connect wallet'}
          </button>
        )}
      </div>
    </section>
  );
}
