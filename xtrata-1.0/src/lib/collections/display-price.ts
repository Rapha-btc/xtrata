const MICROSTX_PER_STX = 1_000_000n;
const STX_DECIMAL_PATTERN = /^\d+(?:\.\d{0,6})?$/;

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

const toBigIntOrNull = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
};

export const parseStxToMicroStx = (value: unknown): bigint | null => {
  const text = toText(value);
  if (!text || !STX_DECIMAL_PATTERN.test(text)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = text.split('.');
  const whole = BigInt(wholePart);
  const fractional = BigInt((fractionalPart + '000000').slice(0, 6));
  return whole * MICROSTX_PER_STX + fractional;
};

export type MetadataDisplayMintPrice = {
  microStx: bigint | null;
  source: 'collection-page-override' | 'price-absorption' | 'none';
};

const resolveAbsorbedAdvertisedMintPrice = (
  collection: Record<string, unknown> | null
) => {
  const priceAbsorption = toRecord(collection?.priceAbsorption);
  if (toBoolean(priceAbsorption?.enabled) !== true) {
    return null;
  }

  const absorbedAdvertisedMicroStx = toBigIntOrNull(
    priceAbsorption?.advertisedMintPriceMicroStx
  );
  if (absorbedAdvertisedMicroStx !== null && absorbedAdvertisedMicroStx >= 0n) {
    return absorbedAdvertisedMicroStx;
  }

  const absorbedAdvertisedStx = parseStxToMicroStx(
    priceAbsorption?.advertisedMintPriceStx
  );
  if (absorbedAdvertisedStx !== null) {
    return absorbedAdvertisedStx;
  }

  const absorbedCollectionMicroStx = toBigIntOrNull(collection?.mintPriceMicroStx);
  if (absorbedCollectionMicroStx !== null && absorbedCollectionMicroStx >= 0n) {
    return absorbedCollectionMicroStx;
  }

  return parseStxToMicroStx(collection?.mintPriceStx);
};

export const resolveMetadataDisplayMintPrice = (
  metadata: unknown
): MetadataDisplayMintPrice => {
  const metadataRecord = toRecord(metadata);
  const collection = toRecord(metadataRecord?.collection);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  const absorbedDisplayMicroStx = resolveAbsorbedAdvertisedMintPrice(collection);

  const mode = toText(collectionPage?.displayMintPriceMode).toLowerCase();
  if (mode === 'override') {
    const overridePriceText =
      toText(collectionPage?.displayMintPriceStx) || toText(collection?.mintPriceStx);
    const overrideMicroStx = parseStxToMicroStx(overridePriceText);
    if (overrideMicroStx !== null) {
      return {
        microStx: overrideMicroStx,
        source: 'collection-page-override'
      };
    }
    return {
      microStx: null,
      source: 'none'
    };
  }
  if (mode === 'on-chain') {
    if (absorbedDisplayMicroStx !== null) {
      return {
        microStx: absorbedDisplayMicroStx,
        source: 'price-absorption'
      };
    }
    return {
      microStx: null,
      source: 'none'
    };
  }

  if (absorbedDisplayMicroStx !== null) {
    return {
      microStx: absorbedDisplayMicroStx,
      source: 'price-absorption'
    };
  }

  return {
    microStx: null,
    source: 'none'
  };
};
