import { isRateLimitError } from '../contract/read-only';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  if (!error) {
    return 'Unknown error';
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const normalizeErrorMessage = (message: string) =>
  message.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const matchesAny = (messages: string[], patterns: RegExp[]) =>
  messages.some((message) => patterns.some((pattern) => pattern.test(message)));

const INVALID_RESPONSE_PATTERNS = [
  /<!doctype/,
  /<html/,
  /unexpected token </,
  /invalid json/,
  /unexpected end of json/
];

const SERVER_ERROR_PATTERNS = [
  /\b5\d\d\b/,
  /internal server error/,
  /bad gateway/,
  /service unavailable/,
  /gateway timeout/
];

const TIMEOUT_PATTERNS = [/\btimed out\b/, /\btimeout\b/, /\baborted\b/];

const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/,
  /networkerror/,
  /network request failed/,
  /fetch failed/,
  /load failed/,
  /cors/,
  /access-control-allow-origin/,
  /socket hang up/,
  /econnreset/,
  /enotfound/
];

const NOT_FOUND_PATTERNS = [/\b404\b/, /not found/, /no such contract/, /nosuchcontract/];

export const summarizeLiveMintStatusError = (
  error: unknown,
  options?: { rateLimitBackoffMs?: number }
) => {
  if (isRateLimitError(error)) {
    const retryMinutes =
      typeof options?.rateLimitBackoffMs === 'number'
        ? Math.max(1, Math.round(options.rateLimitBackoffMs / 60_000))
        : null;
    return retryMinutes === null
      ? 'Mint status refresh paused by rate limiting.'
      : `Mint status refresh paused by rate limiting. Retry in about ${retryMinutes} min.`;
  }

  const rawMessage = getErrorMessage(error).toLowerCase();
  const normalizedMessage = normalizeErrorMessage(rawMessage);
  const messages = [rawMessage, normalizedMessage];

  if (matchesAny(messages, INVALID_RESPONSE_PATTERNS)) {
    return 'Mint status temporarily unavailable. Upstream response was invalid.';
  }
  if (matchesAny(messages, SERVER_ERROR_PATTERNS)) {
    return 'Mint status temporarily unavailable. Upstream service error.';
  }
  if (matchesAny(messages, TIMEOUT_PATTERNS)) {
    return 'Mint status temporarily unavailable. Read request timed out.';
  }
  if (matchesAny(messages, NETWORK_ERROR_PATTERNS)) {
    return 'Mint status temporarily unavailable. Network read failed.';
  }
  if (matchesAny(messages, NOT_FOUND_PATTERNS)) {
    return 'Mint status temporarily unavailable. Contract data was not found.';
  }
  return 'Mint status temporarily unavailable.';
};
