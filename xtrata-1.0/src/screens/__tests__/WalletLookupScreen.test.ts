import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WalletLookupState } from '../../lib/wallet/lookup';
import WalletLookupScreen from '../WalletLookupScreen';

vi.mock('../../components/AddressLabel', () => ({
  default: (props: {
    address: string | null | undefined;
    name?: string | null;
    className?: string;
    fallback?: string;
  }) =>
    createElement(
      'span',
      {
        className: props.className,
        'data-address': props.address ?? '',
        'data-name': props.name ?? '',
        'data-fallback': props.fallback ?? ''
      },
      props.name ?? props.address ?? props.fallback ?? ''
    )
}));

describe('WalletLookupScreen', () => {
  const connectedAddress = 'SP3FGQ8Z79YQF7A8M0Q5B1K0VYXTRZ5M6BT8M3R2D';
  const resolvedAddress = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';

  const renderScreen = (lookupState: WalletLookupState) =>
    renderToStaticMarkup(
      createElement(WalletLookupScreen, {
        walletSession: {
          isConnected: true,
          address: connectedAddress,
          network: 'mainnet'
        },
        lookupState,
        lookupTouched: true,
        onLookupTouched: vi.fn(),
        onLookupInputChange: vi.fn(),
        onSearch: vi.fn(),
        collapsed: false,
        onToggleCollapse: vi.fn()
      })
    );

  it('renders the lookup target from the resolved wallet address and keeps BNS input as context', () => {
    const html = renderScreen({
      input: 'alice.btc',
      trimmed: 'alice.btc',
      entered: true,
      valid: true,
      lookupAddress: null,
      lookupName: 'alice.btc',
      resolvedAddress,
      bnsStatus: 'resolved',
      bnsError: null
    });

    expect(html).toContain(`data-address="${resolvedAddress}"`);
    expect(html).not.toContain('data-name="alice.btc"');
    expect(html).toContain('Resolved from alice.btc.');
  });

  it('does not show the BNS resolution note for direct address lookups', () => {
    const html = renderScreen({
      input: resolvedAddress,
      trimmed: resolvedAddress,
      entered: true,
      valid: true,
      lookupAddress: resolvedAddress,
      lookupName: null,
      resolvedAddress,
      bnsStatus: 'idle',
      bnsError: null
    });

    expect(html).toContain(`data-address="${resolvedAddress}"`);
    expect(html).not.toContain('Resolved from');
  });
});
