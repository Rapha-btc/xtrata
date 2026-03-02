import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const contract = `${deployer}.xtrata-v2-1-1`;
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

function stxBalance(address: string) {
  return simnet.getAssetsMap().get('STX')?.get(address) || 0n;
}

function setPaused(sender: string, value: boolean) {
  return simnet.callPublicFn(contract, 'set-paused', [Cl.bool(value)], sender).result;
}

function setRoyaltyRecipient(sender: string, recipient: string) {
  return simnet.callPublicFn(
    contract,
    'set-royalty-recipient',
    [Cl.standardPrincipal(recipient)],
    sender
  ).result;
}

function setBeginFeeUnit(sender: string, value: bigint) {
  return simnet.callPublicFn(contract, 'set-begin-fee-unit', [Cl.uint(value)], sender).result;
}

function setUploadChunkFeeUnit(sender: string, value: bigint) {
  return simnet.callPublicFn(contract, 'set-upload-chunk-fee-unit', [Cl.uint(value)], sender).result;
}

function setUploadBatchFeeUnit(sender: string, value: bigint) {
  return simnet.callPublicFn(contract, 'set-upload-batch-fee-unit', [Cl.uint(value)], sender).result;
}

function setSealFeeUnit(sender: string, value: bigint) {
  return simnet.callPublicFn(contract, 'set-seal-fee-unit', [Cl.uint(value)], sender).result;
}

function setFeeUnit(sender: string, value: bigint) {
  return simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(value)], sender).result;
}

function beginInscription(sender: string, hash: string, totalSize: number, totalChunks: number) {
  return simnet.callPublicFn(
    contract,
    'begin-inscription',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.uint(totalChunks)
    ],
    sender
  ).result;
}

function addChunkBatch(sender: string, hash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    contract,
    'add-chunk-batch',
    [
      Cl.bufferFromHex(hash),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))
    ],
    sender
  ).result;
}

function sealInscription(sender: string, hash: string, tokenUri: string) {
  return simnet.callPublicFn(
    contract,
    'seal-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

describe('xtrata-v2.1.1 split fee model', () => {
  it('charges begin fee exactly once for start/resume', () => {
    unwrapOk(setPaused(deployer, false));
    unwrapOk(setRoyaltyRecipient(deployer, wallet2));
    unwrapOk(setBeginFeeUnit(deployer, 120_000n));

    const hash = computeFinalHash(['aa']);
    const before = stxBalance(wallet2);

    unwrapOk(beginInscription(wallet1, hash, 1, 1));
    const afterBegin = stxBalance(wallet2);
    expect(afterBegin - before).toBe(120_000n);

    unwrapOk(beginInscription(wallet1, hash, 1, 1));
    const afterResume = stxBalance(wallet2);
    expect(afterResume - afterBegin).toBe(0n);
  });

  it('charges seal fee with first-batch per-chunk and additional per-batch', () => {
    unwrapOk(setPaused(deployer, false));
    unwrapOk(setRoyaltyRecipient(deployer, wallet2));

    unwrapOk(setUploadChunkFeeUnit(deployer, 3_000n));
    unwrapOk(setUploadBatchFeeUnit(deployer, 120_000n));
    unwrapOk(setSealFeeUnit(deployer, 150_000n));

    const chunks = Array.from({ length: 55 }, () => 'ab');
    const hash = computeFinalHash(chunks);

    unwrapOk(beginInscription(wallet1, hash, 55, 55));
    unwrapOk(addChunkBatch(wallet1, hash, chunks.slice(0, 50)));
    unwrapOk(addChunkBatch(wallet1, hash, chunks.slice(50)));

    const beforeSeal = stxBalance(wallet2);
    unwrapUInt(unwrapOk(sealInscription(wallet1, hash, 'data:text/plain,split-fee')));
    const afterSeal = stxBalance(wallet2);

    const expectedSealFee = 150_000n + (50n * 3_000n) + (1n * 120_000n);
    expect(afterSeal - beforeSeal).toBe(expectedSealFee);
  });

  it('sums per-item split seal fees in batch sealing', () => {
    unwrapOk(setPaused(deployer, false));
    unwrapOk(setRoyaltyRecipient(deployer, wallet2));

    unwrapOk(setUploadChunkFeeUnit(deployer, 4_000n));
    unwrapOk(setUploadBatchFeeUnit(deployer, 90_000n));
    unwrapOk(setSealFeeUnit(deployer, 130_000n));

    const chunksA = ['0a'];
    const hashA = computeFinalHash(chunksA);
    unwrapOk(beginInscription(wallet1, hashA, 1, 1));
    unwrapOk(addChunkBatch(wallet1, hashA, chunksA));

    const chunksB = Array.from({ length: 51 }, () => '0b');
    const hashB = computeFinalHash(chunksB);
    unwrapOk(beginInscription(wallet1, hashB, 51, 51));
    unwrapOk(addChunkBatch(wallet1, hashB, chunksB.slice(0, 50)));
    unwrapOk(addChunkBatch(wallet1, hashB, chunksB.slice(50)));

    const beforeSeal = stxBalance(wallet2);
    const batch = simnet.callPublicFn(
      contract,
      'seal-inscription-batch',
      [
        Cl.list([
          Cl.tuple({ hash: Cl.bufferFromHex(hashA), 'token-uri': Cl.stringAscii('data:text/plain,a') }),
          Cl.tuple({ hash: Cl.bufferFromHex(hashB), 'token-uri': Cl.stringAscii('data:text/plain,b') })
        ])
      ],
      wallet1
    ).result;
    unwrapOk(batch);
    const afterSeal = stxBalance(wallet2);

    const feeA = 130_000n + (1n * 4_000n);
    const feeB = 130_000n + (50n * 4_000n) + (1n * 90_000n);
    expect(afterSeal - beforeSeal).toBe(feeA + feeB);
  });

  it('enforces admin + bounds on split fee setters', () => {
    const nonAdmin = setSealFeeUnit(wallet1, 120_000n);
    expect(nonAdmin).toBeErr(Cl.uint(100));

    const tooHigh = setBeginFeeUnit(deployer, 300_000n);
    expect(tooHigh).toBeErr(Cl.uint(110));

    const tooLowRelative = setUploadBatchFeeUnit(deployer, 9_999n);
    expect(tooLowRelative).toBeErr(Cl.uint(110));

    const tooLowAbsolute = setUploadChunkFeeUnit(deployer, 999n);
    expect(tooLowAbsolute).toBeErr(Cl.uint(110));

    const tooHighAbsolute = setSealFeeUnit(deployer, 1_000_001n);
    expect(tooHighAbsolute).toBeErr(Cl.uint(110));

    unwrapOk(setBeginFeeUnit(deployer, 200_000n));
    unwrapOk(setUploadChunkFeeUnit(deployer, 3_000n));
    unwrapOk(setUploadBatchFeeUnit(deployer, 200_000n));
    unwrapOk(setSealFeeUnit(deployer, 200_000n));

    expect(
      simnet.callReadOnlyFn(contract, 'get-begin-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-upload-chunk-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(3_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-upload-batch-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-seal-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
  });

  it('keeps legacy set-fee-unit as a convenience profile', () => {
    unwrapOk(setFeeUnit(deployer, 200_000n));

    expect(simnet.callReadOnlyFn(contract, 'get-fee-unit', [], deployer).result).toBeOk(
      Cl.uint(200_000)
    );
    expect(
      simnet.callReadOnlyFn(contract, 'get-begin-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-upload-batch-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-seal-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(200_000));
    expect(
      simnet.callReadOnlyFn(contract, 'get-upload-chunk-fee-unit', [], deployer).result
    ).toBeOk(Cl.uint(4_000));
  });
});
