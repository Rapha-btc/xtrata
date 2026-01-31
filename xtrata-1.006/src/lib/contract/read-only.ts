import { emitRateLimitWarning } from '../network/rate-limit';
import { logDebug, logWarn } from '../utils/logger';

const READONLY_MAX_CONCURRENT = 3;
const READONLY_RETRIES = 3;
const READONLY_BASE_DELAY_MS = 400;
const READONLY_RATE_LIMIT_DELAY_MS = 1500;
const READONLY_JITTER_MS = 120;

export type ReadOnlyRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getErrorMessage = (error: unknown) => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Error';
  }
  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    return String(error);
  }
};

export const isRateLimitError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
};

const isNoSuchContractError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('nosuchcontract') ||
    message.includes('no such contract')
  );
};

const withReadOnlyLimit = async <T>(task: () => Promise<T>): Promise<T> => {
  if (READONLY_MAX_CONCURRENT <= 0) {
    return task();
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      activeReadOnlyCalls += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeReadOnlyCalls = Math.max(0, activeReadOnlyCalls - 1);
          const next = readOnlyQueue.shift();
          if (next) {
            next();
          }
        });
    };

    if (activeReadOnlyCalls < READONLY_MAX_CONCURRENT) {
      run();
      return;
    }

    readOnlyQueue.push(run);
  });
};

const getRetryDelay = (
  attempt: number,
  rateLimited: boolean,
  baseDelayMs: number
) => {
  const base = rateLimited
    ? Math.max(baseDelayMs, READONLY_RATE_LIMIT_DELAY_MS)
    : baseDelayMs;
  const jitter = Math.floor(Math.random() * READONLY_JITTER_MS);
  return base * Math.pow(2, attempt) + jitter;
};

let activeReadOnlyCalls = 0;
const readOnlyQueue: Array<() => void> = [];

export const callReadOnlyWithRetry = async <T>(params: {
  task: () => Promise<T>;
  functionName: string;
  contractId: string;
  retry?: ReadOnlyRetryOptions;
}) => {
  const retries = params.retry?.retries ?? READONLY_RETRIES;
  const baseDelayMs = params.retry?.baseDelayMs ?? READONLY_BASE_DELAY_MS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withReadOnlyLimit(params.task);
    } catch (error) {
      lastError = error;
      const rateLimited = isRateLimitError(error);
      const message = getErrorMessage(error);
      logDebug('readonly', 'Read-only call failed', {
        attempt,
        functionName: params.functionName,
        contractId: params.contractId,
        rateLimited,
        error: message
      });
      if (rateLimited) {
        emitRateLimitWarning({
          functionName: params.functionName,
          contractId: params.contractId,
          error: message
        });
      }
      if (isNoSuchContractError(error) || attempt >= retries) {
        break;
      }
      const delay = getRetryDelay(attempt, rateLimited, baseDelayMs);
      await sleep(delay);
    }
  }

  logWarn('readonly', 'Read-only call failed after retries', {
    functionName: params.functionName,
    contractId: params.contractId,
    error: getErrorMessage(lastError)
  });
  throw (lastError instanceof Error
    ? lastError
    : new Error(getErrorMessage(lastError)));
};
