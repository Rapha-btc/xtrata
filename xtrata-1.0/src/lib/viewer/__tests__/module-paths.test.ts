import { describe, expect, it } from 'vitest';
import {
  buildRuntimeModuleAssetUrl,
  buildRuntimeModuleBaseHref,
  injectHtmlBaseHref,
  normalizeModuleTokenUriPath,
  parseRuntimeModuleContractId
} from '../module-paths';

describe('viewer module path helpers', () => {
  it('parses runtime module contract ids', () => {
    expect(parseRuntimeModuleContractId('SP123.test-contract')).toEqual({
      address: 'SP123',
      contractName: 'test-contract'
    });
    expect(parseRuntimeModuleContractId('')).toBeNull();
    expect(parseRuntimeModuleContractId('SP123')).toBeNull();
  });

  it('normalizes token uri paths', () => {
    expect(
      normalizeModuleTokenUriPath(
        '/on-chain-modules/workspace/System/shared/patch_runtime.js?x=1#hash'
      )
    ).toBe('on-chain-modules/workspace/System/shared/patch_runtime.js');
    expect(normalizeModuleTokenUriPath('../System/shared/patch_runtime.js')).toBeNull();
  });

  it('builds runtime module asset urls and base hrefs', () => {
    expect(
      buildRuntimeModuleAssetUrl({
        network: 'mainnet',
        contractId: 'SP123.test-contract',
        tokenUriPath: 'on-chain-modules/workspace/System/shared/patch_runtime.js',
        entryTokenId: 259n
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/test-contract/259/on-chain-modules/workspace/System/shared/patch_runtime.js'
    );

    expect(
      buildRuntimeModuleBaseHref({
        network: 'mainnet',
        contractId: 'SP123.test-contract',
        tokenUriPath: 'on-chain-modules/workspace/Plugins/Instruments/RetroKeys/gui.html',
        entryTokenId: 259n
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/test-contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/'
    );
  });

  it('injects base href tags into html without duplicating them', () => {
    const baseHref =
      '/runtime/modules/mainnet/SP123/test-contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/';
    const html = '<html><head><title>RetroKeys</title></head><body></body></html>';
    const injected = injectHtmlBaseHref(html, baseHref);
    expect(injected).toContain(`<base href="${baseHref}">`);
    expect(injectHtmlBaseHref(injected, baseHref).match(/<base /g)).toHaveLength(1);
  });
});
