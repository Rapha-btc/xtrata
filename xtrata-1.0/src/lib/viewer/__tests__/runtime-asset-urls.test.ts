import { describe, expect, it } from 'vitest';
import {
  deriveRuntimeWorkspaceBaseUrl,
  rewriteRuntimeWorkspaceAssetUrl
} from '../runtime-asset-urls';

describe('runtime asset url rewriting', () => {
  it('derives the workspace base from a runtime module base href', () => {
    expect(
      deriveRuntimeWorkspaceBaseUrl(
        'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/'
      )
    ).toBe(
      'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/'
    );
  });

  it('rewrites same-origin root workspace paths into the runtime module namespace', () => {
    expect(
      rewriteRuntimeWorkspaceAssetUrl({
        requestUrl: 'https://xtrata.xyz/System/shared/processor_unified.js',
        baseUrl:
          'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/',
        origin: 'https://xtrata.xyz'
      })
    ).toBe(
      'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/System/shared/processor_unified.js'
    );
  });

  it('rewrites root-relative on-chain workspace paths into the runtime module namespace', () => {
    expect(
      rewriteRuntimeWorkspaceAssetUrl({
        requestUrl: '/on-chain-modules/workspace/System/shared/processor_unified.js?mode=worklet',
        baseUrl:
          'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/',
        origin: 'https://xtrata.xyz'
      })
    ).toBe(
      'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/System/shared/processor_unified.js?mode=worklet'
    );
  });

  it('leaves cross-origin paths unresolved', () => {
    expect(
      rewriteRuntimeWorkspaceAssetUrl({
        requestUrl: 'https://example.com/System/shared/processor_unified.js',
        baseUrl:
          'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/',
        origin: 'https://xtrata.xyz'
      })
    ).toBeNull();
  });
});
