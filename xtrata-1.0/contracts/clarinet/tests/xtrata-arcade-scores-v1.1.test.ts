import {
  Cl,
  ClarityType,
  hash160,
  principalCV,
  privateKeyToPublic,
  serializeCV,
  signMessageHashRsv,
  stringAsciiCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const faucet = accounts.get('faucet')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const contractName = 'xtrata-arcade-scores-v1-1';
const contract = `${deployer}.${contractName}`;

const verifierPrivateKey =
  '2ae156d224f73bfee9d1d52e0210012b4ae4e85df2705f4f25b7ac62db45aa3b01';
const wrongVerifierPrivateKey =
  '1c83f3b0b8fc8af8c7c4e336f4f9cdf4dbc8f6b8e1f3ebec705fca8d98379e4e01';

const unwrapOk = (result: any) => {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
};

const setVerifier = (privateKey = verifierPrivateKey) => {
  const pubkeyHex = privateKeyToPublic(privateKey);
  const pubkeyBytes = Uint8Array.from(Buffer.from(pubkeyHex, 'hex'));
  const hashBytes = Uint8Array.from(hash160(pubkeyBytes));
  const result = simnet.callPublicFn(
    contract,
    'set-verifier-pubkey-hash',
    [Cl.some(Cl.buffer(hashBytes))],
    deployer
  ).result;
  expect(result).toBeOk(Cl.bool(true));
};

const signAttestation = (params: {
  gameId: string;
  mode: bigint;
  score: bigint;
  playerName: string;
  player: string;
  nonce: bigint;
  expiresAt: bigint;
  privateKey?: string;
}) => {
  const payload = tupleCV({
    'expires-at': uintCV(params.expiresAt),
    'game-id': stringAsciiCV(params.gameId),
    mode: uintCV(params.mode),
    name: stringAsciiCV(params.playerName),
    nonce: uintCV(params.nonce),
    player: principalCV(params.player),
    score: uintCV(params.score)
  });

  var serialized = serializeCV(payload);
  if(typeof serialized !== 'string'){
    throw new Error('serializeCV returned an unexpected payload type.');
  }
  var serializedHex =
    serialized.indexOf('0x') === 0 || serialized.indexOf('0X') === 0
      ? serialized.substring(2)
      : serialized;
  const digestBytes = createHash('sha256')
    .update(Buffer.from(serializedHex, 'hex'))
    .digest();
  return signMessageHashRsv({
    messageHash: digestBytes,
    privateKey: params.privateKey ?? verifierPrivateKey
  });
};

const submitScore = (params: {
  sender: string;
  gameId: string;
  mode: bigint;
  score: bigint;
  playerName: string;
  nonce: bigint;
  expiresAt: bigint;
  signatureHex: string;
}) =>
  simnet.callPublicFn(
    contract,
    'submit-score',
    [
      Cl.stringAscii(params.gameId),
      Cl.uint(params.mode),
      Cl.uint(params.score),
      Cl.stringAscii(params.playerName),
      Cl.uint(params.nonce),
      Cl.uint(params.expiresAt),
      Cl.bufferFromHex(params.signatureHex)
    ],
    params.sender
  ).result;

describe('xtrata-arcade-scores-v1.1', () => {
  it('rejects submit when verifier is not configured', () => {
    const signatureHex = signAttestation({
      gameId: 'neon_runner',
      mode: 0n,
      score: 100n,
      playerName: 'AAA',
      player: wallet1,
      nonce: 1n,
      expiresAt: 999999n
    });

    const result = submitScore({
      sender: wallet1,
      gameId: 'neon_runner',
      mode: 0n,
      score: 100n,
      playerName: 'AAA',
      nonce: 1n,
      expiresAt: 999999n,
      signatureHex
    });

    expect(result).toBeErr(Cl.uint(111));
  });

  it('accepts valid attested submit and charges configured fee', () => {
    setVerifier();

    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-unit',
        [Cl.uint(100)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-recipient',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    const senderBefore = simnet.getAssetsMap().get('STX')?.get(wallet1) || 0n;
    const recipientBefore = simnet.getAssetsMap().get('STX')?.get(wallet2) || 0n;

    const signatureHex = signAttestation({
      gameId: 'neon_runner',
      mode: 0n,
      score: 250n,
      playerName: 'JIM',
      player: wallet1,
      nonce: 11n,
      expiresAt: 999999n
    });

    const submit = submitScore({
      sender: wallet1,
      gameId: 'neon_runner',
      mode: 0n,
      score: 250n,
      playerName: 'JIM',
      nonce: 11n,
      expiresAt: 999999n,
      signatureHex
    });

    expect(submit).toBeOk(Cl.uint(1));

    const senderAfter = simnet.getAssetsMap().get('STX')?.get(wallet1) || 0n;
    const recipientAfter = simnet.getAssetsMap().get('STX')?.get(wallet2) || 0n;

    expect(senderBefore - senderAfter).toBe(100n);
    expect(recipientAfter - recipientBefore).toBe(100n);

    const top1 = simnet.callReadOnlyFn(
      contract,
      'get-top10-entry',
      [Cl.stringAscii('neon_runner'), Cl.uint(0), Cl.uint(1)],
      deployer
    ).result;
    const top1Value = unwrapOk(top1);
    expect(top1Value.type).toBe(ClarityType.OptionalSome);
    const top1Tuple = (top1Value as any).value.value;
    expect(top1Tuple.player).toEqual(Cl.standardPrincipal(wallet1));
    expect(top1Tuple.name).toEqual(Cl.stringAscii('JIM'));
    expect(top1Tuple.score).toEqual(Cl.uint(250));
  });

  it('rejects nonce replay', () => {
    setVerifier();

    const firstSig = signAttestation({
      gameId: 'astro_blaster',
      mode: 0n,
      score: 900n,
      playerName: 'ACE',
      player: wallet1,
      nonce: 7n,
      expiresAt: 999999n
    });

    expect(
      submitScore({
        sender: wallet1,
        gameId: 'astro_blaster',
        mode: 0n,
        score: 900n,
        playerName: 'ACE',
        nonce: 7n,
        expiresAt: 999999n,
        signatureHex: firstSig
      })
    ).toBeOk(Cl.uint(1));

    const replaySig = signAttestation({
      gameId: 'astro_blaster',
      mode: 0n,
      score: 950n,
      playerName: 'ACE',
      player: wallet1,
      nonce: 7n,
      expiresAt: 999999n
    });

    const replay = submitScore({
      sender: wallet1,
      gameId: 'astro_blaster',
      mode: 0n,
      score: 950n,
      playerName: 'ACE',
      nonce: 7n,
      expiresAt: 999999n,
      signatureHex: replaySig
    });

    expect(replay).toBeErr(Cl.uint(108));
  });

  it('rejects expired attestations', () => {
    setVerifier();
    simnet.mineEmptyBlocks(3);

    const signatureHex = signAttestation({
      gameId: 'maze_escape',
      mode: 1n,
      score: 500n,
      playerName: 'TIM',
      player: wallet1,
      nonce: 20n,
      expiresAt: 1n
    });

    const expired = submitScore({
      sender: wallet1,
      gameId: 'maze_escape',
      mode: 1n,
      score: 500n,
      playerName: 'TIM',
      nonce: 20n,
      expiresAt: 1n,
      signatureHex
    });

    expect(expired).toBeErr(Cl.uint(110));
  });

  it('rejects signatures from an unapproved verifier key', () => {
    setVerifier(verifierPrivateKey);

    const signatureHex = signAttestation({
      gameId: 'block_drop',
      mode: 0n,
      score: 500n,
      playerName: 'MAX',
      player: wallet1,
      nonce: 31n,
      expiresAt: 999999n,
      privateKey: wrongVerifierPrivateKey
    });

    const rejected = submitScore({
      sender: wallet1,
      gameId: 'block_drop',
      mode: 0n,
      score: 500n,
      playerName: 'MAX',
      nonce: 31n,
      expiresAt: 999999n,
      signatureHex
    });

    expect(rejected).toBeErr(Cl.uint(109));
  });

  it('enforces fee bounds and owner-only fee controls', () => {
    const defaultFee = simnet.callReadOnlyFn(contract, 'get-fee-unit', [], deployer).result;
    expect(defaultFee).toBeOk(Cl.uint(30000));

    const unauthorized = simnet.callPublicFn(
      contract,
      'set-fee-unit',
      [Cl.uint(100)],
      wallet1
    ).result;
    expect(unauthorized).toBeErr(Cl.uint(104));

    const tooLow = simnet.callPublicFn(
      contract,
      'set-fee-unit',
      [Cl.uint(99)],
      deployer
    ).result;
    expect(tooLow).toBeErr(Cl.uint(107));

    const tooHigh = simnet.callPublicFn(
      contract,
      'set-fee-unit',
      [Cl.uint(1000001)],
      deployer
    ).result;
    expect(tooHigh).toBeErr(Cl.uint(107));

    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-recipient',
        [Cl.standardPrincipal(faucet)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-unit',
        [Cl.uint(500)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(simnet.callReadOnlyFn(contract, 'get-fee-unit', [], deployer).result).toBeOk(
      Cl.uint(500)
    );
    expect(
      simnet.callReadOnlyFn(contract, 'get-fee-recipient', [], deployer).result
    ).toBeOk(Cl.standardPrincipal(faucet));
  });
});
