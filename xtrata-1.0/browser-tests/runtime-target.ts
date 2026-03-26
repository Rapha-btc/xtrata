export type RuntimeSmokeTarget = {
  name: string;
  contractId: string;
  tokenId: string;
  network: 'mainnet' | 'testnet';
  moduleBasePath: string;
  fallbackContractId?: string;
  expectedText?: string;
};

const DEFAULT_TARGET: RuntimeSmokeTarget = {
  name: 'retrokeys',
  contractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
  tokenId: '259',
  network: 'mainnet',
  moduleBasePath:
    'on-chain-modules/workspace/Plugins/Instruments/RetroKeys/',
  expectedText: 'RetroKeys'
};

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
  const contractId =
    process.env.PLAYWRIGHT_RUNTIME_CONTRACT_ID || DEFAULT_TARGET.contractId;
  const tokenId =
    process.env.PLAYWRIGHT_RUNTIME_TOKEN_ID || DEFAULT_TARGET.tokenId;
  const network =
    (process.env.PLAYWRIGHT_RUNTIME_NETWORK as
      | 'mainnet'
      | 'testnet'
      | undefined) || DEFAULT_TARGET.network;
  const moduleBasePath = normalizeModuleBasePath(
    process.env.PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH ||
      DEFAULT_TARGET.moduleBasePath
  );
  if (!moduleBasePath) {
    throw new Error('Missing PLAYWRIGHT_RUNTIME_MODULE_BASE_PATH value.');
  }
  return {
    name: process.env.PLAYWRIGHT_RUNTIME_NAME || DEFAULT_TARGET.name,
    contractId,
    tokenId,
    network,
    moduleBasePath,
    fallbackContractId:
      process.env.PLAYWRIGHT_RUNTIME_FALLBACK_CONTRACT_ID ||
      DEFAULT_TARGET.fallbackContractId,
    expectedText:
      process.env.PLAYWRIGHT_RUNTIME_EXPECTED_TEXT ||
      DEFAULT_TARGET.expectedText
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
