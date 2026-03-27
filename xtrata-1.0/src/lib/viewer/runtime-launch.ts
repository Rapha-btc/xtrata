import type { NetworkType } from '../network/types';
import { buildRuntimeModuleBaseHref } from './module-paths';

const trimText = (value: string | null | undefined) =>
  typeof value === 'string' ? value.trim() : '';

export const resolveRuntimeLaunchModuleBase = (params: {
  network: NetworkType;
  contractId: string;
  tokenId: bigint | number | string;
  requestedModuleBase?: string | null;
  responseModuleBase?: string | null;
  responseTokenUri?: string | null;
}) => {
  const responseModuleBase = trimText(params.responseModuleBase);
  if (responseModuleBase) {
    return responseModuleBase;
  }

  const responseTokenUri = trimText(params.responseTokenUri);
  if (responseTokenUri) {
    const derived = buildRuntimeModuleBaseHref({
      network: params.network,
      contractId: params.contractId,
      tokenUriPath: responseTokenUri,
      entryTokenId: params.tokenId
    });
    if (derived) {
      return derived;
    }
  }

  return trimText(params.requestedModuleBase);
};
