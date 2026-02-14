import { getDefaultStorage, type StorageLike } from '../wallet/storage';

export const COLLECTION_TEMPLATE_FIELD_KEYS = [
  'coreContract',
  'defaultPaused',
  'defaultMintPriceStx',
  'defaultMaxSupply',
  'defaultAllowlistEnabled',
  'defaultMaxPerWallet',
  'reservationExpiryBlocks',
  'collectionName',
  'collectionSymbol',
  'collectionBaseUri',
  'collectionDescription',
  'defaultTokenUri'
] as const;

export type CollectionTemplateFieldKey = (typeof COLLECTION_TEMPLATE_FIELD_KEYS)[number];

export type CollectionTemplateDraft = {
  coreContract: string;
  defaultPaused: boolean;
  defaultMintPriceStx: string;
  defaultMaxSupply: string;
  defaultAllowlistEnabled: boolean;
  defaultMaxPerWallet: string;
  reservationExpiryBlocks: string;
  collectionName: string;
  collectionSymbol: string;
  collectionBaseUri: string;
  collectionDescription: string;
  defaultTokenUri: string;
};

export type CollectionTemplatePolicy = {
  locked: boolean;
  editableFields: Record<CollectionTemplateFieldKey, boolean>;
  defaults: CollectionTemplateDraft;
  updatedAt: string;
};

export type CollectionTemplateBuildResult = {
  source: string;
  resolvedDraft: CollectionTemplateDraft;
  errors: string[];
  warnings: string[];
};

export const COLLECTION_TEMPLATE_POLICY_STORAGE_KEY_PREFIX =
  'xtrata.v15.1.collection-template-policy.';

const ASCII_PRINTABLE_PATTERN = /^[\x20-\x7E]*$/;
const UINT_PATTERN = /^\d+$/;
const STX_DECIMAL_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const CONTRACT_ID_PATTERN = /^[A-Z0-9]+\.[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;
const CONTRACT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-_]{0,127}$/;

const replaceLine = (params: {
  source: string;
  pattern: RegExp;
  replacement: string;
  marker: string;
  errors: string[];
}) => {
  if (!params.pattern.test(params.source)) {
    params.errors.push(`Template marker missing: ${params.marker}`);
    return params.source;
  }
  return params.source.replace(params.pattern, params.replacement);
};

const escapeClarityAscii = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const toMicroStx = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!STX_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  const whole = BigInt(wholePart);
  const padded = (fractionalPart + '000000').slice(0, 6);
  const fractional = BigInt(padded);
  return whole * 1_000_000n + fractional;
};

const toEditableFields = (value: boolean) =>
  COLLECTION_TEMPLATE_FIELD_KEYS.reduce(
    (acc, key) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<CollectionTemplateFieldKey, boolean>
  );

export const getCollectionTemplatePolicyStorageKey = (contractId: string) =>
  `${COLLECTION_TEMPLATE_POLICY_STORAGE_KEY_PREFIX}${contractId}`;

export const createDefaultCollectionTemplateDraft = (
  coreContractId: string
): CollectionTemplateDraft => ({
  coreContract: coreContractId,
  defaultPaused: true,
  defaultMintPriceStx: '0',
  defaultMaxSupply: '0',
  defaultAllowlistEnabled: false,
  defaultMaxPerWallet: '0',
  reservationExpiryBlocks: '1440',
  collectionName: '',
  collectionSymbol: '',
  collectionBaseUri: '',
  collectionDescription: '',
  defaultTokenUri: 'data:text/plain,xtrata-collection-default'
});

export const createDefaultCollectionTemplatePolicy = (
  coreContractId: string
): CollectionTemplatePolicy => ({
  locked: true,
  editableFields: {
    ...toEditableFields(false),
    defaultMintPriceStx: true,
    defaultMaxSupply: true,
    defaultMaxPerWallet: true,
    defaultAllowlistEnabled: true,
    collectionName: true,
    collectionSymbol: true,
    collectionBaseUri: true,
    collectionDescription: true,
    defaultTokenUri: true
  },
  defaults: createDefaultCollectionTemplateDraft(coreContractId),
  updatedAt: new Date().toISOString()
});

const normalizeDraft = (
  draft: CollectionTemplateDraft,
  fallbackCoreContractId: string
): CollectionTemplateDraft => ({
  coreContract: draft.coreContract.trim() || fallbackCoreContractId,
  defaultPaused: !!draft.defaultPaused,
  defaultMintPriceStx: draft.defaultMintPriceStx.trim() || '0',
  defaultMaxSupply: draft.defaultMaxSupply.trim() || '0',
  defaultAllowlistEnabled: !!draft.defaultAllowlistEnabled,
  defaultMaxPerWallet: draft.defaultMaxPerWallet.trim() || '0',
  reservationExpiryBlocks: draft.reservationExpiryBlocks.trim() || '1440',
  collectionName: draft.collectionName.trim(),
  collectionSymbol: draft.collectionSymbol.trim(),
  collectionBaseUri: draft.collectionBaseUri.trim(),
  collectionDescription: draft.collectionDescription.trim(),
  defaultTokenUri: draft.defaultTokenUri.trim() || 'data:text/plain,xtrata-collection-default'
});

const normalizePolicy = (
  policy: CollectionTemplatePolicy,
  coreContractId: string
): CollectionTemplatePolicy => {
  const defaults = normalizeDraft(policy.defaults, coreContractId);
  const editableFields = COLLECTION_TEMPLATE_FIELD_KEYS.reduce(
    (acc, key) => {
      acc[key] = Boolean(policy.editableFields?.[key]);
      return acc;
    },
    {} as Record<CollectionTemplateFieldKey, boolean>
  );
  return {
    locked: Boolean(policy.locked),
    editableFields,
    defaults,
    updatedAt: policy.updatedAt || new Date().toISOString()
  };
};

export const resolveTemplateDraft = (params: {
  draft: CollectionTemplateDraft;
  policy: CollectionTemplatePolicy;
  fallbackCoreContractId: string;
}) => {
  const normalizedDraft = normalizeDraft(params.draft, params.fallbackCoreContractId);
  const normalizedPolicy = normalizePolicy(
    params.policy,
    params.fallbackCoreContractId
  );
  const resolved = { ...normalizedDraft };
  COLLECTION_TEMPLATE_FIELD_KEYS.forEach((key) => {
    if (normalizedPolicy.locked && !normalizedPolicy.editableFields[key]) {
      resolved[key] = normalizedPolicy.defaults[key] as never;
    }
  });
  return resolved;
};

export const buildCollectionMintContractSource = (params: {
  templateSource: string;
  draft: CollectionTemplateDraft;
  policy: CollectionTemplatePolicy;
  fallbackCoreContractId: string;
}): CollectionTemplateBuildResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolvedDraft = resolveTemplateDraft({
    draft: params.draft,
    policy: params.policy,
    fallbackCoreContractId: params.fallbackCoreContractId
  });

  if (!CONTRACT_ID_PATTERN.test(resolvedDraft.coreContract)) {
    errors.push('Core contract ID must be in the form SP...contract-name.');
  } else {
    const [addressPart, namePart = ''] = resolvedDraft.coreContract.split('.');
    if (addressPart.length < 10 || !CONTRACT_NAME_PATTERN.test(namePart)) {
      errors.push('Core contract ID format is invalid.');
    }
  }

  const mintPriceMicroStx = toMicroStx(resolvedDraft.defaultMintPriceStx);
  if (mintPriceMicroStx === null) {
    errors.push('Default mint price must be a valid STX amount (up to 6 decimals).');
  }

  const maxSupply = UINT_PATTERN.test(resolvedDraft.defaultMaxSupply)
    ? BigInt(resolvedDraft.defaultMaxSupply)
    : null;
  if (maxSupply === null) {
    errors.push('Default max supply must be a whole number.');
  }

  const maxPerWallet = UINT_PATTERN.test(resolvedDraft.defaultMaxPerWallet)
    ? BigInt(resolvedDraft.defaultMaxPerWallet)
    : null;
  if (maxPerWallet === null) {
    errors.push('Default max per wallet must be a whole number.');
  }

  const reservationExpiryBlocks = UINT_PATTERN.test(
    resolvedDraft.reservationExpiryBlocks
  )
    ? BigInt(resolvedDraft.reservationExpiryBlocks)
    : null;
  if (reservationExpiryBlocks === null || reservationExpiryBlocks <= 0n) {
    errors.push('Reservation expiry must be a positive whole number.');
  }

  const validateAscii = (value: string, maxLength: number, label: string) => {
    if (!ASCII_PRINTABLE_PATTERN.test(value)) {
      errors.push(`${label} must use printable ASCII characters only.`);
    }
    if (value.length > maxLength) {
      errors.push(`${label} must be ${maxLength} characters or fewer.`);
    }
  };

  validateAscii(resolvedDraft.collectionName, 64, 'Collection name');
  validateAscii(resolvedDraft.collectionSymbol, 16, 'Collection symbol');
  validateAscii(resolvedDraft.collectionBaseUri, 256, 'Collection base URI');
  validateAscii(resolvedDraft.collectionDescription, 256, 'Collection description');
  validateAscii(resolvedDraft.defaultTokenUri, 256, 'Default token URI');

  if (params.policy.locked) {
    const lockedFields = COLLECTION_TEMPLATE_FIELD_KEYS.filter(
      (key) => !params.policy.editableFields[key]
    );
    if (lockedFields.length > 0) {
      warnings.push(
        `Template lock is active. ${lockedFields.length} field${lockedFields.length === 1 ? '' : 's'} use policy defaults.`
      );
    }
  }

  if (errors.length > 0) {
    return {
      source: params.templateSource,
      resolvedDraft,
      errors,
      warnings
    };
  }

  let source = params.templateSource;

  source = replaceLine({
    source,
    pattern: /^\(define-constant ALLOWED-XTRATA-CONTRACT '.*\)$/m,
    replacement: `(define-constant ALLOWED-XTRATA-CONTRACT '${resolvedDraft.coreContract})`,
    marker: 'ALLOWED-XTRATA-CONTRACT',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var paused bool (true|false)\)$/m,
    replacement: `(define-data-var paused bool ${resolvedDraft.defaultPaused ? 'true' : 'false'})`,
    marker: 'paused',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var mint-price uint u\d+\)$/m,
    replacement: `(define-data-var mint-price uint u${mintPriceMicroStx?.toString() ?? '0'})`,
    marker: 'mint-price',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var max-supply uint u\d+\)$/m,
    replacement: `(define-data-var max-supply uint u${maxSupply?.toString() ?? '0'})`,
    marker: 'max-supply',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var allowlist-enabled bool (true|false)\)$/m,
    replacement: `(define-data-var allowlist-enabled bool ${resolvedDraft.defaultAllowlistEnabled ? 'true' : 'false'})`,
    marker: 'allowlist-enabled',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var max-per-wallet uint u\d+\)$/m,
    replacement: `(define-data-var max-per-wallet uint u${maxPerWallet?.toString() ?? '0'})`,
    marker: 'max-per-wallet',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var reservation-expiry-blocks uint u\d+\)$/m,
    replacement: `(define-data-var reservation-expiry-blocks uint u${reservationExpiryBlocks?.toString() ?? '1440'})`,
    marker: 'reservation-expiry-blocks',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var collection-name \(string-ascii 64\) ".*"\)$/m,
    replacement: `(define-data-var collection-name (string-ascii 64) "${escapeClarityAscii(resolvedDraft.collectionName)}")`,
    marker: 'collection-name',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var collection-symbol \(string-ascii 16\) ".*"\)$/m,
    replacement: `(define-data-var collection-symbol (string-ascii 16) "${escapeClarityAscii(resolvedDraft.collectionSymbol)}")`,
    marker: 'collection-symbol',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var collection-base-uri \(string-ascii 256\) ".*"\)$/m,
    replacement: `(define-data-var collection-base-uri (string-ascii 256) "${escapeClarityAscii(resolvedDraft.collectionBaseUri)}")`,
    marker: 'collection-base-uri',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var collection-description \(string-ascii 256\) ".*"\)$/m,
    replacement: `(define-data-var collection-description (string-ascii 256) "${escapeClarityAscii(resolvedDraft.collectionDescription)}")`,
    marker: 'collection-description',
    errors
  });

  source = replaceLine({
    source,
    pattern: /^\(define-data-var default-token-uri \(string-ascii 256\) [^)]+\)$/m,
    replacement: `(define-data-var default-token-uri (string-ascii 256) "${escapeClarityAscii(resolvedDraft.defaultTokenUri)}")`,
    marker: 'default-token-uri',
    errors
  });

  return {
    source,
    resolvedDraft,
    errors,
    warnings
  };
};

export const createCollectionTemplatePolicyStore = (
  contractId: string,
  storage: StorageLike = getDefaultStorage()
) => {
  const storageKey = getCollectionTemplatePolicyStorageKey(contractId);
  return {
    load: (): CollectionTemplatePolicy | null => {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as CollectionTemplatePolicy;
        return normalizePolicy(parsed, contractId);
      } catch {
        return null;
      }
    },
    save: (policy: CollectionTemplatePolicy) => {
      const normalized = normalizePolicy(policy, contractId);
      storage.setItem(storageKey, JSON.stringify(normalized));
    },
    reset: () => {
      storage.removeItem(storageKey);
    }
  };
};
