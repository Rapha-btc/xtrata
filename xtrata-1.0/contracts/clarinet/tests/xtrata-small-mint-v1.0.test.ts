import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;

const coreContract = `${deployer}.xtrata-v2-1-0`;
const helperContract = `${deployer}.xtrata-small-mint-v1-0`;
const corePrincipal = Cl.contractPrincipal(deployer, 'xtrata-v2-1-0');
const helperPrincipal = Cl.contractPrincipal(deployer, 'xtrata-small-mint-v1-0');
const mime = 'text/plain';

function computeFinalHash(chunksHex: string[]) {
  let running = Buffer.alloc(32, 0);
  for (const chunkHex of chunksHex) {
    const chunk = Buffer.from(chunkHex, 'hex');
    const digest = createHash('sha256');
    digest.update(Buffer.concat([running, chunk]));
    running = digest.digest();
  }
  return running.toString('hex');
}

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function unwrapUInt(result: any) {
  expect(result.type).toBe(ClarityType.UInt);
  return result.value as bigint;
}

function setCorePaused(value: boolean) {
  return simnet.callPublicFn(coreContract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setHelperPaused(value: boolean) {
  return simnet.callPublicFn(helperContract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setHelperCoreContract() {
  return simnet.callPublicFn(
    helperContract,
    'set-core-contract',
    [corePrincipal],
    deployer
  ).result;
}

function getNextCoreId(sender: string) {
  const next = simnet.callReadOnlyFn(coreContract, 'get-next-token-id', [], sender).result;
  return unwrapUInt(unwrapOk(next));
}

function mintSmallSingleTx(sender: string, expectedHash: string, totalSize: number, chunksHex: string[]) {
  return simnet.callPublicFn(
    helperContract,
    'mint-small-single-tx',
    [
      corePrincipal,
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii('data:text/plain,small')
    ],
    sender
  ).result;
}

describe('xtrata-small-mint-v1.0', () => {
  it('mints a <=30 chunk payload in one transaction', () => {
    unwrapOk(setHelperCoreContract());
    unwrapOk(setCorePaused(false));
    unwrapOk(setHelperPaused(false));

    const chunks = ['aa', 'bb'];
    const expectedHash = computeFinalHash(chunks);
    const startId = getNextCoreId(wallet1);

    const mintResult = mintSmallSingleTx(wallet1, expectedHash, 2, chunks);
    expect(mintResult).toBeOk(
      Cl.tuple({
        'token-id': Cl.uint(startId),
        existed: Cl.bool(false)
      })
    );

    const owner = simnet.callReadOnlyFn(coreContract, 'get-owner', [Cl.uint(startId)], wallet1).result;
    expect(owner).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));

    const totalChunks = simnet.callReadOnlyFn(
      coreContract,
      'get-inscription-chunks',
      [Cl.uint(startId)],
      wallet1
    ).result;
    expect(totalChunks).toBeSome(Cl.uint(2));
  });

  it('returns existing id for duplicate hashes without minting a new token', () => {
    unwrapOk(setHelperCoreContract());
    unwrapOk(setCorePaused(false));
    unwrapOk(setHelperPaused(false));

    const chunks = ['ab'];
    const expectedHash = computeFinalHash(chunks);
    const startId = getNextCoreId(wallet1);

    const first = mintSmallSingleTx(wallet1, expectedHash, 1, chunks);
    expect(first).toBeOk(
      Cl.tuple({
        'token-id': Cl.uint(startId),
        existed: Cl.bool(false)
      })
    );

    const second = mintSmallSingleTx(wallet1, expectedHash, 1, chunks);
    expect(second).toBeOk(
      Cl.tuple({
        'token-id': Cl.uint(startId),
        existed: Cl.bool(true)
      })
    );

    expect(getNextCoreId(wallet1)).toEqual(startId + 1n);
  });

  it('rejects chunk lists above the 30 chunk helper limit', () => {
    unwrapOk(setHelperCoreContract());
    unwrapOk(setCorePaused(false));
    unwrapOk(setHelperPaused(false));

    const chunks = Array.from({ length: 31 }, (_, index) =>
      index.toString(16).padStart(2, '0')
    );
    const expectedHash = computeFinalHash(chunks);

    const result = mintSmallSingleTx(wallet1, expectedHash, 31, chunks);
    expect(result).toBeErr(Cl.uint(102));
  });

  it('requires core allowlist while core is paused', () => {
    unwrapOk(setHelperCoreContract());
    unwrapOk(setHelperPaused(false));

    const chunks = ['cd'];
    const expectedHash = computeFinalHash(chunks);

    const blocked = mintSmallSingleTx(wallet1, expectedHash, 1, chunks);
    expect(blocked).toBeErr(Cl.uint(109));

    unwrapOk(
      simnet.callPublicFn(
        coreContract,
        'set-allowed-caller',
        [helperPrincipal, Cl.bool(true)],
        deployer
      ).result
    );

    const allowed = mintSmallSingleTx(wallet1, expectedHash, 1, chunks);
    expect(allowed.type).toBe(ClarityType.ResponseOk);
  });
});
