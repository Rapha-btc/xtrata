import { validateStacksAddress } from '@stacks/transactions';
import { getContractId } from '../contract/config';
import {
  CONTRACT_REGISTRY,
  type ContractRegistryEntry
} from '../contract/registry';
import type { NetworkType } from '../network/types';
import {
  normalizeDependencyIds,
  parseDependencyInput,
  validateDependencyIds
} from '../mint/dependencies';

export type ArtistMintType = 'standard' | 'pre-inscribed';

export type ArtistDeployInput = {
  collectionName: string;
  symbol: string;
  description: string;
  supply: string;
  mintType: ArtistMintType;
  mintPriceStx: string;
  artistAddress: string;
  marketplaceAddress: string;
  parentInscriptions?: string;
};

export type ArtistDeployTemplateSources = {
  standardSource: string;
  preinscribedSource: string;
};

export type ArtistDeployCoreTarget = {
  address: string;
  contractId: string;
  network: NetworkType;
};

export type ArtistDeployResolvedInput = {
  collectionName: string;
  symbol: string;
  description: string;
  supply: bigint;
  mintType: ArtistMintType;
  mintPriceMicroStx: bigint;
  artistAddress: string;
  marketplaceAddress: string;
  operatorAddress: string;
  defaultDependencyIds: bigint[];
};

export type ArtistDeployBuildResult = {
  source: string;
  resolved: ArtistDeployResolvedInput;
  errors: string[];
  warnings: string[];
};

export const ARTIST_DEPLOY_DEFAULTS = {
  royaltyTotalBps: 500,
  artistBps: 9500,
  marketplaceBps: 250,
  operatorBps: 250,
  pausedByDefault: true
} as const;

export const resolveArtistDeployPayoutSplits = (mintPriceMicroStx: bigint) => {
  if (mintPriceMicroStx === 0n) {
    return {
      artistBps: 0,
      marketplaceBps: 0,
      operatorBps: 0
    };
  }
  return {
    artistBps: ARTIST_DEPLOY_DEFAULTS.artistBps,
    marketplaceBps: ARTIST_DEPLOY_DEFAULTS.marketplaceBps,
    operatorBps: ARTIST_DEPLOY_DEFAULTS.operatorBps
  };
};

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;
const UINT_PATTERN = /^\d+$/;
const STX_DECIMAL_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const SYMBOL_PATTERN = /^[A-Z0-9-]{1,16}$/;
const CONTRACT_ID_PATTERN = /^[A-Z0-9]+\.[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const MAX_NEW_CONTRACT_NAME_LENGTH = 40;
const ASCII_DESCRIPTION_NORMALIZATION_REPLACEMENTS: ReadonlyArray<
  readonly [RegExp, string]
> = [
  [/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"'],
  [/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2022\u2023\u25E6\u2043\u2219]/g, '-'],
  [/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
  [/[\u200B-\u200D\u2060\uFEFF]/g, ''],
  [/[\r\n\t]+/g, ' '],
  [/ß/g, 'ss'],
  [/[Ææ]/g, 'ae'],
  [/[Œœ]/g, 'oe'],
  [/[Øø]/g, 'o'],
  [/[Ðð]/g, 'd'],
  [/[Þþ]/g, 'th'],
  [/[Łł]/g, 'l']
];

const isV2Entry = (entry: ContractRegistryEntry) =>
  entry.protocolVersion === '2.1.0' ||
  entry.protocolVersion === '2.1.1' ||
  entry.contractName.toLowerCase().includes('v2-1-0') ||
  entry.contractName.toLowerCase().includes('v2-1-1');

const escapeClarityAscii = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const replaceLine = (params: {
  source: string;
  marker: string;
  pattern: RegExp;
  replacement: string;
  errors: string[];
}) => {
  if (!params.pattern.test(params.source)) {
    params.errors.push(`Template marker missing: ${params.marker}`);
    return params.source;
  }
  return params.source.replace(params.pattern, params.replacement);
};

const toMicroStx = (value: string): bigint | null => {
  const trimmed = value.trim();
  if (!trimmed || !STX_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  const whole = BigInt(wholePart);
  const fractional = BigInt((fractionalPart + '000000').slice(0, 6));
  return whole * 1_000_000n + fractional;
};

export const deriveArtistCollectionSymbol = (collectionName: string) => {
  const normalized = collectionName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!normalized) {
    return 'XTRATA';
  }
  return normalized.slice(0, 16);
};

export const deriveArtistCollectionSlug = (collectionName: string) => {
  const normalized = collectionName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!normalized) {
    return 'xtrata-collection';
  }
  const shortened = normalized.slice(0, 64).replace(/-+$/g, '');
  if (shortened.length >= 3) {
    return shortened;
  }
  return `xtrata-${shortened}`.slice(0, 64);
};

export const normalizeArtistDeployDescription = (value: string) => {
  let normalized = value.replace(/\r\n?/g, '\n').normalize('NFKD');
  ASCII_DESCRIPTION_NORMALIZATION_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized.replace(/[^\x20-\x7E]/g, '').replace(/ {2,}/g, ' ').trim();
};

export const deriveArtistContractName = (params: {
  collectionName: string;
  mintType: ArtistMintType;
  seed: string;
  slug?: string;
}) => {
  const prefix =
    params.mintType === 'pre-inscribed'
      ? 'xtrata-preinscribed'
      : 'xtrata-collection';
  const slugSource = (params.slug ?? params.collectionName).trim();
  const slug = deriveArtistCollectionSlug(slugSource)
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const seed = params.seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const suffix = seed.length > 0 ? `-${seed}` : '';
  const maxBaseLength = MAX_NEW_CONTRACT_NAME_LENGTH - suffix.length;
  const baseCandidate = `${prefix}-${slug}`.replace(/-+$/g, '');
  let base = baseCandidate.slice(0, Math.max(1, maxBaseLength)).replace(/-+$/g, '');
  if (!base) {
    base = prefix.slice(0, Math.max(1, maxBaseLength)).replace(/-+$/g, '');
  }
  let name = `${base}${suffix}`.slice(0, MAX_NEW_CONTRACT_NAME_LENGTH).replace(/-+$/g, '');
  if (!CONTRACT_NAME_PATTERN.test(name)) {
    name = `${prefix}-deploy`
      .slice(0, MAX_NEW_CONTRACT_NAME_LENGTH)
      .replace(/-+$/g, '');
  }
  return name;
};

export const resolveArtistDeployCoreTarget = (
  network: NetworkType,
  registry: readonly ContractRegistryEntry[] = CONTRACT_REGISTRY
): ArtistDeployCoreTarget | null => {
  const candidate = registry.find(
    (entry) => entry.network === network && isV2Entry(entry)
  );
  if (!candidate) {
    return null;
  }
  return {
    address: candidate.address,
    contractId: getContractId(candidate),
    network: candidate.network
  };
};

export const buildArtistDeployContractSource = (params: {
  input: ArtistDeployInput;
  templateSources: ArtistDeployTemplateSources;
  coreContractId: string;
  operatorAddress: string;
}): ArtistDeployBuildResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const collectionName = params.input.collectionName.trim();
  const symbolInput = params.input.symbol.trim().toUpperCase();
  const symbol = symbolInput || deriveArtistCollectionSymbol(collectionName);
  const descriptionInput = params.input.description.trim();
  const description = normalizeArtistDeployDescription(descriptionInput);
  const mintType = params.input.mintType;
  const artistAddress = params.input.artistAddress.trim();
  const marketplaceAddress = params.input.marketplaceAddress.trim();
  const operatorAddress = params.operatorAddress.trim();

  if (description !== descriptionInput) {
    warnings.push(
      'Description was normalized to printable ASCII for contract compatibility.'
    );
  }

  const mintPriceMicroStx = toMicroStx(params.input.mintPriceStx);
  if (mintPriceMicroStx === null) {
    errors.push('Mint price must be a valid STX amount (up to 6 decimals).');
  }

  const parsedParentDependencies = parseDependencyInput(
    params.input.parentInscriptions ?? ''
  );
  if (parsedParentDependencies.invalidTokens.length > 0) {
    errors.push(
      `Dependency inscriptions must be numeric token IDs only: ${parsedParentDependencies.invalidTokens.join(
        ', '
      )}.`
    );
  }
  const defaultDependencyIds = normalizeDependencyIds(parsedParentDependencies.ids);
  const parentValidation = validateDependencyIds(defaultDependencyIds);
  if (!parentValidation.ok) {
    if (parentValidation.reason === 'max-50') {
      errors.push('Dependency inscriptions allow up to 50 token IDs.');
    } else {
      errors.push('Dependency inscriptions are invalid.');
    }
  }

  const supply = UINT_PATTERN.test(params.input.supply.trim())
    ? BigInt(params.input.supply.trim())
    : null;
  if (supply === null || supply <= 0n) {
    errors.push('Supply must be a whole number greater than zero.');
  }

  if (!collectionName) {
    errors.push('Collection name is required.');
  }
  if (collectionName.length > 64) {
    errors.push('Collection name must be 64 characters or fewer.');
  }
  if (!PRINTABLE_ASCII_PATTERN.test(collectionName)) {
    errors.push('Collection name must use printable ASCII only.');
  }

  if (!SYMBOL_PATTERN.test(symbol)) {
    errors.push('Symbol must use 1-16 uppercase letters, numbers, or hyphens.');
  }

  if (description.length > 256) {
    errors.push('Description must be 256 characters or fewer.');
  }
  if (!PRINTABLE_ASCII_PATTERN.test(description)) {
    errors.push('Description must use printable ASCII only.');
  }

  if (!CONTRACT_ID_PATTERN.test(params.coreContractId)) {
    errors.push('Core contract ID is invalid.');
  } else {
    const [addressPart, contractName = ''] = params.coreContractId.split('.');
    if (!validateStacksAddress(addressPart) || !CONTRACT_NAME_PATTERN.test(contractName)) {
      errors.push('Core contract ID must include a valid address and contract name.');
    }
  }

  if (!validateStacksAddress(artistAddress)) {
    errors.push('Artist payout address must be a valid Stacks address.');
  }

  if (!validateStacksAddress(marketplaceAddress)) {
    errors.push('Marketplace payout address must be a valid Stacks address.');
  }

  if (!validateStacksAddress(operatorAddress)) {
    errors.push('Operator payout address is invalid.');
  }

  const templateSource =
    mintType === 'pre-inscribed'
      ? params.templateSources.preinscribedSource
      : params.templateSources.standardSource;

  const resolved: ArtistDeployResolvedInput = {
    collectionName,
    symbol,
    description,
    supply: supply ?? 0n,
    mintType,
    mintPriceMicroStx: mintPriceMicroStx ?? 0n,
    artistAddress,
    marketplaceAddress,
    operatorAddress,
    defaultDependencyIds
  };
  const payoutSplits = resolveArtistDeployPayoutSplits(resolved.mintPriceMicroStx);

  if (errors.length > 0) {
    return {
      source: templateSource,
      resolved,
      errors,
      warnings
    };
  }

  if (mintType === 'pre-inscribed') {
    warnings.push(
      'Pre-inscribed sale uses inventory deposits; supply is treated as an off-chain launch target.'
    );
  }

  let source = templateSource;

  source = replaceLine({
    source,
    marker: 'ALLOWED-XTRATA-CONTRACT',
    pattern: /^\(define-constant ALLOWED-XTRATA-CONTRACT [^)]+\)$/m,
    replacement: `(define-constant ALLOWED-XTRATA-CONTRACT '${params.coreContractId})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'artist-recipient',
    pattern: /^\(define-data-var artist-recipient principal [^)]+\)$/m,
    replacement: `(define-data-var artist-recipient principal '${resolved.artistAddress})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'marketplace-recipient',
    pattern: /^\(define-data-var marketplace-recipient principal [^)]+\)$/m,
    replacement: `(define-data-var marketplace-recipient principal '${resolved.marketplaceAddress})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'operator-recipient',
    pattern: /^\(define-data-var operator-recipient principal [^)]+\)$/m,
    replacement: `(define-data-var operator-recipient principal '${resolved.operatorAddress})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'artist-bps',
    pattern: /^\(define-data-var artist-bps uint u\d+\)$/m,
    replacement: `(define-data-var artist-bps uint u${payoutSplits.artistBps.toString()})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'marketplace-bps',
    pattern: /^\(define-data-var marketplace-bps uint u\d+\)$/m,
    replacement: `(define-data-var marketplace-bps uint u${payoutSplits.marketplaceBps.toString()})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'operator-bps',
    pattern: /^\(define-data-var operator-bps uint u\d+\)$/m,
    replacement: `(define-data-var operator-bps uint u${payoutSplits.operatorBps.toString()})`,
    errors
  });

  if (mintType === 'standard') {
    source = replaceLine({
      source,
      marker: 'mint-price',
      pattern: /^\(define-data-var mint-price uint u\d+\)$/m,
      replacement: `(define-data-var mint-price uint u${resolved.mintPriceMicroStx.toString()})`,
      errors
    });

    source = replaceLine({
      source,
      marker: 'max-supply',
      pattern: /^\(define-data-var max-supply uint u\d+\)$/m,
      replacement: `(define-data-var max-supply uint u${resolved.supply.toString()})`,
      errors
    });

    source = replaceLine({
      source,
      marker: 'collection-name',
      pattern: /^\(define-data-var collection-name \(string-ascii 64\) ".*"\)$/m,
      replacement: `(define-data-var collection-name (string-ascii 64) "${escapeClarityAscii(
        resolved.collectionName
      )}")`,
      errors
    });

    source = replaceLine({
      source,
      marker: 'collection-symbol',
      pattern: /^\(define-data-var collection-symbol \(string-ascii 16\) ".*"\)$/m,
      replacement: `(define-data-var collection-symbol (string-ascii 16) "${escapeClarityAscii(
        resolved.symbol
      )}")`,
      errors
    });

    source = replaceLine({
      source,
      marker: 'collection-description',
      pattern: /^\(define-data-var collection-description \(string-ascii 256\) ".*"\)$/m,
      replacement: `(define-data-var collection-description (string-ascii 256) "${escapeClarityAscii(
        resolved.description
      )}")`,
      errors
    });

    const dependencyLiteral =
      resolved.defaultDependencyIds.length === 0
        ? '(list)'
        : `(list ${resolved.defaultDependencyIds
            .map((id) => `u${id.toString()}`)
            .join(' ')})`;
    source = replaceLine({
      source,
      marker: 'default-dependencies',
      pattern: /^\(define-data-var default-dependencies \(list 50 uint\) .+\)$/m,
      replacement: `(define-data-var default-dependencies (list 50 uint) ${dependencyLiteral})`,
      errors
    });
  } else {
    source = replaceLine({
      source,
      marker: 'price',
      pattern: /^\(define-data-var price uint u\d+\)$/m,
      replacement: `(define-data-var price uint u${resolved.mintPriceMicroStx.toString()})`,
      errors
    });
  }

  return {
    source,
    resolved,
    errors,
    warnings
  };
};
