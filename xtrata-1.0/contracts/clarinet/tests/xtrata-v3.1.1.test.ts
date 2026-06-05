import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

const v2Contract = `${deployer}.xtrata-v2-1-0`;
const contract = `${deployer}.xtrata-v3-1-1`;
const helperPrincipal = Cl.contractPrincipal(deployer, 'xtrata-small-mint-v1-0');
const mime = 'text/plain';

const PROFILE_SMALL = 1n;
const PROFILE_STANDARD = 2n;
const PROFILE_MAXIMUM = 3n;

const SIZE_SMALL = 16 * 1024;
const SIZE_STANDARD = 64 * 1024;
const SIZE_MAXIMUM = 128 * 1024;
const MAX_CHUNKS = 2048;
const MAX_UPLOAD_BYTES = 512 * 1024;

type ProfileCase = {
  name: string;
  profile: bigint;
  size: number;
  fill: number;
  batchLimit: number;
  addFn: string;
  singleFn: string;
};

const profiles: ProfileCase[] = [
  {
    name: 'small',
    profile: PROFILE_SMALL,
    size: SIZE_SMALL,
    fill: 0x11,
    batchLimit: 32,
    addFn: 'add-chunk-batch',
    singleFn: 'mint-single-tx-small'
  },
  {
    name: 'standard',
    profile: PROFILE_STANDARD,
    size: SIZE_STANDARD,
    fill: 0x22,
    batchLimit: 8,
    addFn: 'add-chunk-batch-standard',
    singleFn: 'mint-single-tx-standard'
  },
  {
    name: 'maximum',
    profile: PROFILE_MAXIMUM,
    size: SIZE_MAXIMUM,
    fill: 0x33,
    batchLimit: 4,
    addFn: 'add-chunk-batch-maximum',
    singleFn: 'mint-single-tx-maximum'
  }
];

let nonce = 0;

function nextByte(seed: number) {
  nonce += 1;
  return (seed + nonce) & 0xff;
}

function hex(byte: number, bytes: number) {
  return byte.toString(16).padStart(2, '0').repeat(bytes);
}

function rollingHash(chunksHex: string[]) {
  let running = Buffer.alloc(32, 0);
  for (const chunkHex of chunksHex) {
    const digest = createHash('sha256');
    digest.update(Buffer.concat([running, Buffer.from(chunkHex, 'hex')]));
    running = digest.digest();
  }
  return running.toString('hex');
}

function normalFileHash(chunksHex: string[]) {
  const digest = createHash('sha256');
  for (const chunkHex of chunksHex) {
    digest.update(Buffer.from(chunkHex, 'hex'));
  }
  return digest.digest('hex');
}

function totalSize(chunksHex: string[]) {
  return chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
}

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function unwrapUInt(result: any) {
  expect(result.type).toBe(ClarityType.UInt);
  return result.value as bigint;
}

function setPaused(value: boolean) {
  return simnet.callPublicFn(contract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setV2Paused(value: boolean) {
  return simnet.callPublicFn(v2Contract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function begin(sender: string, hash: string, size: number, chunkCount: number, profile: bigint) {
  return simnet.callPublicFn(
    contract,
    'begin-inscription',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(chunkCount),
      Cl.uint(profile)
    ],
    sender
  ).result;
}

function beginOrResume(sender: string, hash: string, size: number, chunkCount: number, profile: bigint) {
  return simnet.callPublicFn(
    contract,
    'begin-or-resume',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(chunkCount),
      Cl.uint(profile)
    ],
    sender
  ).result;
}

function beginOrGet(sender: string, hash: string, size: number, chunkCount: number, profile: bigint) {
  return simnet.callPublicFn(
    contract,
    'begin-or-get',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(size),
      Cl.uint(chunkCount),
      Cl.uint(profile)
    ],
    sender
  ).result;
}

function addChunks(sender: string, profile: ProfileCase, hash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    contract,
    profile.addFn,
    [Cl.bufferFromHex(hash), Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))],
    sender
  ).result;
}

function seal(sender: string, hash: string, tokenUri = `data:text/plain,v3-1-1-${nonce}`) {
  return simnet.callPublicFn(
    contract,
    'seal-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintSingleTx(sender: string, profile: ProfileCase, chunksHex: string[], tokenUri = `data:text/plain,single-${nonce}`) {
  const expectedHash = rollingHash(chunksHex);
  const result = simnet.callPublicFn(
    contract,
    profile.singleFn,
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize(chunksHex)),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii(tokenUri)
    ],
    sender
  ).result;
  return { expectedHash, result };
}

function mintSingleTxRecursive(sender: string, profile: ProfileCase, chunksHex: string[], dependencies: bigint[]) {
  const expectedHash = rollingHash(chunksHex);
  const result = simnet.callPublicFn(
    contract,
    `${profile.singleFn}-recursive`,
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize(chunksHex)),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii(`data:text/plain,recursive-${nonce}`),
      Cl.list(dependencies.map((id) => Cl.uint(id)))
    ],
    sender
  ).result;
  return { expectedHash, result };
}

function mintSingleTxWithRelationships(
  sender: string,
  profile: ProfileCase,
  chunksHex: string[],
  dependencies: bigint[],
  parents: bigint[]
) {
  const expectedHash = rollingHash(chunksHex);
  const result = simnet.callPublicFn(
    contract,
    `${profile.singleFn}-with-relationships`,
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize(chunksHex)),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii(`data:text/plain,relationships-${nonce}`),
      Cl.list(dependencies.map((id) => Cl.uint(id))),
      Cl.list(parents.map((id) => Cl.uint(id)))
    ],
    sender
  ).result;
  return { expectedHash, result };
}

function mintStaged(sender: string, profile: ProfileCase, chunksHex: string[], tokenUri = `data:text/plain,staged-${nonce}`) {
  const expectedHash = rollingHash(chunksHex);
  unwrapOk(begin(sender, expectedHash, totalSize(chunksHex), chunksHex.length, profile.profile));
  unwrapOk(addChunks(sender, profile, expectedHash, chunksHex));
  const id = unwrapUInt(unwrapOk(seal(sender, expectedHash, tokenUri)));
  return { expectedHash, id };
}

function mintV2Token(sender: string, chunksHex: string[], tokenUri: string) {
  const expectedHash = rollingHash(chunksHex);
  unwrapOk(
    simnet.callPublicFn(
      v2Contract,
      'begin-inscription',
      [Cl.bufferFromHex(expectedHash), Cl.stringAscii(mime), Cl.uint(totalSize(chunksHex)), Cl.uint(chunksHex.length)],
      sender
    ).result
  );
  unwrapOk(
    simnet.callPublicFn(
      v2Contract,
      'add-chunk-batch',
      [Cl.bufferFromHex(expectedHash), Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))],
      sender
    ).result
  );
  return unwrapUInt(unwrapOk(
    simnet.callPublicFn(
      v2Contract,
      'seal-inscription',
      [Cl.bufferFromHex(expectedHash), Cl.stringAscii(tokenUri)],
      sender
    ).result
  ));
}

function quote(
  payer: string,
  caller: any,
  size: number,
  chunkCount: number,
  profile: bigint,
  mode: bigint
) {
  return simnet.callReadOnlyFn(
    contract,
    'quote-inscription-fee',
    [
      Cl.standardPrincipal(payer),
      caller,
      Cl.uint(size),
      Cl.uint(chunkCount),
      Cl.uint(profile),
      Cl.uint(mode)
    ],
    payer
  ).result;
}

// The v3.1.1 draft contract is intentionally absent from this v3.2 hardening branch.
describe.skip('xtrata-v3.1.1 hardening', () => {
  it('migrations default migrated inscriptions to the small profile', () => {
    unwrapOk(setV2Paused(false));
    unwrapOk(setPaused(false));

    const tokenId = mintV2Token(wallet2, [hex(nextByte(0x40), 1)], 'data:text/plain,v2-source');
    unwrapOk(simnet.callPublicFn(contract, 'migrate-from-v2-1-0', [Cl.uint(tokenId)], wallet2).result);

    expect(simnet.callReadOnlyFn(contract, 'get-chunk-profile', [Cl.uint(tokenId)], wallet2).result)
      .toBeSome(Cl.uint(PROFILE_SMALL));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk-size', [Cl.uint(tokenId)], wallet2).result)
      .toBeSome(Cl.uint(SIZE_SMALL));
  });

  it('exposes supported chunk profiles with max sizes and batch limits', () => {
    const supported = simnet.callReadOnlyFn(contract, 'get-supported-chunk-profiles', [], wallet1).result;

    expect(supported).toBeOk(
      Cl.list([
        Cl.tuple({
          profile: Cl.uint(PROFILE_SMALL),
          label: Cl.stringAscii('small'),
          'chunk-size': Cl.uint(SIZE_SMALL),
          'max-chunks': Cl.uint(MAX_CHUNKS),
          'max-size': Cl.uint(MAX_CHUNKS * SIZE_SMALL),
          'upload-batch-max-chunks': Cl.uint(32),
          'upload-batch-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          'single-tx-max-chunks': Cl.uint(32),
          'single-tx-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          advanced: Cl.bool(false)
        }),
        Cl.tuple({
          profile: Cl.uint(PROFILE_STANDARD),
          label: Cl.stringAscii('standard'),
          'chunk-size': Cl.uint(SIZE_STANDARD),
          'max-chunks': Cl.uint(MAX_CHUNKS),
          'max-size': Cl.uint(MAX_CHUNKS * SIZE_STANDARD),
          'upload-batch-max-chunks': Cl.uint(8),
          'upload-batch-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          'single-tx-max-chunks': Cl.uint(8),
          'single-tx-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          advanced: Cl.bool(false)
        }),
        Cl.tuple({
          profile: Cl.uint(PROFILE_MAXIMUM),
          label: Cl.stringAscii('maximum'),
          'chunk-size': Cl.uint(SIZE_MAXIMUM),
          'max-chunks': Cl.uint(MAX_CHUNKS),
          'max-size': Cl.uint(MAX_CHUNKS * SIZE_MAXIMUM),
          'upload-batch-max-chunks': Cl.uint(4),
          'upload-batch-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          'single-tx-max-chunks': Cl.uint(4),
          'single-tx-max-bytes': Cl.uint(MAX_UPLOAD_BYTES),
          advanced: Cl.bool(true)
        })
      ])
    );

    expect(simnet.callReadOnlyFn(contract, 'get-chunk-read-batch-limit', [], wallet1).result)
      .toBeOk(Cl.uint(4));
  });

  for (const profile of profiles) {
    it(`accepts valid staged ${profile.name} uploads with an exact boundary chunk`, () => {
      unwrapOk(setPaused(false));
      const chunk = hex(nextByte(profile.fill), profile.size);
      const { expectedHash, id } = mintStaged(wallet1, profile, [chunk]);

      expect(simnet.callReadOnlyFn(contract, 'get-chunk-size', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(profile.size));
      expect(simnet.callReadOnlyFn(contract, 'get-rolling-chunk-hash', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(expectedHash));
      expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(id), Cl.uint(0)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(chunk));
    });

    it(`accepts valid staged ${profile.name} uploads with a smaller final chunk`, () => {
      unwrapOk(setPaused(false));
      const full = hex(nextByte(profile.fill), profile.size);
      const final = hex(nextByte(0x70), 7);
      const { id } = mintStaged(wallet1, profile, [full, final]);

      expect(simnet.callReadOnlyFn(contract, 'get-inscription-chunks', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(2));
      expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(id), Cl.uint(1)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(final));
    });

    it(`accepts a full 512 KiB profile-specific ${profile.name} single-tx upload`, () => {
      unwrapOk(setPaused(false));
      const chunks = Array.from({ length: profile.batchLimit }, () => hex(nextByte(profile.fill), profile.size));
      const { expectedHash, result } = mintSingleTx(wallet1, profile, chunks);
      const id = unwrapUInt(unwrapOk(result));

      expect(totalSize(chunks)).toBe(MAX_UPLOAD_BYTES);
      expect(simnet.callReadOnlyFn(contract, 'get-chunk-profile', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(profile.profile));
      expect(simnet.callReadOnlyFn(contract, 'get-inscription-hash', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(expectedHash));
    });
  }

  it('rejects invalid profiles and profile/function mismatches', () => {
    unwrapOk(setPaused(false));
    const chunk = hex(nextByte(0x50), SIZE_SMALL);
    const hash = rollingHash([chunk]);

    expect(begin(wallet1, hash, SIZE_SMALL, 1, 9n)).toBeErr(Cl.uint(102));
    unwrapOk(begin(wallet1, hash, SIZE_SMALL, 1, PROFILE_STANDARD));
    expect(addChunks(wallet1, profiles[0], hash, [chunk])).toBeErr(Cl.uint(102));

    const singleMismatch = simnet.callPublicFn(
      contract,
      'mint-single-tx-small',
      [
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(SIZE_STANDARD),
        Cl.list([Cl.bufferFromHex(chunk)]),
        Cl.stringAscii('data:text/plain,mismatch')
      ],
      wallet1
    ).result;
    expect(singleMismatch).toBeErr(Cl.uint(102));
  });

  it('rejects invalid upload batch shapes and chunk sizes', () => {
    unwrapOk(setPaused(false));
    const oneByte = hex(nextByte(0x60), 1);
    const twoBytes = hex(nextByte(0x61), 2);
    const full = hex(nextByte(0x62), SIZE_SMALL);
    const hashTooLarge = rollingHash([oneByte]);
    const hashTooSmall = rollingHash([oneByte, twoBytes]);
    const hashTooMany = rollingHash([oneByte]);

    unwrapOk(begin(wallet1, hashTooLarge, 1, 1, PROFILE_SMALL));
    expect(addChunks(wallet1, profiles[0], hashTooLarge, [twoBytes])).toBeErr(Cl.uint(102));

    unwrapOk(begin(wallet1, hashTooSmall, SIZE_SMALL + 2, 2, PROFILE_SMALL));
    expect(addChunks(wallet1, profiles[0], hashTooSmall, [oneByte])).toBeErr(Cl.uint(102));

    unwrapOk(begin(wallet1, hashTooMany, 1, 1, PROFILE_SMALL));
    expect(addChunks(wallet1, profiles[0], hashTooMany, [full, oneByte])).toBeErr(Cl.uint(102));
  });

  it('rejects seal before all chunks, hash mismatch, and append after seal', () => {
    unwrapOk(setPaused(false));
    const full = hex(nextByte(0x80), SIZE_SMALL);
    const final = hex(nextByte(0x81), 1);
    const hash = rollingHash([full, final]);

    unwrapOk(begin(wallet1, hash, SIZE_SMALL + 1, 2, PROFILE_SMALL));
    unwrapOk(addChunks(wallet1, profiles[0], hash, [full]));
    expect(seal(wallet1, hash)).toBeErr(Cl.uint(102));
    unwrapOk(addChunks(wallet1, profiles[0], hash, [final]));
    unwrapUInt(unwrapOk(seal(wallet1, hash)));
    expect(addChunks(wallet1, profiles[0], hash, [final])).toBeErr(Cl.uint(101));

    const actual = hex(nextByte(0x82), 1);
    const wrongHash = rollingHash([hex(nextByte(0x83), 1)]);
    unwrapOk(begin(wallet1, wrongHash, 1, 1, PROFILE_SMALL));
    unwrapOk(addChunks(wallet1, profiles[0], wrongHash, [actual]));
    expect(seal(wallet1, wrongHash)).toBeErr(Cl.uint(103));
  });

  it('documents rolling-hash semantics in read-only summaries', () => {
    unwrapOk(setPaused(false));
    const chunks = [hex(nextByte(0x90), SIZE_SMALL), hex(nextByte(0x91), 5)];
    const xtrataHash = rollingHash(chunks);
    const fileHash = normalFileHash(chunks);
    const { id } = mintStaged(wallet1, profiles[0], chunks, 'data:text/plain,hash-summary');

    expect(xtrataHash).not.toBe(fileHash);
    expect(simnet.callReadOnlyFn(contract, 'get-inscription-summary', [Cl.uint(id)], wallet1).result)
      .toBeSome(Cl.tuple({
        'inscription-id': Cl.uint(id),
        owner: Cl.standardPrincipal(wallet1),
        creator: Cl.standardPrincipal(wallet1),
        'total-size': Cl.uint(totalSize(chunks)),
        'chunk-count': Cl.uint(2),
        'chunk-profile': Cl.uint(PROFILE_SMALL),
        'chunk-size': Cl.uint(SIZE_SMALL),
        'rolling-chunk-hash': Cl.bufferFromHex(xtrataHash),
        'hash-algorithm': Cl.stringAscii('xtrata-rolling-sha256'),
        'content-type': Cl.stringAscii(mime),
        'token-uri': Cl.some(Cl.stringAscii('data:text/plain,hash-summary')),
        dependencies: Cl.list([]),
        parents: Cl.list([]),
        finalized: Cl.bool(true),
        'created-height': Cl.uint(simnet.blockHeight)
      }));
  });

  it('returns useful state from begin-or-resume and begin-or-get', () => {
    unwrapOk(setPaused(false));
    const chunk = hex(nextByte(0xa0), 1);
    const hash = rollingHash([chunk]);

    expect(beginOrResume(wallet1, hash, 1, 1, PROFILE_SMALL)).toBeOk(Cl.some(Cl.tuple({
      'mime-type': Cl.stringAscii(mime),
      'total-size': Cl.uint(1),
      'total-chunks': Cl.uint(1),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'current-index': Cl.uint(0),
      'running-hash': Cl.bufferFromHex('00'.repeat(32)),
      'last-touched': Cl.uint(simnet.blockHeight),
      'purge-index': Cl.uint(0)
    })));

    expect(beginOrGet(wallet1, hash, 1, 1, PROFILE_SMALL)).toBeOk(Cl.some(Cl.tuple({
      'mime-type': Cl.stringAscii(mime),
      'total-size': Cl.uint(1),
      'total-chunks': Cl.uint(1),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'current-index': Cl.uint(0),
      'running-hash': Cl.bufferFromHex('00'.repeat(32)),
      'last-touched': Cl.uint(simnet.blockHeight),
      'purge-index': Cl.uint(0)
    })));
  });

  it('enforces parent ownership but does not ownership-gate dependencies', () => {
    unwrapOk(setPaused(false));
    const parentId = unwrapUInt(unwrapOk(mintSingleTx(wallet1, profiles[0], [hex(nextByte(0xb0), 1)]).result));
    const child = [hex(nextByte(0xb1), 1)];

    expect(mintSingleTxWithRelationships(wallet2, profiles[0], child, [], [parentId]).result)
      .toBeErr(Cl.uint(117));

    const dependencyChild = unwrapUInt(unwrapOk(mintSingleTxRecursive(wallet2, profiles[0], [hex(nextByte(0xb2), 1)], [parentId]).result));
    expect(simnet.callReadOnlyFn(contract, 'get-dependencies', [Cl.uint(dependencyChild)], wallet2).result)
      .toStrictEqual(Cl.list([Cl.uint(parentId)]));

    const ownedParentChild = unwrapUInt(unwrapOk(mintSingleTxWithRelationships(wallet1, profiles[0], [hex(nextByte(0xb3), 1)], [], [parentId]).result));
    expect(simnet.callReadOnlyFn(contract, 'get-parents', [Cl.uint(ownedParentChild)], wallet1).result)
      .toStrictEqual(Cl.list([Cl.uint(parentId)]));
  });

  it('quotes fees correctly and enforces profile-specific maximums', () => {
    expect(quote(wallet1, Cl.none(), SIZE_STANDARD, 1, PROFILE_STANDARD, 2n)).toBeOk(Cl.tuple({
      'resolved-bps': Cl.uint(10_000),
      'policy-source': Cl.uint(0),
      'chunk-profile': Cl.uint(PROFILE_STANDARD),
      'chunk-size': Cl.uint(SIZE_STANDARD),
      'begin-fee': Cl.uint(100_000),
      'seal-fee': Cl.uint(108_000),
      'single-tx-fee': Cl.uint(108_000),
      'size-fee': Cl.uint(8_000),
      'extra-batches': Cl.uint(0),
      'extra-batch-fee': Cl.uint(0),
      'total-fee': Cl.uint(108_000)
    }));

    expect(quote(wallet1, Cl.none(), MAX_CHUNKS * SIZE_SMALL, MAX_CHUNKS, PROFILE_SMALL, 1n).type)
      .toBe(ClarityType.ResponseOk);
    expect(quote(wallet1, Cl.none(), MAX_CHUNKS * SIZE_SMALL + 1, MAX_CHUNKS, PROFILE_SMALL, 1n))
      .toBeErr(Cl.uint(102));
    expect(quote(wallet1, Cl.none(), MAX_CHUNKS * SIZE_STANDARD, MAX_CHUNKS, PROFILE_STANDARD, 1n).type)
      .toBe(ClarityType.ResponseOk);
    expect(quote(wallet1, Cl.none(), MAX_CHUNKS * SIZE_MAXIMUM, MAX_CHUNKS, PROFILE_MAXIMUM, 1n).type)
      .toBe(ClarityType.ResponseOk);
    expect(quote(wallet1, Cl.none(), SIZE_SMALL * 33, 33, PROFILE_SMALL, 2n))
      .toBeErr(Cl.uint(102));
    expect(quote(wallet1, Cl.none(), 0, 0, PROFILE_SMALL, 1n)).toBeErr(Cl.uint(102));
    expect(quote(wallet1, Cl.none(), SIZE_SMALL, 1, PROFILE_SMALL, 9n)).toBeErr(Cl.uint(118));
  });

  it('admin fee controls enforce bounds, update limits, and override precedence', () => {
    expect(simnet.callPublicFn(contract, 'set-staged-begin-fee-unit', [Cl.uint(999)], deployer).result)
      .toBeErr(Cl.uint(110));
    expect(simnet.callPublicFn(contract, 'set-staged-begin-fee-unit', [Cl.uint(201_000)], deployer).result)
      .toBeErr(Cl.uint(110));
    unwrapOk(simnet.callPublicFn(contract, 'set-staged-begin-fee-unit', [Cl.uint(200_000)], deployer).result);
    expect(simnet.callReadOnlyFn(contract, 'get-begin-fee-unit', [], wallet1).result)
      .toBeOk(Cl.uint(200_000));

    expect(simnet.callPublicFn(contract, 'set-wallet-fee-bps', [Cl.standardPrincipal(wallet1), Cl.uint(10_001)], deployer).result)
      .toBeErr(Cl.uint(119));

    unwrapOk(simnet.callPublicFn(contract, 'set-caller-fee-bps', [helperPrincipal, Cl.uint(5_000)], deployer).result);
    expect(quote(wallet1, Cl.some(helperPrincipal), SIZE_SMALL, 1, PROFILE_SMALL, 2n)).toBeOk(Cl.tuple({
      'resolved-bps': Cl.uint(5_000),
      'policy-source': Cl.uint(1),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'chunk-size': Cl.uint(SIZE_SMALL),
      'begin-fee': Cl.uint(100_000),
      'seal-fee': Cl.uint(51_000),
      'single-tx-fee': Cl.uint(51_000),
      'size-fee': Cl.uint(2_000),
      'extra-batches': Cl.uint(0),
      'extra-batch-fee': Cl.uint(0),
      'total-fee': Cl.uint(51_000)
    }));

    unwrapOk(simnet.callPublicFn(contract, 'set-wallet-fee-bps', [Cl.standardPrincipal(wallet1), Cl.uint(2_500)], deployer).result);
    expect(quote(wallet1, Cl.some(helperPrincipal), SIZE_SMALL, 1, PROFILE_SMALL, 2n)).toBeOk(Cl.tuple({
      'resolved-bps': Cl.uint(2_500),
      'policy-source': Cl.uint(2),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'chunk-size': Cl.uint(SIZE_SMALL),
      'begin-fee': Cl.uint(50_000),
      'seal-fee': Cl.uint(25_500),
      'single-tx-fee': Cl.uint(25_500),
      'size-fee': Cl.uint(2_000),
      'extra-batches': Cl.uint(0),
      'extra-batch-fee': Cl.uint(0),
      'total-fee': Cl.uint(25_500)
    }));

    unwrapOk(simnet.callPublicFn(contract, 'set-wallet-fee-bps', [Cl.standardPrincipal(wallet2), Cl.uint(0)], deployer).result);
    expect(quote(wallet2, Cl.none(), SIZE_SMALL, 1, PROFILE_SMALL, 2n)).toBeOk(Cl.tuple({
      'resolved-bps': Cl.uint(0),
      'policy-source': Cl.uint(2),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'chunk-size': Cl.uint(SIZE_SMALL),
      'begin-fee': Cl.uint(0),
      'seal-fee': Cl.uint(0),
      'single-tx-fee': Cl.uint(0),
      'size-fee': Cl.uint(2_000),
      'extra-batches': Cl.uint(0),
      'extra-batch-fee': Cl.uint(0),
      'total-fee': Cl.uint(0)
    }));

    unwrapOk(simnet.callPublicFn(contract, 'set-caller-fee-bps', [Cl.standardPrincipal(wallet3), Cl.uint(5_000)], deployer).result);
    expect(quote(wallet3, Cl.some(Cl.standardPrincipal(wallet3)), SIZE_SMALL, 1, PROFILE_SMALL, 2n)).toBeOk(Cl.tuple({
      'resolved-bps': Cl.uint(10_000),
      'policy-source': Cl.uint(0),
      'chunk-profile': Cl.uint(PROFILE_SMALL),
      'chunk-size': Cl.uint(SIZE_SMALL),
      'begin-fee': Cl.uint(200_000),
      'seal-fee': Cl.uint(102_000),
      'single-tx-fee': Cl.uint(102_000),
      'size-fee': Cl.uint(2_000),
      'extra-batches': Cl.uint(0),
      'extra-batch-fee': Cl.uint(0),
      'total-fee': Cl.uint(102_000)
    }));
  });
});
