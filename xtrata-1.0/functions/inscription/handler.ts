import contractRegistry from '../../src/data/contract-registry.json';
import { onRequest as onRuntimeContentRequest } from '../runtime/content';
import { parseRuntimeContractRef, type RuntimeEnv } from '../runtime/lib';

type ContractRegistryEntry = {
  address: string;
  contractName: string;
  network: string;
  legacyContractId?: string;
};

type InscriptionRouteParams = {
  tokenId?: unknown;
  network?: unknown;
  contractAddress?: unknown;
  contractName?: unknown;
};

const registryEntries = contractRegistry as ContractRegistryEntry[];
const defaultMainnetContract =
  registryEntries
    .slice()
    .reverse()
    .find((entry) => entry.network === 'mainnet') ?? registryEntries[0];

export const DEFAULT_INSCRIPTION_CONTRACT_ID = defaultMainnetContract
  ? `${defaultMainnetContract.address}.${defaultMainnetContract.contractName}`
  : '';
export const DEFAULT_INSCRIPTION_NETWORK =
  defaultMainnetContract?.network || 'mainnet';
export const DEFAULT_INSCRIPTION_FALLBACK_CONTRACT_ID =
  defaultMainnetContract?.legacyContractId || '';

const firstParam = (value: unknown) => {
  if (Array.isArray(value)) {
    return firstParam(value[0]);
  }
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeTokenId = (value: unknown) => firstParam(value).replace(/^#/, '');

const getPathContractId = (params: InscriptionRouteParams) => {
  const address = firstParam(params.contractAddress);
  const contractName = firstParam(params.contractName);
  if (!address || !contractName) {
    return '';
  }
  const contractId = `${address}.${contractName}`;
  return parseRuntimeContractRef(contractId) ? contractId : '';
};

export const buildRuntimeInscriptionRequest = (params: {
  request: Request;
  routeParams?: InscriptionRouteParams;
}) => {
  const { request, routeParams = {} } = params;
  const sourceUrl = new URL(request.url);
  const runtimeUrl = new URL('/runtime/content', sourceUrl.origin);
  runtimeUrl.search = sourceUrl.search;

  const tokenId =
    normalizeTokenId(routeParams.tokenId) ||
    normalizeTokenId(sourceUrl.searchParams.get('tokenId'));
  const pathContractId = getPathContractId(routeParams);
  const queryContractId = sourceUrl.searchParams.get('contractId')?.trim() || '';
  const contractId =
    pathContractId || queryContractId || DEFAULT_INSCRIPTION_CONTRACT_ID;
  const network =
    firstParam(routeParams.network) ||
    sourceUrl.searchParams.get('network')?.trim() ||
    DEFAULT_INSCRIPTION_NETWORK;

  runtimeUrl.searchParams.set('contractId', contractId);
  runtimeUrl.searchParams.set('tokenId', tokenId);
  runtimeUrl.searchParams.set('network', network);

  if (
    !pathContractId &&
    !sourceUrl.searchParams.has('fallbackContractId') &&
    contractId === DEFAULT_INSCRIPTION_CONTRACT_ID &&
    DEFAULT_INSCRIPTION_FALLBACK_CONTRACT_ID
  ) {
    runtimeUrl.searchParams.set(
      'fallbackContractId',
      DEFAULT_INSCRIPTION_FALLBACK_CONTRACT_ID
    );
  }

  return new Request(runtimeUrl.toString(), {
    method: request.method,
    headers: request.headers
  });
};

export const onInscriptionRequest: PagesFunction = async ({
  request,
  env,
  params,
  waitUntil
}) =>
  onRuntimeContentRequest({
    request: buildRuntimeInscriptionRequest({
      request,
      routeParams: params
    }),
    env: env as RuntimeEnv,
    waitUntil
  });
