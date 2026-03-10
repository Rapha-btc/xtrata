import { validateStacksAddress } from '@stacks/transactions';

type RuntimeEnv = Record<string, string | undefined>;

export type X402Network = 'mainnet' | 'testnet';
export type X402AccessGrantMode = 'commerce' | 'vault';
export type X402AccessMode = X402AccessGrantMode | 'either';
export type X402DeliveryMode = 'html' | 'json';

export type X402ContractRef = {
  address: string;
  contractName: string;
  network: X402Network;
};

export type X402PremiumRouteConfig = {
  slug: string;
  title: string;
  contract: X402ContractRef;
  assetId: bigint;
  delivery: X402DeliveryMode;
  accessMode: X402AccessMode;
  commerce?: {
    contract: X402ContractRef;
    listingId: bigint;
    price: bigint;
    symbol: 'USDCx';
    decimals: 6;
  };
  vault?: {
    contract: X402ContractRef;
    assetId: bigint;
    minimumTier: bigint;
    vaultId?: bigint;
  };
};

export type X402RouteLookupResult = {
  route: X402PremiumRouteConfig | null;
  error: string | null;
};

export const X402_ACCESS_COOKIE_NAME = 'xtrata_demo_access';
export const X402_ACCESS_TTL_SECONDS = 300;

const DEFAULT_DEMO_SLUG = 'premium-recursive-demo';
const DEFAULT_DEMO_TITLE = 'Premium Recursive Demo';
const DEFAULT_CORE_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
const DEFAULT_COMMERCE_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-commerce';
const DEFAULT_VAULT_CONTRACT_ID =
  'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-vault';

const toNonEmpty = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getNetworkFromAddress = (principal: string): X402Network | null => {
  const [address] = principal.split('.');
  if (!address || address.length < 2) {
    return null;
  }
  const prefix = address.slice(0, 2).toUpperCase();
  if (prefix === 'SP' || prefix === 'SM') {
    return 'mainnet';
  }
  if (prefix === 'ST' || prefix === 'SN') {
    return 'testnet';
  }
  return null;
};

const parseUnsignedBigInt = (value: string | null | undefined) => {
  const normalized = toNonEmpty(value);
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
};

const parseContractId = (value: string | null | undefined): X402ContractRef | null => {
  const normalized = toNonEmpty(value);
  if (!normalized) {
    return null;
  }
  const dotIndex = normalized.indexOf('.');
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return null;
  }
  const address = normalized.slice(0, dotIndex).trim();
  const contractName = normalized.slice(dotIndex + 1).trim();
  if (!validateStacksAddress(address) || contractName.length === 0) {
    return null;
  }
  const network = getNetworkFromAddress(address);
  if (!network) {
    return null;
  }
  return {
    address,
    contractName,
    network
  };
};

const parseAccessMode = (value: string | null | undefined): X402AccessMode | null => {
  const normalized = toNonEmpty(value)?.toLowerCase();
  if (!normalized) {
    return 'commerce';
  }
  if (normalized === 'commerce' || normalized === 'vault' || normalized === 'either') {
    return normalized;
  }
  return null;
};

const parseDelivery = (value: string | null | undefined): X402DeliveryMode => {
  const normalized = toNonEmpty(value)?.toLowerCase();
  return normalized === 'json' ? 'json' : 'html';
};

export const getX402ContractId = (contract: X402ContractRef) =>
  `${contract.address}.${contract.contractName}`;

export const getX402DemoSlug = (env: RuntimeEnv) =>
  toNonEmpty(env.X402_DEMO_SLUG) ?? DEFAULT_DEMO_SLUG;

export const getX402AccessSecret = (env: RuntimeEnv) =>
  toNonEmpty(env.X402_ACCESS_SECRET);

export const buildX402DemoRoute = (env: RuntimeEnv): X402RouteLookupResult => {
  const slug = getX402DemoSlug(env);
  const title = toNonEmpty(env.X402_DEMO_TITLE) ?? DEFAULT_DEMO_TITLE;
  const accessMode = parseAccessMode(env.X402_DEMO_ACCESS_MODE);
  if (!accessMode) {
    return {
      route: null,
      error: 'Invalid X402_DEMO_ACCESS_MODE. Expected commerce, vault, or either.'
    };
  }

  const assetId = parseUnsignedBigInt(env.X402_DEMO_ASSET_ID);
  if (assetId === null) {
    return {
      route: null,
      error: 'Missing or invalid X402_DEMO_ASSET_ID.'
    };
  }

  const contract = parseContractId(env.X402_DEMO_CORE_CONTRACT ?? DEFAULT_CORE_CONTRACT_ID);
  if (!contract) {
    return {
      route: null,
      error: 'Missing or invalid X402_DEMO_CORE_CONTRACT.'
    };
  }

  const route: X402PremiumRouteConfig = {
    slug,
    title,
    contract,
    assetId,
    delivery: parseDelivery(env.X402_DEMO_DELIVERY),
    accessMode
  };

  if (accessMode === 'commerce' || accessMode === 'either') {
    const commerceContract = parseContractId(
      env.X402_DEMO_COMMERCE_CONTRACT ?? DEFAULT_COMMERCE_CONTRACT_ID
    );
    if (!commerceContract) {
      return {
        route: null,
        error: 'Missing or invalid X402_DEMO_COMMERCE_CONTRACT.'
      };
    }
    const listingId = parseUnsignedBigInt(env.X402_DEMO_LISTING_ID);
    if (listingId === null) {
      return {
        route: null,
        error: 'Missing or invalid X402_DEMO_LISTING_ID.'
      };
    }
    const price = parseUnsignedBigInt(env.X402_DEMO_PRICE);
    if (price === null) {
      return {
        route: null,
        error: 'Missing or invalid X402_DEMO_PRICE.'
      };
    }
    route.commerce = {
      contract: commerceContract,
      listingId,
      price,
      symbol: 'USDCx',
      decimals: 6
    };
  }

  if (accessMode === 'vault' || accessMode === 'either') {
    const vaultContract = parseContractId(
      env.X402_DEMO_VAULT_CONTRACT ?? DEFAULT_VAULT_CONTRACT_ID
    );
    if (!vaultContract) {
      return {
        route: null,
        error: 'Missing or invalid X402_DEMO_VAULT_CONTRACT.'
      };
    }
    const minimumTier = parseUnsignedBigInt(env.X402_DEMO_MIN_TIER) ?? 1n;
    const vaultId = parseUnsignedBigInt(env.X402_DEMO_VAULT_ID);
    if (minimumTier > 1n && vaultId === null) {
      return {
        route: null,
        error:
          'X402_DEMO_VAULT_ID is required when X402_DEMO_MIN_TIER is greater than 1.'
      };
    }
    route.vault = {
      contract: vaultContract,
      assetId,
      minimumTier,
      ...(vaultId === null ? {} : { vaultId })
    };
  }

  return {
    route,
    error: null
  };
};

export const getX402PremiumRoute = (
  env: RuntimeEnv,
  slug: string
): X402RouteLookupResult => {
  const normalized = slug.trim();
  if (!normalized) {
    return {
      route: null,
      error: 'Missing premium route slug.'
    };
  }
  if (normalized !== getX402DemoSlug(env)) {
    return {
      route: null,
      error: null
    };
  }
  return buildX402DemoRoute(env);
};
