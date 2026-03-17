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
  it('links explorer lookups with the underlying address even when showing a BNS name', () => {
    const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
    const html = renderToStaticMarkup(
      createElement(AddressLabel, {
        address,
        name: 'alice.btc',
        network: 'mainnet'
      })
    );

    expect(html).toContain('alice.btc');
    expect(html).toContain(
      `href="https://explorer.hiro.so/address/${address}?chain=mainnet"`
    );
    expect(html).not.toContain('/name/alice.btc');
  });
});
