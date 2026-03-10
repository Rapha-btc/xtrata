import { PUBLIC_CONTRACT } from '../config/public';
import { getContractId, parseContractId, type ContractConfig } from '../lib/contract/config';
import { COMMERCE_REGISTRY, getCommerceContractId } from '../lib/commerce/registry';
import { getVaultContractId, VAULT_REGISTRY } from '../lib/vault/registry';

type DoraEnv = Record<string, string | undefined>;

export type DoraHacksDemoConfig = {
  coreContract: ContractConfig;
  coreContractId: string;
  freeAssetId: bigint | null;
  commerce: {
    contract: ContractConfig;
    contractId: string;
    listingId: bigint | null;
    teaserAssetId: bigint | null;
  };
  vault: {
    contract: ContractConfig;
    contractId: string;
    assetId: bigint | null;
    vaultId: bigint | null;
    openAmountInput: string;
    depositAmountInput: string;
  };
  x402: {
    slug: string;
    premiumUrl: string;
    statusUrl: string;
    sessionUrl: string;
  };
  errors: string[];
};

const DEFAULT_COMMERCE_CONTRACT_ID = getCommerceContractId(COMMERCE_REGISTRY[0]);
const DEFAULT_VAULT_CONTRACT_ID = getVaultContractId(VAULT_REGISTRY[0]);
const DEFAULT_X402_SLUG = 'premium-recursive-demo';
const DEFAULT_VAULT_OPEN_AMOUNT = '0.00000100';
const DEFAULT_VAULT_DEPOSIT_AMOUNT = '0.00000100';

const toNonEmpty = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const parseContractOrDefault = (
  value: string | null | undefined,
  fallback: ContractConfig
) => {
  const normalized = toNonEmpty(value);
  if (!normalized) {
    return fallback;
  }
  return parseContractId(normalized) ?? fallback;
};

export const buildDoraHacksDemoConfig = (env: DoraEnv): DoraHacksDemoConfig => {
  const errors: string[] = [];
  const coreContract = parseContractOrDefault(
    env.VITE_DORA_HACKS_CORE_CONTRACT_ID,
    PUBLIC_CONTRACT
  );
  const commerceContract = parseContractOrDefault(
    env.VITE_DORA_HACKS_COMMERCE_CONTRACT_ID,
    parseContractId(DEFAULT_COMMERCE_CONTRACT_ID) ?? COMMERCE_REGISTRY[0]
  );
  const vaultContract = parseContractOrDefault(
    env.VITE_DORA_HACKS_VAULT_CONTRACT_ID,
    parseContractId(DEFAULT_VAULT_CONTRACT_ID) ?? VAULT_REGISTRY[0]
  );

  const freeAssetId = parseUnsignedBigInt(env.VITE_DORA_HACKS_FREE_ASSET_ID);
  if (freeAssetId === null) {
    errors.push('Set VITE_DORA_HACKS_FREE_ASSET_ID to enable the free asset card.');
  }

  const commerceListingId = parseUnsignedBigInt(env.VITE_DORA_HACKS_COMMERCE_LISTING_ID);
  if (commerceListingId === null) {
    errors.push(
      'Set VITE_DORA_HACKS_COMMERCE_LISTING_ID to enable the USDCx commerce card.'
    );
  }

  const vaultAssetId = parseUnsignedBigInt(env.VITE_DORA_HACKS_VAULT_ASSET_ID);
  if (vaultAssetId === null) {
    errors.push('Set VITE_DORA_HACKS_VAULT_ASSET_ID to enable the sBTC vault card.');
  }

  const x402Slug = toNonEmpty(env.VITE_DORA_HACKS_X402_SLUG) ?? DEFAULT_X402_SLUG;

  return {
    coreContract,
    coreContractId: getContractId(coreContract),
    freeAssetId,
    commerce: {
      contract: commerceContract,
      contractId: getContractId(commerceContract),
      listingId: commerceListingId,
      teaserAssetId: parseUnsignedBigInt(env.VITE_DORA_HACKS_COMMERCE_ASSET_ID)
    },
    vault: {
      contract: vaultContract,
      contractId: getContractId(vaultContract),
      assetId: vaultAssetId,
      vaultId: parseUnsignedBigInt(env.VITE_DORA_HACKS_VAULT_ID),
      openAmountInput:
        toNonEmpty(env.VITE_DORA_HACKS_VAULT_OPEN_AMOUNT) ?? DEFAULT_VAULT_OPEN_AMOUNT,
      depositAmountInput:
        toNonEmpty(env.VITE_DORA_HACKS_VAULT_DEPOSIT_AMOUNT) ??
        DEFAULT_VAULT_DEPOSIT_AMOUNT
    },
    x402: {
      slug: x402Slug,
      premiumUrl: `/demo/premium/${encodeURIComponent(x402Slug)}`,
      statusUrl: '/demo/x402/status',
      sessionUrl: '/demo/x402/session'
    },
    errors
  };
};

export const DORA_HACKS_DEMO_CONFIG = buildDoraHacksDemoConfig(
  import.meta.env as DoraEnv
);
