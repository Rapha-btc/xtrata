import {
  createStacksPrivateKey,
  principalCV,
  serializeCV,
  signMessageHashRsv,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { badRequest, jsonResponse, serverError } from '../lib/utils';

type AttestBody = {
  gameId?: unknown;
  mode?: unknown;
  score?: unknown;
  playerName?: unknown;
  player?: unknown;
  network?: unknown;
};

const MAX_GAME_ID = 32;
const MAX_PLAYER_NAME = 12;
const MIN_PLAYER_NAME = 3;
const DEFAULT_EXPIRY_BLOCKS = 30;
const MAX_EXPIRY_BLOCKS = 500;

const toAscii = (value: unknown, maxLen: number) => {
  const raw = String(value ?? '');
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      out += raw[i];
      if (out.length >= maxLen) break;
    }
  }
  return out;
};

const parseMode = (value: unknown) => {
  if (value === 0 || value === '0' || value === 'score') return 0n;
  if (value === 1 || value === '1' || value === 'time') return 1n;
  throw new Error('mode must be 0/1 or score/time');
};

const parseUnsigned = (value: unknown, label: string) => {
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`${label} must be an unsigned integer`);
  }
  const out = BigInt(text);
  if (out <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  return out;
};

const parseExpiryBlocks = (env: Record<string, unknown>) => {
  const raw = String(env.ARCADE_SCORE_ATTESTATION_EXPIRY_BLOCKS ?? DEFAULT_EXPIRY_BLOCKS);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EXPIRY_BLOCKS;
  return Math.min(MAX_EXPIRY_BLOCKS, Math.max(1, Math.floor(parsed)));
};

const normalizePrivateKey = (value: unknown) => {
  const raw = String(value ?? '').trim();
  const key = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error('ARCADE_SCORE_ATTESTATION_PRIVATE_KEY must be hex');
  }
  if (key.length !== 64 && key.length !== 66) {
    throw new Error('ARCADE_SCORE_ATTESTATION_PRIVATE_KEY must be 32-byte hex (optionally +01 compressed flag)');
  }
  return key;
};

const pickApiBase = (network: string, env: Record<string, unknown>) => {
  const normalized = network.toLowerCase();
  if (normalized === 'testnet' || normalized === 'test') {
    return String(env.ARCADE_HIRO_API_BASE_TESTNET ?? 'https://api.testnet.hiro.so');
  }
  if (normalized === 'devnet' || normalized === 'dev') {
    return String(env.ARCADE_HIRO_API_BASE_DEVNET ?? 'http://localhost:3999');
  }
  return String(env.ARCADE_HIRO_API_BASE_MAINNET ?? 'https://api.mainnet.hiro.so');
};

const hexToBytes = (hex: string) => {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error('Invalid hex payload from serializeCV');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
};

const bytesToHex = (bytes: ArrayLike<number>) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += Number(bytes[i]).toString(16).padStart(2, '0');
  }
  return out;
};

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

const randomNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return BigInt(`0x${hex}`);
};

const currentTipHeight = async (apiBase: string) => {
  const response = await fetch(`${apiBase.replace(/\/+$/, '')}/v2/info`);
  if (!response.ok) {
    throw new Error(`Hiro info request failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { stacks_tip_height?: number };
  const tip = Number(body?.stacks_tip_height);
  if (!Number.isFinite(tip) || tip < 0) {
    throw new Error('Unable to resolve stacks_tip_height from Hiro response');
  }
  return BigInt(Math.floor(tip));
};

const parseBody = (body: AttestBody) => {
  const gameId = toAscii(body.gameId, MAX_GAME_ID);
  if (!gameId) {
    throw new Error('gameId is required');
  }
  const playerName = toAscii(body.playerName, MAX_PLAYER_NAME);
  if (playerName.length < MIN_PLAYER_NAME) {
    throw new Error(`playerName must be ${MIN_PLAYER_NAME}-${MAX_PLAYER_NAME} ascii chars`);
  }
  const player = String(body.player ?? '').trim();
  if (!player) {
    throw new Error('player (wallet principal) is required');
  }

  return {
    gameId,
    mode: parseMode(body.mode),
    score: parseUnsigned(body.score, 'score'),
    playerName,
    player,
    network: String(body.network ?? 'mainnet')
  };
};

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: AttestBody;
  try {
    body = (await request.json()) as AttestBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  try {
    const parsed = parseBody(body);
    const privateKey = normalizePrivateKey(env.ARCADE_SCORE_ATTESTATION_PRIVATE_KEY);
    const expiryBlocks = parseExpiryBlocks(env as Record<string, unknown>);

    const apiBase = pickApiBase(parsed.network, env as Record<string, unknown>);
    const tipHeight = await currentTipHeight(apiBase);
    const expiresAt = tipHeight + BigInt(expiryBlocks);
    const nonce = randomNonce();

    const payload = tupleCV({
      'expires-at': uintCV(expiresAt),
      'game-id': stringAsciiCV(parsed.gameId),
      mode: uintCV(parsed.mode),
      name: stringAsciiCV(parsed.playerName),
      nonce: uintCV(nonce),
      player: principalCV(parsed.player),
      score: uintCV(parsed.score)
    });

    const serialized = serializeCV(payload);
    const payloadBytes =
      typeof serialized === 'string' ? hexToBytes(serialized) : serialized;
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(payloadBytes));
    const signature = signMessageHashRsv({
      messageHash: bytesToHex(new Uint8Array(digest)),
      privateKey: createStacksPrivateKey(privateKey)
    }).data;

    return jsonResponse({
      nonce: nonce.toString(),
      expiresAt: expiresAt.toString(),
      signature
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create attestation';
    if (
      message.includes('required') ||
      message.includes('must be') ||
      message.includes('Invalid') ||
      message.includes('mode must be')
    ) {
      return badRequest(message);
    }
    console.error('[arcade/attest-score] error', {
      message,
      stack: error instanceof Error ? error.stack ?? null : null
    });
    return serverError(message);
  }
};
