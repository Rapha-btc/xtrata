import { describe, expect, it } from 'vitest';
import { resolveRuntimeLaunchModuleBase } from '../runtime-launch';

describe('runtime launch module base resolution', () => {
  it('prefers the live runtime response module base over the requested value', () => {
    expect(
      resolveRuntimeLaunchModuleBase({
        network: 'mainnet',
        contractId: 'SP123.contract-name',
        tokenId: 237n,
        requestedModuleBase:
          '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/LegacyJMS10/',
        responseModuleBase:
          '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
    );
  });

  it('derives the live module base from the runtime token uri when the header is absent', () => {
    expect(
      resolveRuntimeLaunchModuleBase({
        network: 'mainnet',
        contractId: 'SP123.contract-name',
        tokenId: 237n,
        requestedModuleBase: '',
        responseTokenUri: 'on-chain-modules/workspace/Plugins/Instruments/JMS10/gui.html'
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
    );
  });

  it('falls back to the requested module base when the runtime response provides no path data', () => {
    expect(
      resolveRuntimeLaunchModuleBase({
        network: 'mainnet',
        contractId: 'SP123.contract-name',
        tokenId: 237n,
        requestedModuleBase:
          '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
      })
    ).toBe(
      '/runtime/modules/mainnet/SP123/contract-name/237/on-chain-modules/workspace/Plugins/Instruments/JMS10/'
    );
  });
});
