import { describe, expect, it } from 'vitest';
import { onRequest } from '../../System/[[path]]';

describe('runtime workspace root redirect route', () => {
  it('redirects bare shared module requests using moduleBase from the runtime page referer', async () => {
    const response = await onRequest({
      request: new Request(
        'https://xtrata.xyz/System/shared/wasm_loader_unified.js',
        {
          headers: {
            Referer:
              'https://xtrata.xyz/runtime/?contractId=SP123.contract-name&tokenId=225&network=mainnet&moduleBase=%2Fruntime%2Fmodules%2Fmainnet%2FSP123%2Fcontract-name%2F225%2Fon-chain-modules%2Fworkspace%2FPlugins%2FInstruments%2FRetroKeys%2F'
          }
        }
      ),
      params: {
        path: ['shared', 'wasm_loader_unified.js']
      }
    } as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('Vary')).toContain('Referer');
    expect(response.headers.get('Location')).toBe(
      'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract-name/225/on-chain-modules/workspace/System/shared/wasm_loader_unified.js'
    );
  });

  it('redirects bare wasm requests using a remapped module referer', async () => {
    const response = await onRequest({
      request: new Request('https://xtrata.xyz/System/shared/bvst_unified_bg.wasm', {
        headers: {
          Referer:
            'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract-name/225/on-chain-modules/workspace/System/shared/wasm_loader_unified.js'
        }
      }),
      params: {
        path: ['shared', 'bvst_unified_bg.wasm']
      }
    } as any);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      'https://xtrata.xyz/runtime/modules/mainnet/SP123/contract-name/225/on-chain-modules/workspace/System/shared/bvst_unified_bg.wasm'
    );
  });

  it('returns 404 when the runtime workspace base cannot be inferred', async () => {
    const response = await onRequest({
      request: new Request('https://xtrata.xyz/System/shared/bvst_unified_bg.wasm'),
      params: {
        path: ['shared', 'bvst_unified_bg.wasm']
      }
    } as any);

    expect(response.status).toBe(404);
  });
});
