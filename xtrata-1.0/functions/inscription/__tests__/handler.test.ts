import { describe, expect, it } from 'vitest';
import {
  buildRuntimeInscriptionRequest,
  DEFAULT_INSCRIPTION_CONTRACT_ID,
  DEFAULT_INSCRIPTION_FALLBACK_CONTRACT_ID,
  DEFAULT_INSCRIPTION_NETWORK
} from '../handler';
import { onRequest as onExplicitInscriptionRequest } from '../[network]/[contractAddress]/[contractName]/[tokenId]';
import { onRequest as onShortInscriptionRequest } from '../[tokenId]';

const explicitContractAddress = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const explicitContractName = 'xtrata-v2-1-1';

const parsedRuntimeUrl = (request: Request) => {
  const url = new URL(request.url);
  return {
    pathname: url.pathname,
    params: url.searchParams
  };
};

describe('/inscription aliases', () => {
  it('maps a short inscription URL to the default runtime content contract', () => {
    const runtimeRequest = buildRuntimeInscriptionRequest({
      request: new Request('https://xtrata.xyz/inscription/315'),
      routeParams: {
        tokenId: '315'
      }
    });

    const { pathname, params } = parsedRuntimeUrl(runtimeRequest);
    expect(pathname).toBe('/runtime/content');
    expect(params.get('contractId')).toBe(DEFAULT_INSCRIPTION_CONTRACT_ID);
    expect(params.get('tokenId')).toBe('315');
    expect(params.get('network')).toBe(DEFAULT_INSCRIPTION_NETWORK);
    expect(params.get('fallbackContractId')).toBe(
      DEFAULT_INSCRIPTION_FALLBACK_CONTRACT_ID
    );
  });

  it('normalizes token ids copied with a leading hash', () => {
    const runtimeRequest = buildRuntimeInscriptionRequest({
      request: new Request('https://xtrata.xyz/inscription/%23315'),
      routeParams: {
        tokenId: '#315'
      }
    });

    expect(parsedRuntimeUrl(runtimeRequest).params.get('tokenId')).toBe('315');
  });

  it('honors the explicit contract route without applying default fallback', () => {
    const runtimeRequest = buildRuntimeInscriptionRequest({
      request: new Request(
        `https://xtrata.xyz/inscription/mainnet/${explicitContractAddress}/${explicitContractName}/315`
      ),
      routeParams: {
        network: 'mainnet',
        contractAddress: explicitContractAddress,
        contractName: explicitContractName,
        tokenId: '315'
      }
    });

    const { params } = parsedRuntimeUrl(runtimeRequest);
    expect(params.get('contractId')).toBe(
      `${explicitContractAddress}.${explicitContractName}`
    );
    expect(params.get('tokenId')).toBe('315');
    expect(params.get('network')).toBe('mainnet');
    expect(params.has('fallbackContractId')).toBe(false);
  });

  it('keeps query overrides available on the short route', () => {
    const runtimeRequest = buildRuntimeInscriptionRequest({
      request: new Request(
        'https://xtrata.xyz/inscription/12?contractId=ST123.custom&network=testnet&fallbackContractId=ST123.previous'
      ),
      routeParams: {
        tokenId: '12'
      }
    });

    const { params } = parsedRuntimeUrl(runtimeRequest);
    expect(params.get('contractId')).toBe('ST123.custom');
    expect(params.get('tokenId')).toBe('12');
    expect(params.get('network')).toBe('testnet');
    expect(params.get('fallbackContractId')).toBe('ST123.previous');
  });

  it('exports both Pages route entrypoints', () => {
    expect(onShortInscriptionRequest).toBeTypeOf('function');
    expect(onExplicitInscriptionRequest).toBeTypeOf('function');
  });
});
