import { validateStacksAddress } from '@stacks/transactions';
import { getContractId } from './config.js';
import type { NetworkType, SdkContractRegistryEntry } from './types.js';
import {
  normalizeDependencyIds,
  parseDependencyInput,
  validateDependencyIds
} from './mint.js';

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
  artistBps: 9500,
  marketplaceBps: 250,
  operatorBps: 250,
  pausedByDefault: true
} as const;

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;
const UINT_PATTERN = /^\d+$/;
const STX_DECIMAL_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const SYMBOL_PATTERN = /^[A-Z0-9-]{1,16}$/;
const CONTRACT_ID_PATTERN = /^[A-Z0-9]+\.[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

const isV2Entry = (entry: SdkContractRegistryEntry) =>
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

export const deriveArtistContractName = (params: {
  collectionName: string;
  mintType: ArtistMintType;
  seed: string;
}) => {
  const prefix =
    params.mintType === 'pre-inscribed'
      ? 'xtrata-preinscribed'
      : 'xtrata-collection';
  const slug = deriveArtistCollectionSlug(params.collectionName)
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const seed = params.seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

  let name = `${prefix}-${slug}`;
  if (seed) {
    name = `${name}-${seed}`;
  }

  name = name.slice(0, 128).replace(/-+$/g, '');
  if (!CONTRACT_NAME_PATTERN.test(name)) {
    return `${prefix}-deploy`.slice(0, 128);
  }
  return name;
};

export const resolveArtistDeployCoreTarget = (
  network: NetworkType,
  registry: readonly SdkContractRegistryEntry[]
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
  const description = params.input.description.trim();
  const mintType = params.input.mintType;
  const artistAddress = params.input.artistAddress.trim();
  const marketplaceAddress = params.input.marketplaceAddress.trim();
  const operatorAddress = params.operatorAddress.trim();

  const mintPriceMicroStx = toMicroStx(params.input.mintPriceStx);
  if (mintPriceMicroStx === null) {
    errors.push('Mint price must be a valid STX amount (up to 6 decimals).');
  }

  const parsedParentDependencies = parseDependencyInput(
    params.input.parentInscriptions ?? ''
  );
  if (parsedParentDependencies.invalidTokens.length > 0) {
    errors.push(
      `Parent inscriptions must be numeric token IDs only: ${parsedParentDependencies.invalidTokens.join(
        ', '
      )}.`
    );
  }
  const defaultDependencyIds = normalizeDependencyIds(parsedParentDependencies.ids);
  const parentValidation = validateDependencyIds(defaultDependencyIds);
  if (!parentValidation.ok) {
    if (parentValidation.reason === 'max-50') {
      errors.push('Parent inscriptions allow up to 50 token IDs.');
    } else {
      errors.push('Parent inscriptions are invalid.');
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
  }

  if (!validateStacksAddress(artistAddress)) {
    errors.push('Artist recipient must be a valid Stacks address.');
  }
  if (!validateStacksAddress(marketplaceAddress)) {
    errors.push('Marketplace recipient must be a valid Stacks address.');
  }
  if (!validateStacksAddress(operatorAddress)) {
    errors.push('Operator recipient must be a valid Stacks address.');
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

  if (errors.length > 0) {
    return {
      source: templateSource,
      resolved,
      errors,
      warnings
    };
  }

  let source = templateSource;

  source = replaceLine({
    source,
    marker: 'ALLOWED-XTRATA-CONTRACT',
    pattern: /^\(define-constant ALLOWED-XTRATA-CONTRACT '.*\)$/m,
    replacement: `(define-constant ALLOWED-XTRATA-CONTRACT '${params.coreContractId})`,
    errors
  });

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

  source = replaceLine({
    source,
    marker: 'artist-recipient',
    pattern: /^\(define-data-var artist-recipient principal '.*\)$/m,
    replacement: `(define-data-var artist-recipient principal '${resolved.artistAddress})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'marketplace-recipient',
    pattern: /^\(define-data-var marketplace-recipient principal '.*\)$/m,
    replacement: `(define-data-var marketplace-recipient principal '${resolved.marketplaceAddress})`,
    errors
  });

  source = replaceLine({
    source,
    marker: 'operator-recipient',
    pattern: /^\(define-data-var operator-recipient principal '.*\)$/m,
    replacement: `(define-data-var operator-recipient principal '${resolved.operatorAddress})`,
    errors
  });

  const dependenciesLiteral =
    resolved.defaultDependencyIds.length > 0
      ? `(list ${resolved.defaultDependencyIds.map((value) => `u${value.toString()}`).join(' ')})`
      : '(list)';

  source = replaceLine({
    source,
    marker: 'default-dependencies',
    pattern: /^\(define-data-var default-dependencies \(list 50 uint\) \(list(?: [^)]*)?\)\)$/m,
    replacement: `(define-data-var default-dependencies (list 50 uint) ${dependenciesLiteral})`,
    errors
  });

  if (resolved.defaultDependencyIds.length > 0) {
    warnings.push(
      'Parent dependencies were set. Batch seal is disabled when default dependencies are present.'
    );
  }

  return {
    source,
    resolved,
    errors,
    warnings
  };
};
