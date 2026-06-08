import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;

const contract = `${deployer}.xtrata-v3-1-0`;
const mime = 'text/plain';

const PROFILE_SMALL = 1n;
const PROFILE_STANDARD = 2n;
const PROFILE_MAXIMUM = 3n;

const SIZE_SMALL = 16 * 1024;
const SIZE_STANDARD = 64 * 1024;
const SIZE_MAXIMUM = 128 * 1024;

function hex(byte: string, bytes: number) {
  return byte.repeat(bytes);
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

function setPaused(value: boolean) {
  return simnet.callPublicFn(contract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function begin(sender: string, hash: string, totalSize: number, totalChunks: number, profile: bigint) {
  return simnet.callPublicFn(
    contract,
    'begin-inscription',
    [
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.uint(totalChunks),
      Cl.uint(profile)
    ],
    sender
  ).result;
}

function addChunks(sender: string, profile: bigint, hash: string, chunksHex: string[]) {
  const fn =
    profile === PROFILE_STANDARD
      ? 'add-chunk-batch-standard'
      : profile === PROFILE_MAXIMUM
        ? 'add-chunk-batch-maximum'
        : 'add-chunk-batch';
  return simnet.callPublicFn(
    contract,
    fn,
    [Cl.bufferFromHex(hash), Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))],
    sender
  ).result;
}

function seal(sender: string, hash: string, tokenUri = 'data:text/plain,v3-1') {
  return simnet.callPublicFn(
    contract,
    'seal-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintStaged(params: {
  sender?: string;
  profile: bigint;
  chunksHex: string[];
  tokenUri?: string;
}) {
  const sender = params.sender ?? wallet1;
  const expectedHash = computeFinalHash(params.chunksHex);
  const totalSize = params.chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
  unwrapOk(begin(sender, expectedHash, totalSize, params.chunksHex.length, params.profile));
  unwrapOk(addChunks(sender, params.profile, expectedHash, params.chunksHex));
  const id = unwrapUInt(unwrapOk(seal(sender, expectedHash, params.tokenUri)));
  return { expectedHash, totalSize, id };
}

function profileCases() {
  return [
    { name: 'small', profile: PROFILE_SMALL, size: SIZE_SMALL, fill: 'aa', batchLimit: 32 },
    { name: 'standard', profile: PROFILE_STANDARD, size: SIZE_STANDARD, fill: 'bb', batchLimit: 8 },
    { name: 'maximum', profile: PROFILE_MAXIMUM, size: SIZE_MAXIMUM, fill: 'cc', batchLimit: 4 }
  ];
}

// The v3.1.0 draft contract is intentionally absent from this v3.2 hardening branch.
describe.skip('xtrata-v3.1.0 chunk profiles', () => {
  it('exposes supported chunk profiles and derived chunk sizes', () => {
    expect(simnet.callReadOnlyFn(contract, 'is-supported-chunk-profile', [Cl.uint(PROFILE_SMALL)], wallet1).result)
      .toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn(contract, 'is-supported-chunk-profile', [Cl.uint(9)], wallet1).result)
      .toBeOk(Cl.bool(false));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk-size-for-profile', [Cl.uint(PROFILE_STANDARD)], wallet1).result)
      .toBeSome(Cl.uint(SIZE_STANDARD));
    expect(simnet.callReadOnlyFn(contract, 'get-chunk-size-for-profile', [Cl.uint(9)], wallet1).result)
      .toBeNone();

    const supported = simnet.callReadOnlyFn(contract, 'get-supported-chunk-profiles', [], wallet1).result;
    expect(supported).toBeOk(
      Cl.list([
        Cl.tuple({ profile: Cl.uint(PROFILE_SMALL), label: Cl.stringAscii('small'), 'chunk-size': Cl.uint(SIZE_SMALL), advanced: Cl.bool(false) }),
        Cl.tuple({ profile: Cl.uint(PROFILE_STANDARD), label: Cl.stringAscii('standard'), 'chunk-size': Cl.uint(SIZE_STANDARD), advanced: Cl.bool(false) }),
        Cl.tuple({ profile: Cl.uint(PROFILE_MAXIMUM), label: Cl.stringAscii('maximum'), 'chunk-size': Cl.uint(SIZE_MAXIMUM), advanced: Cl.bool(true) })
      ])
    );
  });

  for (const profile of profileCases()) {
    it(`accepts one full 512 KB ${profile.name} profile append batch`, () => {
      unwrapOk(setPaused(false));
      const chunks = Array.from({ length: profile.batchLimit }, () => hex(profile.fill, profile.size));
      const { id, totalSize } = mintStaged({ profile: profile.profile, chunksHex: chunks });

      expect(totalSize).toBe(512 * 1024);
      expect(simnet.callReadOnlyFn(contract, 'get-inscription-chunks', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(profile.batchLimit));
    });

    it(`mints and reconstructs one exact-boundary ${profile.name} profile chunk`, () => {
      unwrapOk(setPaused(false));
      const chunk = hex(profile.fill, profile.size);
      const { expectedHash, id } = mintStaged({ profile: profile.profile, chunksHex: [chunk] });

      expect(simnet.callReadOnlyFn(contract, 'get-chunk-profile', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(profile.profile));
      expect(simnet.callReadOnlyFn(contract, 'get-chunk-size', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(profile.size));
      expect(simnet.callReadOnlyFn(contract, 'get-inscription-hash', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(expectedHash));
      expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(id), Cl.uint(0)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(chunk));
    });

    it(`accepts a smaller final chunk for multi-chunk ${profile.name} profile data`, () => {
      unwrapOk(setPaused(false));
      const full = hex(profile.fill, profile.size);
      const final = hex('dd', 1);
      const { id, totalSize } = mintStaged({ profile: profile.profile, chunksHex: [full, final] });

      expect(totalSize).toBe(profile.size + 1);
      expect(simnet.callReadOnlyFn(contract, 'get-inscription-chunks', [Cl.uint(id)], wallet1).result)
        .toBeSome(Cl.uint(2));
      expect(simnet.callReadOnlyFn(contract, 'get-chunk', [Cl.uint(id), Cl.uint(1)], wallet1).result)
        .toBeSome(Cl.bufferFromHex(final));
    });
  }

  it('rejects an unsupported profile at inscription creation', () => {
    unwrapOk(setPaused(false));
    const chunk = 'aa';
    const hash = computeFinalHash([chunk]);

    expect(begin(wallet1, hash, 1, 1, 9n)).toBeErr(Cl.uint(102));
  });

  it('rejects chunks that are too large for the selected profile', () => {
    unwrapOk(setPaused(false));
    const tooLargeFinal = ['aaaa'];
    const hash = computeFinalHash(tooLargeFinal);

    unwrapOk(begin(wallet1, hash, 1, 1, PROFILE_SMALL));
    expect(addChunks(wallet1, PROFILE_SMALL, hash, tooLargeFinal)).toBeErr(Cl.uint(102));
  });

  it('rejects a non-final chunk smaller than the selected profile size', () => {
    unwrapOk(setPaused(false));
    const shortFirst = 'aa';
    const final = 'bb';
    const hash = computeFinalHash([shortFirst, final]);

    unwrapOk(begin(wallet1, hash, SIZE_SMALL + 1, 2, PROFILE_SMALL));
    expect(addChunks(wallet1, PROFILE_SMALL, hash, [shortFirst])).toBeErr(Cl.uint(102));
  });

  it('rejects out-of-range and duplicate sequential writes', () => {
    unwrapOk(setPaused(false));
    const chunk = 'aa';
    const hash = computeFinalHash([chunk]);

    unwrapOk(begin(wallet1, hash, 1, 1, PROFILE_SMALL));
    expect(addChunks(wallet1, PROFILE_SMALL, hash, [chunk, chunk])).toBeErr(Cl.uint(102));
    unwrapOk(addChunks(wallet1, PROFILE_SMALL, hash, [chunk]));
    expect(addChunks(wallet1, PROFILE_SMALL, hash, [chunk])).toBeErr(Cl.uint(102));
  });

  it('rejects finalization before all chunks are present and rejects appends after finalization', () => {
    unwrapOk(setPaused(false));
    const full = hex('aa', SIZE_SMALL);
    const final = 'bb';
    const hash = computeFinalHash([full, final]);

    unwrapOk(begin(wallet1, hash, SIZE_SMALL + 1, 2, PROFILE_SMALL));
    unwrapOk(addChunks(wallet1, PROFILE_SMALL, hash, [full]));
    expect(seal(wallet1, hash)).toBeErr(Cl.uint(102));
    unwrapOk(addChunks(wallet1, PROFILE_SMALL, hash, [final]));
    unwrapUInt(unwrapOk(seal(wallet1, hash)));
    expect(addChunks(wallet1, PROFILE_SMALL, hash, [final])).toBeErr(Cl.uint(101));
  });

  it('returns resolver-friendly inscription summaries and profile-aware fee quotes', () => {
    unwrapOk(setPaused(false));
    const chunk = hex('ee', SIZE_STANDARD);
    const { expectedHash, id } = mintStaged({
      profile: PROFILE_STANDARD,
      chunksHex: [chunk],
      tokenUri: 'data:text/plain,summary'
    });

    expect(simnet.callReadOnlyFn(contract, 'get-inscription-summary', [Cl.uint(id)], wallet1).result)
      .toBeSome(Cl.tuple({
        'inscription-id': Cl.uint(id),
        owner: Cl.standardPrincipal(wallet1),
        creator: Cl.standardPrincipal(wallet1),
        'total-size': Cl.uint(SIZE_STANDARD),
        'chunk-count': Cl.uint(1),
        'chunk-profile': Cl.uint(PROFILE_STANDARD),
        'chunk-size': Cl.uint(SIZE_STANDARD),
        'content-hash': Cl.bufferFromHex(expectedHash),
        'content-type': Cl.stringAscii(mime),
        'token-uri': Cl.some(Cl.stringAscii('data:text/plain,summary')),
        dependencies: Cl.list([]),
        parents: Cl.list([]),
        finalized: Cl.bool(true),
        'created-height': Cl.uint(simnet.blockHeight)
      }));

    expect(
      simnet.callReadOnlyFn(
        contract,
        'quote-inscription-fee',
        [
          Cl.standardPrincipal(wallet1),
          Cl.none(),
          Cl.uint(SIZE_STANDARD),
          Cl.uint(1),
          Cl.uint(PROFILE_STANDARD),
          Cl.uint(2)
        ],
        wallet1
      ).result
    ).toBeOk(
      Cl.tuple({
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
      })
    );
  });
});
