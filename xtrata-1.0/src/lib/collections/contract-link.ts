import { validateStacksAddress } from '@stacks/transactions';

const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

export type ParsedContractPrincipal = {
  address: string;
  contractName: string;
};

export type ResolveCollectionContractLinkInput = {
  collectionId?: string | null;
  collectionSlug?: string | null;
  contractAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  deployContractAddress?: string | null;
  deployContractName?: string | null;
};

export type ResolvedCollectionContractLink = {
  address: string;
  contractName: string;
  contractId: string;
  source:
    | 'deploy'
    | 'metadata-contract-name'
    | 'metadata-contract-id'
    | 'collection-contract-id'
    | 'derived-slug-id';
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePrincipal = (value: string) => value.trim().replace(/^'+/, '');

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const normalizeSeed = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

const normalizeMintType = (value: unknown) =>
  toNullableString(value)?.toLowerCase() === 'pre-inscribed'
    ? 'pre-inscribed'
    : 'standard';

const toPrincipalAddress = (value: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = normalizePrincipal(value).toUpperCase();
  return validateStacksAddress(normalized) ? normalized : null;
};

export const parseContractPrincipal = (
  value: string | null | undefined
): ParsedContractPrincipal | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizePrincipal(value);
  const dotIndex = normalized.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= normalized.length - 1) {
    return null;
  }
  const address = normalized.slice(0, dotIndex).trim().toUpperCase();
  const contractName = normalized.slice(dotIndex + 1).trim();
  if (!validateStacksAddress(address) || !CONTRACT_NAME_PATTERN.test(contractName)) {
    return null;
  }
  return { address, contractName };
};

export const deriveExpectedContractName = (params: {
  collectionId?: string | null;
  collectionSlug?: string | null;
  mintType?: unknown;
}) => {
  const slug = normalizeSlug(params.collectionSlug ?? '');
  if (!slug) {
    return null;
  }
  const prefix =
    normalizeMintType(params.mintType) === 'pre-inscribed'
      ? 'xtrata-preinscribed'
      : 'xtrata-collection';
  const seed = normalizeSeed(params.collectionId ?? '');
  let contractName = `${prefix}-${slug}`;
  if (seed) {
    contractName = `${contractName}-${seed}`;
  }
  contractName = contractName.slice(0, 128).replace(/-+$/g, '');
  return CONTRACT_NAME_PATTERN.test(contractName) ? contractName : null;
};

export const resolveCollectionContractLink = (
  input: ResolveCollectionContractLinkInput
): ResolvedCollectionContractLink | null => {
  const metadata = input.metadata ?? null;

  const parsedCollectionContractId = parseContractPrincipal(input.contractAddress);
  const parsedMetadataContractId = parseContractPrincipal(
    toNullableString(metadata?.contractId)
  );
  const parsedMetadataContractAddress = parseContractPrincipal(
    toNullableString(metadata?.contractAddress)
  );
  const parsedDeployContractAddress = parseContractPrincipal(input.deployContractAddress);

  const resolvedAddress =
    parsedDeployContractAddress?.address ??
    parsedCollectionContractId?.address ??
    toPrincipalAddress(toNullableString(input.contractAddress)) ??
    parsedMetadataContractId?.address ??
    parsedMetadataContractAddress?.address;

  if (!resolvedAddress) {
    return null;
  }

  const deployContractName = toNullableString(input.deployContractName);
  if (deployContractName && CONTRACT_NAME_PATTERN.test(deployContractName)) {
    return {
      address: resolvedAddress,
      contractName: deployContractName,
      contractId: `${resolvedAddress}.${deployContractName}`,
      source: 'deploy'
    };
  }

  const metadataContractName = toNullableString(metadata?.contractName);
  if (metadataContractName && CONTRACT_NAME_PATTERN.test(metadataContractName)) {
    return {
      address: resolvedAddress,
      contractName: metadataContractName,
      contractId: `${resolvedAddress}.${metadataContractName}`,
      source: 'metadata-contract-name'
    };
  }

  if (parsedMetadataContractId?.contractName) {
    return {
      address: resolvedAddress,
      contractName: parsedMetadataContractId.contractName,
      contractId: `${resolvedAddress}.${parsedMetadataContractId.contractName}`,
      source: 'metadata-contract-id'
    };
  }

  if (parsedCollectionContractId?.contractName) {
    return {
      address: resolvedAddress,
      contractName: parsedCollectionContractId.contractName,
      contractId: `${resolvedAddress}.${parsedCollectionContractId.contractName}`,
      source: 'collection-contract-id'
    };
  }

  const derivedContractName = deriveExpectedContractName({
    collectionId: input.collectionId,
    collectionSlug: input.collectionSlug,
    mintType: metadata?.mintType
  });
  if (!derivedContractName) {
    return null;
  }

  return {
    address: resolvedAddress,
    contractName: derivedContractName,
    contractId: `${resolvedAddress}.${derivedContractName}`,
    source: 'derived-slug-id'
  };
};
