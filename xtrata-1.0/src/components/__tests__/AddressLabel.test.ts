import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AddressLabel from '../AddressLabel';

vi.mock('../../lib/bns/hooks', () => ({
  useBnsNames: () => ({
    data: null
  })
}));

describe('AddressLabel', () => {
  it('links wallet-view lookups with the underlying address even when showing a BNS name', () => {
    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const html = renderToStaticMarkup(
      createElement(AddressLabel, {
        address,
        name: 'alice.btc',
        network: 'mainnet'
      })
    );

    expect(html).toContain('alice.btc');
    expect(html).toContain(`href="/?viewer-wallet=${address}"`);
    expect(html).not.toContain('address-label__address');
    expect(html).not.toContain('/name/alice.btc');
    expect(html).not.toContain('target="_blank"');
  });

  it('can still show the raw address as a secondary line when requested', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLabel, {
        address: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        name: 'alice.btc',
        network: 'mainnet',
        showAddressWhenNamed: true
      })
    );

    expect(html).toContain('address-label__address');
  });

  it('can still link to the explorer when explicitly requested', () => {
    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const html = renderToStaticMarkup(
      createElement(AddressLabel, {
        address,
        network: 'mainnet',
        linkTarget: 'explorer'
      })
    );

    expect(html).toContain(
      `href="https://explorer.hiro.so/address/${address}?chain=mainnet"`
    );
    expect(html).toContain('target="_blank"');
  });

  it('can render without any link when requested', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLabel, {
        address: 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B',
        linkTarget: 'none'
      })
    );

    expect(html).not.toContain('<a ');
  });
});
