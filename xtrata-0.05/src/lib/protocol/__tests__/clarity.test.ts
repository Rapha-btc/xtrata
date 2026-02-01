import { describe, expect, it } from 'vitest';
import {
  ClarityType,
  noneCV,
  responseErrorCV,
  responseOkCV,
  someCV,
  stringAsciiCV,
  uintCV
} from '@stacks/transactions';
import { expectOptional, unwrapResponse } from '../clarity';

describe('clarity helpers', () => {
  it('unwraps response ok values', () => {
    const response = unwrapResponse(responseOkCV(uintCV(7)), 'test');
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.value.type).toBe(ClarityType.UInt);
    }
  });

  it('unwraps response error values', () => {
    const response = unwrapResponse(responseErrorCV(uintCV(100)), 'test');
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.value.type).toBe(ClarityType.UInt);
    }
  });

  it('parses optional values', () => {
    const some = expectOptional(someCV(stringAsciiCV('ok')), 'test');
    expect(some?.type).toBe(ClarityType.StringASCII);
    const none = expectOptional(noneCV(), 'test');
    expect(none).toBeNull();
  });
});
