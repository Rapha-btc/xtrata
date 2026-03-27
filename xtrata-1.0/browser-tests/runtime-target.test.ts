import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  buildRuntimeModuleBaseUrl,
  buildRuntimeSmokeHarnessUrl,
  buildRuntimeUrl,
  resolveRuntimeSmokeTarget
} from './runtime-target';

describe('runtime smoke target helpers', () => {
  const originalEnv = { ...process.env };
  const expectedTargets = [
    {
      inputName: 'JMS10',
      tokenId: '237',
      liveFolderName: 'JMS10'
    },
    {
      inputName: 'UniversalEngine',
      tokenId: '240',
      liveFolderName: 'BVSTEngine'
    },
    {
      inputName: 'UniversalSynth',
      tokenId: '243',
      liveFolderName: 'BVSTSynth'
    },
    {
      inputName: 'BlueMarvinOne',
      tokenId: '250',
      liveFolderName: 'MinerOne'
    },
    {
      inputName: 'BlueMarvinTwo',
      tokenId: '253',
      liveFolderName: 'MinerTwo'
    },
    {
      inputName: 'NeonPoly',
      tokenId: '256',
      liveFolderName: 'ChainPoly'
    },
    {
      inputName: 'RetroKeys',
      tokenId: '259',
      liveFolderName: 'RetroKeys'
    }
  ] as const;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_RUNTIME_URL;
    delete process.env.PLAYWRIGHT_RUNTIME_NAME;
    delete process.env.PLAYWRIGHT_RUNTIME_CONTRACT_ID;
    delete process.env.PLAYWRIGHT_RUNTIME_TOKEN_ID;
    delete process.env.PLAYWRIGHT_RUNTIME_NETWORK;
    delete process.env.PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH;
    delete process.env.PLAYWRIGHT_RUNTIME_EXPECTED_TEXT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds the default RetroKeys runtime URL shape', () => {
    const target = resolveRuntimeSmokeTarget();
    const baseUrl = 'http://127.0.0.1:4173';

    expect(buildRuntimeModuleBaseUrl(baseUrl, target)).toBe(
      'http://127.0.0.1:4173/runtime/modules/mainnet/SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X/xtrata-v2-1-0/259/on-chain-modules/workspace/Plugins/Instruments/RetroKeys/'
    );

    expect(buildRuntimeUrl(baseUrl, target)).toBe(
      'http://127.0.0.1:4173/runtime/?contractId=SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0&tokenId=259&network=mainnet&moduleBase=http%3A%2F%2F127.0.0.1%3A4173%2Fruntime%2Fmodules%2Fmainnet%2FSP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X%2Fxtrata-v2-1-0%2F259%2Fon-chain-modules%2Fworkspace%2FPlugins%2FInstruments%2FRetroKeys%2F'
    );
  });

  it('resolves every first-wave synth name to the verified live shell token and folder', () => {
    for (const expectedTarget of expectedTargets) {
      process.env.PLAYWRIGHT_RUNTIME_NAME = expectedTarget.inputName;
      const target = resolveRuntimeSmokeTarget();

      expect(target.name).toBe(expectedTarget.inputName);
      expect(target.tokenId).toBe(expectedTarget.tokenId);
      expect(target.moduleBasePath).toBe(
        `on-chain-modules/workspace/Plugins/Instruments/${expectedTarget.liveFolderName}/`
      );
      expect(target.expectedText).toBe(expectedTarget.liveFolderName);

      const runtimeModuleBaseUrl = buildRuntimeModuleBaseUrl(
        'http://127.0.0.1:4173',
        target
      );
      expect(runtimeModuleBaseUrl).toContain(
        `/${expectedTarget.tokenId}/on-chain-modules/workspace/Plugins/Instruments/${expectedTarget.liveFolderName}/`
      );
    }
  });

  it('builds the smoke harness URL from the runtime URL', () => {
    const target = resolveRuntimeSmokeTarget();
    const baseUrl = 'http://127.0.0.1:4173';

    expect(buildRuntimeSmokeHarnessUrl(baseUrl, target)).toContain(
      '/runtime/smoke.html?runtimeUrl='
    );
  });

  it('prefers an explicit runtime URL override', () => {
    process.env.PLAYWRIGHT_RUNTIME_URL = 'https://example.com/runtime/?foo=bar';
    const target = resolveRuntimeSmokeTarget();

    expect(buildRuntimeUrl('http://127.0.0.1:4173', target)).toBe(
      'https://example.com/runtime/?foo=bar'
    );
  });
});
