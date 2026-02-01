export const RATE_LIMIT_WARNING_EVENT = 'xtrata:rate-limit';

export type RateLimitWarningDetail = {
  functionName: string;
  contractId: string;
  error: string;
};

const RATE_LIMIT_WARNING_COOLDOWN_MS = 15000;
let lastRateLimitWarningAt = 0;

export const emitRateLimitWarning = (detail: RateLimitWarningDetail) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (typeof window.dispatchEvent !== 'function') {
    return;
  }
  if (typeof CustomEvent === 'undefined') {
    return;
  }

  const now = Date.now();
  if (now - lastRateLimitWarningAt < RATE_LIMIT_WARNING_COOLDOWN_MS) {
    return;
  }
  lastRateLimitWarningAt = now;

  window.dispatchEvent(
    new CustomEvent(RATE_LIMIT_WARNING_EVENT, {
      detail
    })
  );
};
