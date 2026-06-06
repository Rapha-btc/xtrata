import { createHash } from 'crypto';
import { readFileSync } from 'node:fs';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const contract = `${deployer}.xtrata-v3-2-1`;
const helperContract = `${deployer}.xtrata-small-mint-v1-1`;
const v2_1_0 = `${deployer}.xtrata-v2-1-0`;
const v2_1_1 = `${deployer}.xtrata-v2-1-1`;
const corePrincipal = Cl.contractPrincipal(deployer, 'xtrata-v3-2-1');
const mime = 'text/plain';
const contractSource = readFileSync(new URL('../contracts/xtrata-v3.2.1.clar', import.meta.url), 'utf8');
const liveContractSource = readFileSync(new URL('../../live/xtrata-v3.2.1.clar', import.meta.url), 'utf8');

const CHUNK_SIZE = 16 * 1024;
const MAX_SINGLE_CHUNKS = 32;
const EXPIRY_BLOCKS = 4_320;

function byteHex(value: number, length = 1) {
  return value.toString(16).padStart(2, '0').repeat(length);
}

function fullChunk(value: number) {
  return byteHex(value, CHUNK_SIZE);
}

function totalSize(chunksHex: string[]) {
  return chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
}

function computeFinalHash(chunksHex: string[]) {
  let running = Buffer.alloc(32, 0);
  for (const chunkHex of chunksHex) {
    const digest = createHash('sha256');
    digest.update(Buffer.concat([running, Buffer.from(chunkHex, 'hex')]));
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

function unwrapSome(result: any) {
  expect(result.type).toBe(ClarityType.OptionalSome);
  return result.value;
}

function unwrapMintTokenId(result: any) {
  const tuple = unwrapOk(result);
  expect(tuple.type).toBe(ClarityType.Tuple);
  return unwrapUInt(tuple.value['token-id']);
}

function stxBalance(address: string) {
  return simnet.getAssetsMap().get('STX')?.get(address) || 0n;
}

function setPaused(target: string, value: boolean, sender = deployer) {
  return simnet.callPublicFn(target, 'set-paused', [Cl.bool(value)], sender).result;
}

function setHelperCoreContract(sender = deployer) {
  return simnet.callPublicFn(helperContract, 'set-core-contract', [corePrincipal], sender).result;
}

function begin(target: string, sender: string, hash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    target,
    'begin-inscription',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize(chunksHex)),
      Cl.uint(chunksHex.length)
    ],
    sender
  ).result;
}

function beginWithShape(target: string, sender: string, hash: string, size: number, chunkCount: number) {
  return simnet.callPublicFn(
    target,
    'begin-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(mime), Cl.uint(size), Cl.uint(chunkCount)],
    sender
  ).result;
}

function addBatch(target: string, sender: string, hash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    target,
    'add-chunk-batch',
    [Cl.bufferFromHex(hash), Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))],
    sender
  ).result;
}

function readUploadState(hash: string, sender: string) {
  const state = unwrapSome(
    simnet.callReadOnlyFn(
      contract,
      'get-upload-state',
      [Cl.bufferFromHex(hash), Cl.standardPrincipal(sender)],
      deployer
    ).result
  );
  expect(state.type).toBe(ClarityType.Tuple);
  return state.value;
}

function expectAbiFailureOrErr(call: () => unknown, errCode: number) {
  try {
    const result = call();
    expect(result).toBeErr(Cl.uint(errCode));
  } catch (error) {
    expect(error).toBeTruthy();
  }
}

function seal(target: string, sender: string, hash: string, uri: string) {
  return simnet.callPublicFn(
    target,
    'seal-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(uri)],
    sender
  ).result;
}

function sealRecursive(sender: string, hash: string, uri: string, dependencies: bigint[]) {
  return simnet.callPublicFn(
    contract,
    'seal-recursive',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(uri),
      Cl.list(dependencies.map((id) => Cl.uint(id)))
    ],
    sender
  ).result;
}

function sealWithRelationships(sender: string, hash: string, uri: string, dependencies: bigint[], parents: bigint[]) {
  return simnet.callPublicFn(
    contract,
    'seal-with-relationships',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(uri),
      Cl.list(dependencies.map((id) => Cl.uint(id))),
      Cl.list(parents.map((id) => Cl.uint(id)))
    ],
    sender
  ).result;
}

function mintSingle(sender: string, chunksHex: string[], uri = 'data:text/plain,single') {
  const hash = computeFinalHash(chunksHex);
  return {
    hash,
    result: simnet.callPublicFn(
      contract,
      'mint-single-tx',
      [
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(totalSize(chunksHex)),
        Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
        Cl.stringAscii(uri)
      ],
      sender
    ).result
  };
}

function mintSingleWithRelationships(sender: string, chunksHex: string[], dependencies: bigint[], parents: bigint[]) {
  const hash = computeFinalHash(chunksHex);
  return {
    hash,
    result: simnet.callPublicFn(
      contract,
      'mint-single-tx-with-relationships',
      [
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(totalSize(chunksHex)),
        Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
        Cl.stringAscii('data:text/plain,relationship'),
        Cl.list(dependencies.map((id) => Cl.uint(id))),
        Cl.list(parents.map((id) => Cl.uint(id)))
      ],
      sender
    ).result
  };
}

function mintHelperSmall(sender: string, chunksHex: string[], uri = 'data:text/plain,helper') {
  const hash = computeFinalHash(chunksHex);
  return {
    hash,
    result: simnet.callPublicFn(
      helperContract,
      'mint-small-single-tx',
      [
        corePrincipal,
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(totalSize(chunksHex)),
        Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
        Cl.stringAscii(uri)
      ],
      sender
    ).result
  };
}

function mintStaged(target: string, sender: string, chunksHex: string[], uri: string) {
  const hash = computeFinalHash(chunksHex);
  unwrapOk(begin(target, sender, hash, chunksHex));
  for (let index = 0; index < chunksHex.length; index += MAX_SINGLE_CHUNKS) {
    unwrapOk(addBatch(target, sender, hash, chunksHex.slice(index, index + MAX_SINGLE_CHUNKS)));
  }
  return unwrapUInt(unwrapOk(seal(target, sender, hash, uri)));
}

describe('xtrata-v3.2.1 fixed 16 KiB core', () => {
  it('exposes fixed contract info and supports SIP-009 mint, transfer, URI, and enumeration', () => {
    unwrapOk(setPaused(contract, false));

    expect(simnet.callReadOnlyFn(contract, 'get-contract-info', [], deployer).result).toBeOk(
      Cl.tuple({
        version: Cl.stringAscii('xtrata-v3.2.1'),
        'chunk-size': Cl.uint(CHUNK_SIZE),
        'upload-batch-limit': Cl.uint(32),
        'upload-payload-limit': Cl.uint(512 * 1024),
        'single-tx-chunk-limit': Cl.uint(32),
        'single-tx-payload-limit': Cl.uint(512 * 1024),
        'general-list-limit': Cl.uint(50),
        'seal-batch-limit': Cl.uint(50),
        'max-total-chunks': Cl.uint(2048),
        'max-total-size': Cl.uint(2048 * CHUNK_SIZE)
      })
    );

    const { hash, result } = mintSingle(wallet1, [byteHex(0x01)], 'data:text/plain,one-byte');
    expect(result).toBeOk(Cl.tuple({ 'token-id': Cl.uint(0), existed: Cl.bool(false) }));

    expect(simnet.callReadOnlyFn(contract, 'get-owner', [Cl.uint(0)], deployer).result).toBeOk(
      Cl.some(Cl.standardPrincipal(wallet1))
    );
    expect(simnet.callReadOnlyFn(contract, 'get-token-uri', [Cl.uint(0)], deployer).result).toBeOk(
      Cl.some(Cl.stringAscii('data:text/plain,one-byte'))
    );
    expect(simnet.callReadOnlyFn(contract, 'get-last-token-id', [], deployer).result).toBeOk(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-minted-count', [], deployer).result).toBeOk(Cl.uint(1));
    expect(simnet.callReadOnlyFn(contract, 'get-minted-id', [Cl.uint(0)], deployer).result).toBeSome(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(0), Cl.uint(0)], deployer).result)
      .toBeSome(Cl.bufferFromHex(byteHex(0x01)));

    unwrapOk(
      simnet.callPublicFn(
        contract,
        'transfer',
        [Cl.uint(0), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      ).result
    );
    expect(simnet.callReadOnlyFn(contract, 'get-owner', [Cl.uint(0)], deployer).result).toBeOk(
      Cl.some(Cl.standardPrincipal(wallet2))
    );
  });

  it('uses list 32 ABI for upload-style chunk payload routes', () => {
    const uploadChunkFns: Array<[string, 'define-public' | 'define-private']> = [
      ['add-chunk-batch', 'define-public'],
      ['mint-single-tx-internal', 'define-private'],
      ['mint-single-tx', 'define-public'],
      ['mint-single-tx-recursive', 'define-public'],
      ['mint-single-tx-with-relationships', 'define-public']
    ];

    for (const [name, kind] of uploadChunkFns) {
      const start = contractSource.indexOf(`(${kind} (${name}`);
      expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
      const header = contractSource.slice(start, start + 420);
      expect(header).toContain('(chunks (list 32 (buff 16384)))');
      expect(header).not.toContain('(chunks (list 50 (buff 16384)))');
    }
  });

  it('keeps local and mainnet SIP-009 trait variants aligned to their deployment targets', () => {
    expect(contractSource).toContain('(impl-trait .sip009-nft-trait.nft-trait)');
    expect(contractSource).toContain('(use-trait nft-trait .sip009-nft-trait.nft-trait)');
    expect(contractSource).toContain(";; (impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)");
    expect(contractSource).toContain(";; (use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)");

    expect(liveContractSource).toContain("(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)");
    expect(liveContractSource).toContain("(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)");
    expect(liveContractSource).toContain(';; (impl-trait .sip009-nft-trait.nft-trait)');
    expect(liveContractSource).toContain(';; (use-trait nft-trait .sip009-nft-trait.nft-trait)');
  });

  it('mints duplicate single-tx content as new token IDs with different token URIs', () => {
    unwrapOk(setPaused(contract, false));

    const chunks = [byteHex(0xb0)];
    const hash = computeFinalHash(chunks);

    expect(mintSingle(wallet1, chunks, 'data:text/plain,single-first').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(0), existed: Cl.bool(false) }));
    expect(mintSingle(wallet2, chunks, 'data:text/plain,single-duplicate').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(1), existed: Cl.bool(false) }));

    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-token-uri', [Cl.uint(0)], deployer).result)
      .toBeOk(Cl.some(Cl.stringAscii('data:text/plain,single-first')));
    expect(simnet.callReadOnlyFn(contract, 'get-token-uri', [Cl.uint(1)], deployer).result)
      .toBeOk(Cl.some(Cl.stringAscii('data:text/plain,single-duplicate')));
  });

  it('mints duplicate staged content as a new token and keeps hash lookup first-seen', () => {
    unwrapOk(setPaused(contract, false));

    const chunks = [fullChunk(0xb1), byteHex(0xb2, 12)];
    const hash = computeFinalHash(chunks);

    expect(mintStaged(contract, wallet1, chunks, 'data:text/plain,staged-first')).toBe(0n);
    expect(mintStaged(contract, wallet1, chunks, 'data:text/plain,staged-duplicate')).toBe(1n);

    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-token-uri', [Cl.uint(1)], deployer).result)
      .toBeOk(Cl.some(Cl.stringAscii('data:text/plain,staged-duplicate')));
  });

  it('mints duplicate content in a different parent/dependency relationship context', () => {
    unwrapOk(setPaused(contract, false));

    const parentId = unwrapMintTokenId(mintSingle(wallet1, [byteHex(0xb5)], 'data:text/plain,parent-context').result);
    const dependencyId = unwrapMintTokenId(mintSingle(wallet2, [byteHex(0xb6)], 'data:text/plain,dependency-context').result);
    const duplicateChunks = [byteHex(0xb7)];
    const duplicateHash = computeFinalHash(duplicateChunks);

    const plain = mintSingle(wallet1, duplicateChunks, 'data:text/plain,relationship-plain');
    expect(plain.result).toBeOk(Cl.tuple({ 'token-id': Cl.uint(2), existed: Cl.bool(false) }));

    const related = mintSingleWithRelationships(wallet1, duplicateChunks, [dependencyId], [parentId]);
    expect(related.result).toBeOk(Cl.tuple({ 'token-id': Cl.uint(3), existed: Cl.bool(false) }));

    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(duplicateHash)], deployer).result)
      .toBeSome(Cl.uint(2));
    expect(simnet.callReadOnlyFn(contract, 'get-dependencies', [Cl.uint(2)], deployer).result)
      .toBeList([]);
    expect(simnet.callReadOnlyFn(contract, 'get-parents', [Cl.uint(2)], deployer).result)
      .toBeList([]);
    expect(simnet.callReadOnlyFn(contract, 'get-dependencies', [Cl.uint(3)], deployer).result)
      .toBeList([Cl.uint(dependencyId)]);
    expect(simnet.callReadOnlyFn(contract, 'get-parents', [Cl.uint(3)], deployer).result)
      .toBeList([Cl.uint(parentId)]);
  });

  it('begin-or-get starts duplicate uploads instead of returning an existing hash token', () => {
    unwrapOk(setPaused(contract, false));

    const chunks = [byteHex(0xb3)];
    const hash = computeFinalHash(chunks);

    expect(mintSingle(wallet1, chunks, 'data:text/plain,begin-or-get-first').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(0), existed: Cl.bool(false) }));

    expect(
      simnet.callPublicFn(
        contract,
        'begin-or-get',
        [Cl.bufferFromHex(hash), Cl.stringAscii(mime), Cl.uint(totalSize(chunks)), Cl.uint(chunks.length)],
        wallet2
      ).result
    ).toBeOk(Cl.none());
    unwrapOk(addBatch(contract, wallet2, hash, chunks));
    expect(seal(contract, wallet2, hash, 'data:text/plain,begin-or-get-duplicate'))
      .toBeOk(Cl.uint(1));

    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(0));
  });

  it('migrates a legacy token even when its hash already has a first-seen token', () => {
    unwrapOk(setPaused(v2_1_0, false));
    unwrapOk(simnet.callPublicFn(contract, 'set-next-id', [Cl.uint(10)], deployer).result);
    unwrapOk(setPaused(contract, false));

    const chunks = [byteHex(0xb4)];
    const hash = computeFinalHash(chunks);
    const legacyId = mintStaged(v2_1_0, wallet1, chunks, 'data:text/plain,legacy-same-hash');

    expect(mintSingle(wallet2, chunks, 'data:text/plain,first-seen-before-migration').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(10), existed: Cl.bool(false) }));
    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(10));

    expect(simnet.callPublicFn(contract, 'migrate-from-v2-1-0', [Cl.uint(legacyId)], wallet1).result)
      .toBeOk(Cl.uint(legacyId));
    expect(simnet.callReadOnlyFn(contract, 'get-owner', [Cl.uint(legacyId)], deployer).result)
      .toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    expect(simnet.callReadOnlyFn(v2_1_0, 'get-owner', [Cl.uint(legacyId)], deployer).result)
      .toBeOk(Cl.some(Cl.contractPrincipal(deployer, 'xtrata-v3-2-1')));
    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(10));
  });

  it('enforces exact 16 KiB non-final chunks and a declared-size-consistent final chunk', () => {
    unwrapOk(setPaused(contract, false));

    const invalidCountHash = computeFinalHash([byteHex(0x10)]);
    expect(beginWithShape(contract, wallet1, invalidCountHash, 1, 2)).toBeErr(Cl.uint(102));

    const tooSmallNonFinal = [byteHex(0x11), byteHex(0x12)];
    const tooSmallHash = computeFinalHash(tooSmallNonFinal);
    unwrapOk(beginWithShape(contract, wallet1, tooSmallHash, CHUNK_SIZE + 1, 2));
    expect(addBatch(contract, wallet1, tooSmallHash, [tooSmallNonFinal[0]])).toBeErr(Cl.uint(102));

    const validPartialFinal = [fullChunk(0x13), byteHex(0x14)];
    const validHash = computeFinalHash(validPartialFinal);
    unwrapOk(begin(contract, wallet1, validHash, validPartialFinal));
    unwrapOk(addBatch(contract, wallet1, validHash, [validPartialFinal[0]]));
    expect(seal(contract, wallet1, validHash, 'data:text/plain,too-early')).toBeErr(Cl.uint(102));
    unwrapOk(addBatch(contract, wallet1, validHash, [validPartialFinal[1]]));
    expect(seal(contract, wallet1, validHash, 'data:text/plain,partial-final')).toBeOk(Cl.uint(0));
    expect(addBatch(contract, wallet1, validHash, [byteHex(0x15)])).toBeErr(Cl.uint(101));
  });

  it('caps actual upload batches at 32 chunks and rejects oversized single-tx attempts', () => {
    unwrapOk(setPaused(contract, false));

    const thirtyThree = Array.from({ length: 33 }, (_, index) => fullChunk(0x20 + index));
    const hash = computeFinalHash(thirtyThree);
    unwrapOk(begin(contract, wallet1, hash, thirtyThree));

    expectAbiFailureOrErr(() => addBatch(contract, wallet1, hash, thirtyThree), 102);
    unwrapOk(addBatch(contract, wallet1, hash, thirtyThree.slice(0, 32)));
    unwrapOk(addBatch(contract, wallet1, hash, thirtyThree.slice(32)));
    expect(seal(contract, wallet1, hash, 'data:text/plain,thirty-three')).toBeOk(Cl.uint(0));

    const exactUploadBatch = Array.from({ length: 32 }, (_, index) => fullChunk(0x50 + index));
    const exactHash = computeFinalHash(exactUploadBatch);
    unwrapOk(begin(contract, wallet2, exactHash, exactUploadBatch));
    unwrapOk(addBatch(contract, wallet2, exactHash, exactUploadBatch));
    expect(seal(contract, wallet2, exactHash, 'data:text/plain,exact-upload-batch')).toBeOk(Cl.uint(1));

    expectAbiFailureOrErr(() => mintSingle(wallet2, thirtyThree, 'data:text/plain,oversized').result, 102);
  });

  it('resumes a staged upload without charging a second begin fee or resetting current-index', () => {
    unwrapOk(setPaused(contract, false));
    unwrapOk(
      simnet.callPublicFn(
        contract,
        'set-royalty-recipient',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    );

    const chunks = Array.from({ length: 33 }, (_, index) => fullChunk(0x9a + index));
    const hash = computeFinalHash(chunks);

    const beforeBegin = stxBalance(wallet2);
    unwrapOk(begin(contract, wallet1, hash, chunks));
    const afterBegin = stxBalance(wallet2);
    expect(afterBegin - beforeBegin).toBe(100_000n);

    unwrapOk(addBatch(contract, wallet1, hash, chunks.slice(0, 32)));
    let uploadState = readUploadState(hash, wallet1);
    expect(uploadState['mime-type']).toStrictEqual(Cl.stringAscii(mime));
    expect(uploadState['total-size']).toStrictEqual(Cl.uint(totalSize(chunks)));
    expect(uploadState['total-chunks']).toStrictEqual(Cl.uint(33));
    expect(uploadState['current-index']).toStrictEqual(Cl.uint(32));

    const beforeResume = stxBalance(wallet2);
    unwrapOk(begin(contract, wallet1, hash, chunks));
    const afterResume = stxBalance(wallet2);
    expect(afterResume - beforeResume).toBe(0n);
    uploadState = readUploadState(hash, wallet1);
    expect(uploadState['mime-type']).toStrictEqual(Cl.stringAscii(mime));
    expect(uploadState['total-size']).toStrictEqual(Cl.uint(totalSize(chunks)));
    expect(uploadState['total-chunks']).toStrictEqual(Cl.uint(33));
    expect(uploadState['current-index']).toStrictEqual(Cl.uint(32));

    unwrapOk(addBatch(contract, wallet1, hash, chunks.slice(32)));
    expect(seal(contract, wallet1, hash, 'data:text/plain,resumed-staged-upload'))
      .toBeOk(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-chunks', [Cl.uint(0)], deployer).result)
      .toBeSome(Cl.uint(33));
  });

  it('rejects staged resume attempts with mismatched file metadata without mutating upload state', () => {
    unwrapOk(setPaused(contract, false));
    unwrapOk(
      simnet.callPublicFn(
        contract,
        'set-royalty-recipient',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    );

    const chunks = [fullChunk(0xba), fullChunk(0xbb), byteHex(0xbc, 7)];
    const hash = computeFinalHash(chunks);

    unwrapOk(begin(contract, wallet1, hash, chunks));
    unwrapOk(addBatch(contract, wallet1, hash, [chunks[0]]));
    const beforeBadResume = stxBalance(wallet2);

    expect(beginWithShape(contract, wallet1, hash, totalSize(chunks) + 1, chunks.length))
      .toBeErr(Cl.uint(102));
    expect(beginWithShape(contract, wallet1, hash, totalSize(chunks), chunks.length + 1))
      .toBeErr(Cl.uint(102));
    const afterBadResume = stxBalance(wallet2);
    expect(afterBadResume - beforeBadResume).toBe(0n);

    const uploadState = readUploadState(hash, wallet1);
    expect(uploadState['mime-type']).toStrictEqual(Cl.stringAscii(mime));
    expect(uploadState['total-size']).toStrictEqual(Cl.uint(totalSize(chunks)));
    expect(uploadState['total-chunks']).toStrictEqual(Cl.uint(3));
    expect(uploadState['current-index']).toStrictEqual(Cl.uint(1));

    unwrapOk(begin(contract, wallet1, hash, chunks));
    unwrapOk(addBatch(contract, wallet1, hash, chunks.slice(1)));
    expect(seal(contract, wallet1, hash, 'data:text/plain,metadata-resume-safe'))
      .toBeOk(Cl.uint(0));
  });

  it('mints through the v3.2.1 small-mint helper with list 32 ABI and policy cap 30', () => {
    unwrapOk(setPaused(contract, false));
    unwrapOk(setHelperCoreContract());
    unwrapOk(setPaused(helperContract, false));

    expect(simnet.callReadOnlyFn(helperContract, 'get-max-small-chunks', [], deployer).result)
      .toBeOk(Cl.uint(30));

    const exactHelperBatch = Array.from({ length: 30 }, (_, index) => fullChunk(0x60 + index));
    const hash = computeFinalHash(exactHelperBatch);
    const result = mintHelperSmall(wallet1, exactHelperBatch, 'data:text/plain,helper-30');

    expect(result.result).toBeOk(Cl.tuple({ 'token-id': Cl.uint(0), existed: Cl.bool(false) }));
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-chunks', [Cl.uint(0)], deployer).result)
      .toBeSome(Cl.uint(30));
    expect(simnet.callReadOnlyFn(contract, 'get-id-by-hash', [Cl.bufferFromHex(hash)], deployer).result)
      .toBeSome(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-token-uri', [Cl.uint(0)], deployer).result)
      .toBeOk(Cl.some(Cl.stringAscii('data:text/plain,helper-30')));

    const overPolicyBatch = Array.from({ length: 31 }, (_, index) => fullChunk(0x80 + index));
    expect(mintHelperSmall(wallet1, overPolicyBatch, 'data:text/plain,helper-31').result)
      .toBeErr(Cl.uint(102));
  });

  it('reconstructs a 33-chunk staged file uploaded as 32 plus 1 batches', () => {
    unwrapOk(setPaused(contract, false));

    const chunks = Array.from({ length: 33 }, (_, index) => fullChunk(0xc0 + index));
    const hash = computeFinalHash(chunks);
    const indexes = chunks.map((_, index) => Cl.uint(index));

    unwrapOk(begin(contract, wallet1, hash, chunks));
    unwrapOk(addBatch(contract, wallet1, hash, chunks.slice(0, 32)));
    unwrapOk(addBatch(contract, wallet1, hash, chunks.slice(32)));
    expect(seal(contract, wallet1, hash, 'data:text/plain,thirty-three-reconstruct'))
      .toBeOk(Cl.uint(0));

    expect(simnet.callReadOnlyFn(contract, 'get-chunk-batch', [Cl.uint(0), Cl.list(indexes)], deployer).result)
      .toBeList(chunks.map((chunk) => Cl.some(Cl.bufferFromHex(chunk))));
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-hash', [Cl.uint(0)], deployer).result)
      .toBeSome(Cl.bufferFromHex(hash));
  });

  it('mints one-byte, one-chunk, small, and exact 512 KiB files through the single-call route', () => {
    unwrapOk(setPaused(contract, false));

    expect(mintSingle(wallet1, [byteHex(0x30)], 'data:text/plain,one-byte').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(0), existed: Cl.bool(false) }));
    expect(mintSingle(wallet1, [fullChunk(0x31)], 'data:text/plain,one-full-chunk').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(1), existed: Cl.bool(false) }));
    expect(mintSingle(wallet1, [fullChunk(0x32), byteHex(0x33, 8)], 'data:text/plain,small').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(2), existed: Cl.bool(false) }));

    const exact512KiB = Array.from({ length: 32 }, (_, index) => fullChunk(0x40 + index));
    expect(mintSingle(wallet1, exact512KiB, 'data:text/plain,exact-512k').result)
      .toBeOk(Cl.tuple({ 'token-id': Cl.uint(3), existed: Cl.bool(false) }));
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-size', [Cl.uint(3)], deployer).result)
      .toBeSome(Cl.uint(512 * 1024));
  });

  it('quotes and charges the single-call fee once instead of staged begin plus seal', () => {
    unwrapOk(setPaused(contract, false));
    unwrapOk(
      simnet.callPublicFn(
        contract,
        'set-royalty-recipient',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    );

    expect(simnet.callReadOnlyFn(contract, 'quote-staged-fee', [Cl.uint(1), Cl.uint(1)], deployer).result)
      .toBeOk(Cl.tuple({
        mode: Cl.uint(1),
        'chunk-size': Cl.uint(CHUNK_SIZE),
        'upload-batch-limit': Cl.uint(32),
        'upload-batches': Cl.uint(1),
        'single-tx-eligible': Cl.bool(true),
        'begin-fee': Cl.uint(100_000),
        'seal-fee': Cl.uint(102_000),
        'single-tx-fee': Cl.uint(102_000),
        'total-fee': Cl.uint(202_000)
      }));
    expect(simnet.callReadOnlyFn(contract, 'quote-single-tx-fee', [Cl.uint(1), Cl.uint(1)], deployer).result)
      .toBeOk(Cl.tuple({
        mode: Cl.uint(2),
        'chunk-size': Cl.uint(CHUNK_SIZE),
        'upload-batch-limit': Cl.uint(32),
        'upload-batches': Cl.uint(1),
        'single-tx-eligible': Cl.bool(true),
        'begin-fee': Cl.uint(100_000),
        'seal-fee': Cl.uint(102_000),
        'single-tx-fee': Cl.uint(102_000),
        'total-fee': Cl.uint(102_000)
      }));

    const before = stxBalance(wallet2);
    unwrapOk(mintSingle(wallet1, [byteHex(0x50)], 'data:text/plain,fee').result);
    const after = stxBalance(wallet2);
    expect(after - before).toBe(102_000n);
  });

  it('rolls back failed single-call mint writes on hash mismatch', () => {
    unwrapOk(setPaused(contract, false));
    const chunk = byteHex(0x60);
    const wrongHash = computeFinalHash([byteHex(0x61)]);

    const result = simnet.callPublicFn(
      contract,
      'mint-single-tx',
      [
        Cl.bufferFromHex(wrongHash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.list([Cl.bufferFromHex(chunk)]),
        Cl.stringAscii('data:text/plain,bad-hash')
      ],
      wallet1
    ).result;
    expect(result).toBeErr(Cl.uint(103));
    expect(simnet.callReadOnlyFn(contract, 'get-minted-count', [], deployer).result).toBeOk(Cl.uint(0));
    expect(simnet.callReadOnlyFn(contract, 'get-pending-chunk', [Cl.bufferFromHex(wrongHash), Cl.standardPrincipal(wallet1), Cl.uint(0)], deployer).result)
      .toBeNone();
  });

  it('keeps dependencies open but enforces parent ownership and duplicate-parent rejection', () => {
    unwrapOk(setPaused(contract, false));

    const parentId = unwrapMintTokenId(mintSingle(wallet2, [byteHex(0x70)], 'data:text/plain,parent').result);
    const dependencyChild = mintSingleWithRelationships(wallet1, [byteHex(0x71)], [parentId], []);
    expect(dependencyChild.result).toBeOk(
      Cl.tuple({ 'token-id': Cl.uint(1), existed: Cl.bool(false) })
    );
    expect(simnet.callReadOnlyFn(contract, 'get-dependencies', [Cl.uint(1)], deployer).result)
      .toBeList([Cl.uint(parentId)]);

    const unownedParent = mintSingleWithRelationships(wallet1, [byteHex(0x72)], [], [parentId]);
    expect(unownedParent.result).toBeErr(Cl.uint(100));

    unwrapOk(
      simnet.callPublicFn(
        contract,
        'transfer',
        [Cl.uint(parentId), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet1)],
        wallet2
      ).result
    );

    const duplicateParents = mintSingleWithRelationships(wallet1, [byteHex(0x73)], [], [parentId, parentId]);
    expect(duplicateParents.result).toBeErr(Cl.uint(114));

    const child = mintSingleWithRelationships(wallet1, [byteHex(0x74)], [], [parentId]);
    expect(child.result).toBeOk(Cl.tuple({ 'token-id': Cl.uint(2), existed: Cl.bool(false) }));
    expect(simnet.callReadOnlyFn(contract, 'get-parents', [Cl.uint(2)], deployer).result)
      .toBeList([Cl.uint(parentId)]);
  });

  it('migrates from both live v2.1 contracts with same-id ownership, source lineage, and chunk fallback', () => {
    unwrapOk(setPaused(v2_1_0, false));
    unwrapOk(setPaused(v2_1_1, false));
    unwrapOk(setPaused(contract, false));
    unwrapOk(simnet.callPublicFn(v2_1_1, 'set-next-id', [Cl.uint(10)], deployer).result);

    const v210Id = mintStaged(v2_1_0, wallet1, [byteHex(0x80)], 'data:text/plain,v210');
    const v211Id = mintStaged(v2_1_1, wallet2, [byteHex(0x81)], 'data:text/plain,v211');

    expect(simnet.callPublicFn(contract, 'migrate-from-v2-1-0', [Cl.uint(v210Id)], wallet1).result)
      .toBeOk(Cl.uint(v210Id));
    expect(simnet.callPublicFn(contract, 'migrate-from-v2-1-1', [Cl.uint(v211Id)], wallet2).result)
      .toBeOk(Cl.uint(v211Id));

    expect(simnet.callReadOnlyFn(contract, 'get-owner', [Cl.uint(v210Id)], deployer).result)
      .toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    expect(simnet.callReadOnlyFn(v2_1_0, 'get-owner', [Cl.uint(v210Id)], deployer).result)
      .toBeOk(Cl.some(Cl.contractPrincipal(deployer, 'xtrata-v3-2-1')));
    expect(simnet.callReadOnlyFn(contract, 'get-migration-source', [Cl.uint(v210Id)], deployer).result)
      .toBeSome(Cl.tuple({
        'source-contract': Cl.contractPrincipal(deployer, 'xtrata-v2-1-0'),
        'source-id': Cl.uint(v210Id)
      }));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(v210Id), Cl.uint(0)], deployer).result)
      .toBeSome(Cl.bufferFromHex(byteHex(0x80)));

    expect(simnet.callReadOnlyFn(contract, 'get-owner', [Cl.uint(v211Id)], deployer).result)
      .toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));
    expect(simnet.callReadOnlyFn(v2_1_1, 'get-owner', [Cl.uint(v211Id)], deployer).result)
      .toBeOk(Cl.some(Cl.contractPrincipal(deployer, 'xtrata-v3-2-1')));
    expect(simnet.callReadOnlyFn(contract, 'get-next-token-id', [], deployer).result)
      .toBeOk(Cl.uint(v211Id + 1n));
  });

  it('rejects cross-contract migration when two legacy sources share the same token id', () => {
    unwrapOk(setPaused(v2_1_0, false));
    unwrapOk(setPaused(v2_1_1, false));
    unwrapOk(setPaused(contract, false));

    const v210Id = mintStaged(v2_1_0, wallet1, [byteHex(0xd0)], 'data:text/plain,v210-collision');
    const v211Id = mintStaged(v2_1_1, wallet2, [byteHex(0xd1)], 'data:text/plain,v211-collision');

    expect(v210Id).toBe(0n);
    expect(v211Id).toBe(0n);
    expect(simnet.callPublicFn(contract, 'migrate-from-v2-1-0', [Cl.uint(v210Id)], wallet1).result)
      .toBeOk(Cl.uint(v210Id));
    expect(simnet.callPublicFn(contract, 'migrate-from-v2-1-1', [Cl.uint(v211Id)], wallet2).result)
      .toBeErr(Cl.uint(114));

    expect(simnet.callReadOnlyFn(contract, 'get-migration-source', [Cl.uint(v210Id)], deployer).result)
      .toBeSome(Cl.tuple({
        'source-contract': Cl.contractPrincipal(deployer, 'xtrata-v2-1-0'),
        'source-id': Cl.uint(v210Id)
      }));
    expect(simnet.callReadOnlyFn(v2_1_1, 'get-owner', [Cl.uint(v211Id)], deployer).result)
      .toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));
  });

  it('expires and purges abandoned staged uploads without touching sealed state', () => {
    unwrapOk(setPaused(contract, false));
    const chunks = [fullChunk(0x90), byteHex(0x91)];
    const hash = computeFinalHash(chunks);

    unwrapOk(begin(contract, wallet1, hash, chunks));
    unwrapOk(addBatch(contract, wallet1, hash, [chunks[0]]));

    expect(
      simnet.callPublicFn(
        contract,
        'purge-expired-chunk-batch',
        [Cl.bufferFromHex(hash), Cl.standardPrincipal(wallet1), Cl.list([Cl.uint(0)])],
        wallet2
      ).result
    ).toBeErr(Cl.uint(113));

    simnet.mineEmptyBlocks(EXPIRY_BLOCKS + 1);
    expect(addBatch(contract, wallet1, hash, [chunks[1]])).toBeErr(Cl.uint(112));
    expect(
      simnet.callPublicFn(
        contract,
        'purge-expired-chunk-batch',
        [Cl.bufferFromHex(hash), Cl.standardPrincipal(wallet1), Cl.list([Cl.uint(0)])],
        wallet2
      ).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(
        contract,
        'purge-expired-chunk-batch',
        [Cl.bufferFromHex(hash), Cl.standardPrincipal(wallet1), Cl.list([Cl.uint(1)])],
        wallet2
      ).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn(contract, 'get-upload-state', [Cl.bufferFromHex(hash), Cl.standardPrincipal(wallet1)], deployer).result)
      .toBeNone();
    expect(simnet.callReadOnlyFn(contract, 'get-pending-chunk', [Cl.bufferFromHex(hash), Cl.standardPrincipal(wallet1), Cl.uint(0)], deployer).result)
      .toBeNone();
  });

  it('returns summary/meta values needed for independent reconstruction', () => {
    unwrapOk(setPaused(contract, false));
    const chunks = [fullChunk(0xa0), byteHex(0xa1, 4)];
    const hash = computeFinalHash(chunks);
    unwrapOk(begin(contract, wallet1, hash, chunks));
    unwrapOk(addBatch(contract, wallet1, hash, chunks));
    unwrapUInt(unwrapOk(sealRecursive(wallet1, hash, 'data:text/plain,summary', [])));

    expect(simnet.callReadOnlyFn(contract, 'get-inscription-meta', [Cl.uint(0)], deployer).result)
      .toBeSome(Cl.tuple({
        owner: Cl.standardPrincipal(wallet1),
        creator: Cl.standardPrincipal(wallet1),
        'mime-type': Cl.stringAscii(mime),
        'total-size': Cl.uint(totalSize(chunks)),
        'total-chunks': Cl.uint(2),
        sealed: Cl.bool(true),
        'final-hash': Cl.bufferFromHex(hash)
      }));
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-summary', [Cl.uint(0)], deployer).result)
      .toBeOk(Cl.some(Cl.tuple({
        owner: Cl.standardPrincipal(wallet1),
        creator: Cl.standardPrincipal(wallet1),
        'mime-type': Cl.stringAscii(mime),
        'total-size': Cl.uint(totalSize(chunks)),
        'total-chunks': Cl.uint(2),
        'chunk-size': Cl.uint(CHUNK_SIZE),
        sealed: Cl.bool(true),
        'final-hash': Cl.bufferFromHex(hash),
        'token-uri': Cl.some(Cl.stringAscii('data:text/plain,summary')),
        dependencies: Cl.list([]),
        parents: Cl.list([]),
        'migration-source': Cl.none()
      })));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk-batch', [Cl.uint(0), Cl.list([Cl.uint(0), Cl.uint(1)])], deployer).result)
      .toBeList([Cl.some(Cl.bufferFromHex(chunks[0])), Cl.some(Cl.bufferFromHex(chunks[1]))]);
  });
});
