const DECIMAL_AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

export const parseDecimalAmount = (
  raw: string,
  decimals: number,
  allowZero = false
): bigint | null => {
  const trimmed = raw.trim();
  if (!trimmed || !DECIMAL_AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  const [wholePart, fractionalPartRaw = ''] = trimmed.split('.');
  if (fractionalPartRaw.length > decimals) {
    return null;
  }
  const base = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart);
  const fractional =
    fractionalPartRaw.length > 0
      ? BigInt(fractionalPartRaw.padEnd(decimals, '0'))
      : 0n;
  const amount = whole * base + fractional;
  if (!allowZero && amount <= 0n) {
    return null;
  }
  if (allowZero && amount < 0n) {
    return null;
  }
  return amount;
};

export const formatDecimalAmount = (value: bigint, decimals: number) => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('decimals must be a non-negative integer');
  }
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? value * -1n : value;
  if (decimals === 0) {
    return `${sign}${absolute.toString()}`;
  }
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fractional = (absolute % base).toString().padStart(decimals, '0');
  return `${sign}${whole.toString()}.${fractional}`;
};
