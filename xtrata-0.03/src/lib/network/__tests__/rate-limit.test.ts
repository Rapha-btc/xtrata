import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  emitRateLimitWarning,
  RATE_LIMIT_WARNING_EVENT
} from '../rate-limit';

class TestCustomEvent<T = unknown> {
  type: string;
  detail: T | undefined;

  constructor(type: string, init?: CustomEventInit<T>) {
    this.type = type;
    this.detail = init?.detail;
  }
}

describe('rate limit warning', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches a warning once during the cooldown window', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent } as Window);
    vi.stubGlobal('CustomEvent', TestCustomEvent as typeof CustomEvent);

    emitRateLimitWarning({
      functionName: 'get-last-token-id',
      contractId: 'SPTEST.contract',
      error: 'Response 429'
    });
    emitRateLimitWarning({
      functionName: 'get-last-token-id',
      contractId: 'SPTEST.contract',
      error: 'Response 429'
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const eventArg = dispatchEvent.mock.calls[0][0] as TestCustomEvent;
    expect(eventArg.type).toBe(RATE_LIMIT_WARNING_EVENT);
    expect(eventArg.detail).toMatchObject({
      functionName: 'get-last-token-id',
      contractId: 'SPTEST.contract'
    });
  });
});
