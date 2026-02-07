import {
  ClarityType,
  ClarityValue,
  principalToString,
  PrincipalCV
} from '@stacks/transactions';

export type TupleData = Record<string, ClarityValue>;

export class ClarityParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClarityParseError';
  }
}

const formatType = (value: ClarityValue) => {
  const name = ClarityType[value.type];
  return name ?? `Unknown(${value.type})`;
};

const fail = (context: string, expected: string, value: ClarityValue): never => {
  throw new ClarityParseError(
    `Expected ${expected} for ${context}, got ${formatType(value)}`
  );
};

export const unwrapResponse = (value: ClarityValue, context: string) => {
  if (value.type === ClarityType.ResponseOk) {
    return { ok: true as const, value: value.value };
  }
  if (value.type === ClarityType.ResponseErr) {
    return { ok: false as const, value: value.value };
  }
  return fail(context, 'response', value);
};

export const expectOptional = (value: ClarityValue, context: string) => {
  if (value.type === ClarityType.OptionalNone) {
    return null;
  }
  if (value.type === ClarityType.OptionalSome) {
    return value.value;
  }
  return fail(context, 'optional', value);
};

export const expectTuple = (value: ClarityValue, context: string): TupleData => {
  if (value.type !== ClarityType.Tuple) {
    return fail(context, 'tuple', value);
  }
  return value.data;
};

export const expectList = (value: ClarityValue, context: string) => {
  if (value.type !== ClarityType.List) {
    return fail(context, 'list', value);
  }
  return value.list;
};

export const expectUInt = (value: ClarityValue, context: string) => {
  if (value.type !== ClarityType.UInt) {
    return fail(context, 'uint', value);
  }
  return value.value;
};

export const expectBuffer = (value: ClarityValue, context: string) => {
  if (value.type !== ClarityType.Buffer) {
    return fail(context, 'buffer', value);
  }
  return value.buffer;
};

export const expectStringAscii = (value: ClarityValue, context: string) => {
  if (value.type !== ClarityType.StringASCII) {
    return fail(context, 'string-ascii', value);
  }
  return value.data;
};

export const expectBool = (value: ClarityValue, context: string) => {
  if (value.type === ClarityType.BoolTrue) {
    return true;
  }
  if (value.type === ClarityType.BoolFalse) {
    return false;
  }
  return fail(context, 'bool', value);
};

export const expectPrincipal = (value: ClarityValue, context: string) => {
  if (
    value.type !== ClarityType.PrincipalStandard &&
    value.type !== ClarityType.PrincipalContract
  ) {
    return fail(context, 'principal', value);
  }
  return principalToString(value as PrincipalCV);
};

export const getTupleValue = (tuple: TupleData, key: string, context: string) => {
  const value = tuple[key];
  if (!value) {
    throw new ClarityParseError(`Missing tuple key ${key} for ${context}`);
  }
  return value;
};
