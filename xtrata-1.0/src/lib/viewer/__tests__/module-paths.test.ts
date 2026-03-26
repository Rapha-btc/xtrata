import { describe, expect, it } from 'vitest';
import {
  buildRuntimeModuleAssetUrl,
  buildRuntimeModuleBaseHref,
  injectHtmlBaseHref,
  normalizeModuleTokenUriPath
} from '../module-paths';

describe('viewer module path helpers', () => {
  it('normalizes path-based token uris and rejects absolute urls', () => {
    expect(
      normalizeModuleTokenUriPath(
        'on-chain-modules/workspace/System/shared/patch_runtime.js'
      )
    ).toBe('on-chain-modules/workspace/System/shared/patch_runtime.js');
    expect(normalizeModuleTokenUriPath('/Plugins/Instruments/JMS10/gui.html')).toBe(
      'Plugins/Instruments/JMS10/gui.html'
    );
    expect(normalizeModuleTokenUriPath('https://example.com/gui.html')).toBeNull();
  });

  it('builds canonical module asset and base urls from token uri paths', () => {
    expect(
      buildRuntimeModuleAssetUrl({
        network: 'mainnet',
        contractId: 'SP123.contract-name',
        tokenUriPath: 'on-chain-modules/workspace/System/shared/patch_runtime.js'
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/on-chain-modules/workspace/System/shared/patch_runtime.js'
    );
    expect(
      buildRuntimeModuleBaseHref({
        network: 'mainnet',
        contractId: 'SP123.contract-name',
        tokenUriPath: 'on-chain-modules/workspace/Plugins/Instruments/JMS10/gui.html'
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
    );
  });

  it('injects a base tag at the start of head content', () => {
    const html = '<html><head><title>Module</title></head><body></body></html>';
    const result = injectHtmlBaseHref(html, '/runtime/modules/mainnet/SP123/contract/');
    expect(result).toContain('<base href="/runtime/modules/mainnet/SP123/contract/">');
    expect(result.indexOf('<base ')).toBeLessThan(result.indexOf('<title>'));
  });

  it('does not inject a duplicate base tag', () => {
    const html =
      '<html><head><base href="/already/there/"><title>Module</title></head></html>';
    expect(injectHtmlBaseHref(html, '/runtime/modules/mainnet/SP123/contract/')).toBe(
      html
    );
  });
});
