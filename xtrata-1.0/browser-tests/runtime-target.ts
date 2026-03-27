import { resolveBvstFirstWaveLaunchTarget } from '../src/lib/viewer/bvst-first-wave-launch';

export type RuntimeSmokeTarget = {
  name: string;
  contractId: string;
  tokenId: string;
  network: 'mainnet' | 'testnet';
  moduleBasePath: string;
  fallbackContractId?: string;
  expectedText?: string;
};

const DEFAULT_TARGET_NAME = 'RetroKeys';

const normalizeModuleBasePath = (value: string) => {
  const trimmed = value.trim().replace(/^\/+/, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const splitContractId = (contractId: string) => {
  const separator = contractId.indexOf('.');
  if (separator === -1) {
    throw new Error(`Invalid contract id: ${contractId}`);
  }
  return {
    address: contractId.slice(0, separator),
    contractName: contractId.slice(separator + 1)
  };
};

export const resolveRuntimeSmokeTarget = (): RuntimeSmokeTarget => {
  const requestedName =
    process.env.PLAYWRIGHT_RUNTIME_NAME || DEFAULT_TARGET_NAME;
  const liveTarget = resolveBvstFirstWaveLaunchTarget(requestedName);
  const contractId =
    process.env.PLAYWRIGHT_RUNTIME_CONTRACT_ID || liveTarget.contractId;
  const tokenId =
    process.env.PLAYWRIGHT_RUNTIME_TOKEN_ID ||
    liveTarget.shellTokenId.toString();
  const network =
    (process.env.PLAYWRIGHT_RUNTIME_NETWORK as
      | 'mainnet'
      | 'testnet'
      | undefined) || liveTarget.network;
  const moduleBasePath = normalizeModuleBasePath(
    process.env.PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH ||
      liveTarget.moduleBasePath
  );
  if (!moduleBasePath) {
    throw new Error('Missing PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH value.');
  }
  return {
    name: requestedName,
    contractId,
    tokenId,
    network,
    moduleBasePath,
    fallbackContractId:
      process.env.PLAYWRIGHT_RUNTIME_FALLBACK_CONTRACT_ID || undefined,
    expectedText:
      process.env.PLAYWRIGHT_RUNTIME_EXPECTED_TEXT ||
      liveTarget.liveOnChainName
  };
};

export const buildRuntimeModuleBaseUrl = (
  appBaseUrl: string,
  target: RuntimeSmokeTarget
) => {
  const { address, contractName } = splitContractId(target.contractId);
  return new URL(
    `/runtime/modules/${target.network}/${address}/${contractName}/${target.tokenId}/${target.moduleBasePath}`,
    appBaseUrl
  ).toString();
};

export const buildRuntimeUrl = (
  appBaseUrl: string,
  target: RuntimeSmokeTarget
) => {
  if (process.env.PLAYWRIGHT_RUNTIME_URL) {
    return process.env.PLAYWRIGHT_RUNTIME_URL;
  }
  const url = new URL('/runtime/', appBaseUrl);
  url.searchParams.set('contractId', target.contractId);
  url.searchParams.set('tokenId', target.tokenId);
  url.searchParams.set('network', target.network);
  url.searchParams.set(
    'moduleBase',
    buildRuntimeModuleBaseUrl(appBaseUrl, target)
  );
  if (target.fallbackContractId) {
    url.searchParams.set('fallbackContractId', target.fallbackContractId);
  }
  return url.toString();
};

export const buildRuntimeSmokeHarnessUrl = (
  appBaseUrl: string,
  target: RuntimeSmokeTarget
) => {
  const url = new URL('/runtime/smoke.html', appBaseUrl);
  url.searchParams.set('runtimeUrl', buildRuntimeUrl(appBaseUrl, target));
  return url.toString();
};
