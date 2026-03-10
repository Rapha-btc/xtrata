import { validateStacksAddress } from '@stacks/transactions';
import {
  X402_ACCESS_COOKIE_NAME,
  X402_ACCESS_TTL_SECONDS,
  type X402AccessGrantMode
} from './x402-config';

export type X402AccessTokenPayload = {
  sub: string;
  slug: string;
  assetId: string;
  mode: X402AccessGrantMode;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBufferSource = (value: Uint8Array) => value as unknown as BufferSource;

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalized.length % 4 === 0 ? normalized : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array) => {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
};

const importHmacKey = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    toBufferSource(encoder.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

const signBytes = async (payload: Uint8Array, secret: string) => {
  const key = await importHmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, toBufferSource(payload)));
};

const isAccessMode = (value: unknown): value is X402AccessGrantMode =>
  value === 'commerce' || value === 'vault';

const isValidPayload = (value: unknown): value is X402AccessTokenPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<X402AccessTokenPayload>;
  return (
    typeof candidate.sub === 'string' &&
    validateStacksAddress(candidate.sub) &&
    typeof candidate.slug === 'string' &&
    candidate.slug.trim().length > 0 &&
    typeof candidate.assetId === 'string' &&
    /^\d+$/.test(candidate.assetId) &&
    isAccessMode(candidate.mode) &&
    typeof candidate.iat === 'number' &&
    Number.isFinite(candidate.iat) &&
    typeof candidate.exp === 'number' &&
    Number.isFinite(candidate.exp)
  );
};

export const createX402AccessToken = async (
  payload: X402AccessTokenPayload,
  secret: string
) => {
  const payloadJson = JSON.stringify(payload);
  const payloadSegment = toBase64Url(encoder.encode(payloadJson));
  const signature = await signBytes(encoder.encode(payloadSegment), secret);
  return `${payloadSegment}.${toBase64Url(signature)}`;
};

export const verifyX402AccessToken = async (
  token: string | null | undefined,
  secret: string,
  nowMs = Date.now()
): Promise<X402AccessTokenPayload | null> => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  const separatorIndex = normalized.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null;
  }

  const payloadSegment = normalized.slice(0, separatorIndex);
  const signatureSegment = normalized.slice(separatorIndex + 1);

  let parsedPayload: unknown;
  let signatureBytes: Uint8Array;
  try {
    parsedPayload = JSON.parse(decoder.decode(fromBase64Url(payloadSegment)));
    signatureBytes = fromBase64Url(signatureSegment);
  } catch {
    return null;
  }

  if (!isValidPayload(parsedPayload)) {
    return null;
  }

  const expectedSignature = await signBytes(encoder.encode(payloadSegment), secret);
  if (!timingSafeEqual(signatureBytes, expectedSignature)) {
    return null;
  }

  if (parsedPayload.exp * 1000 <= nowMs) {
    return null;
  }

  return parsedPayload;
};

export const getX402CookieValue = (
  request: Request,
  cookieName = X402_ACCESS_COOKIE_NAME
) => {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...valueParts] = pair.split('=');
    if (name?.trim() !== cookieName) {
      continue;
    }
    return valueParts.join('=').trim() || null;
  }
  return null;
};

export const buildX402AccessCookie = (params: {
  token: string;
  cookieName?: string;
  path?: string;
  maxAgeSeconds?: number;
  secure?: boolean;
}) => {
  const cookieName = params.cookieName ?? X402_ACCESS_COOKIE_NAME;
  const path = params.path ?? '/demo/premium/';
  const maxAgeSeconds = params.maxAgeSeconds ?? X402_ACCESS_TTL_SECONDS;
  const segments = [
    `${cookieName}=${params.token}`,
    `Max-Age=${maxAgeSeconds}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (params.secure !== false) {
    segments.push('Secure');
  }
  return segments.join('; ');
};

export const shouldUseSecureCookie = (request: Request) =>
  new URL(request.url).protocol === 'https:';
