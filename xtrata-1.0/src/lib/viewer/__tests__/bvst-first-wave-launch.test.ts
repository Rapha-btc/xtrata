import { describe, expect, it } from 'vitest';
import {
  buildBvstFirstWaveRuntimeOpenUrl,
  resolveBvstFirstWaveLaunchTarget
} from '../bvst-first-wave-launch';

describe('bvst first-wave launch helpers', () => {
  it('resolves RetroKeys to the live RetroKeys shell target', () => {
    const target = resolveBvstFirstWaveLaunchTarget('RetroKeys');
    expect(target.liveOnChainName).toBe('RetroKeys');
    expect(target.shellTokenId).toBe(259);
    expect(target.manifestTokenId).toBe(257);
    expect(target.patchTokenId).toBe(258);
    expect(target.moduleBaseHref).toBe(
      '/runtime/modules/mainnet/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X/xtrata-v2-1-0/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/'
    );
  });

  it('maps local synth names onto live on-chain folder names', () => {
    const target = resolveBvstFirstWaveLaunchTarget('UniversalSynth');
    expect(target.liveOnChainName).toBe('BVSTSynth');
    expect(target.localBundleName).toBe('UniversalSynth');
    expect(target.shellTokenId).toBe(243);
    expect(target.shellPath).toBe(
      'on-chain-modules/workspace/Plugins/Instruments/BVSTSynth/gui.html'
    );
  });

  it('builds runtime open urls with the live shell token and module base', () => {
    const url = buildBvstFirstWaveRuntimeOpenUrl('BlueMarvinOne');
    const parsed = new URL(url, 'https://xtrata.xyz');
    expect(parsed.pathname).toBe('/runtime/');
    expect(parsed.searchParams.get('tokenId')).toBe('250');
    expect(parsed.searchParams.get('moduleBase')).toBe(
      '/runtime/modules/mainnet/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X/xtrata-v2-1-0/250/on-chain-modules/workspace/Plugins/Instruments/MinerOne/'
    );
  });
});
