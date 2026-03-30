import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const v2Contract = `${deployer}.xtrata-v2-1-0`;
const v3Contract = `${deployer}.xtrata-v3-0-0`;
const helperContract = `${deployer}.xtrata-small-mint-v1-0`;
const v3Principal = Cl.contractPrincipal(deployer, 'xtrata-v3-0-0');
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

function unwrapTupleUint(result: any, field: string) {
  const value = unwrapOk(result);
  expect(value.type).toBe(ClarityType.Tuple);
  const entry = value.value[field];
  expect(entry?.type).toBe(ClarityType.UInt);
  return entry.value as bigint;
}

function stxBalance(address: string) {
  return simnet.getAssetsMap().get('STX')?.get(address) || 0n;
}

function setV3Paused(value: boolean) {
  return simnet.callPublicFn(v3Contract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setV2Paused(value: boolean) {
  return simnet.callPublicFn(v2Contract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setHelperPaused(value: boolean) {
  return simnet.callPublicFn(helperContract, 'set-paused', [Cl.bool(value)], deployer).result;
}

function setHelperCoreToV3() {
  return simnet.callPublicFn(
    helperContract,
    'set-core-contract',
    [v3Principal],
    deployer
  ).result;
}

function setFeeRecipient(recipient: string) {
  return simnet.callPublicFn(
    v3Contract,
    'set-fee-recipient',
    [Cl.standardPrincipal(recipient)],
    deployer
  ).result;
}

function setStagedBeginFee(value: bigint) {
  return simnet.callPublicFn(v3Contract, 'set-staged-begin-fee-unit', [Cl.uint(value)], deployer).result;
}

function setStagedSealFee(value: bigint) {
  return simnet.callPublicFn(v3Contract, 'set-staged-seal-fee-unit', [Cl.uint(value)], deployer).result;
}

function setSingleTxFee(value: bigint) {
  return simnet.callPublicFn(v3Contract, 'set-single-tx-fee-unit', [Cl.uint(value)], deployer).result;
}

function setUploadByteFee(value: bigint) {
  return simnet.callPublicFn(v3Contract, 'set-upload-byte-fee-unit', [Cl.uint(value)], deployer).result;
}

function applyFeeSteps(setter: (value: bigint) => any, steps: bigint[]) {
  for (const value of steps) {
    unwrapOk(setter(value));
  }
}

function setCallerFeeBps(caller: any, bps: bigint) {
  return simnet.callPublicFn(v3Contract, 'set-caller-fee-bps', [caller, Cl.uint(bps)], deployer).result;
}

function setWalletFeeBps(wallet: string, bps: bigint) {
  return simnet.callPublicFn(
    v3Contract,
    'set-wallet-fee-bps',
    [Cl.standardPrincipal(wallet), Cl.uint(bps)],
    deployer
  ).result;
}

function getNextV3Id(sender: string) {
  const result = simnet.callReadOnlyFn(v3Contract, 'get-next-token-id', [], sender).result;
  return unwrapUInt(unwrapOk(result));
}

function getMintOrigin(tokenId: bigint, sender: string) {
  return simnet.callReadOnlyFn(v3Contract, 'get-mint-origin', [Cl.uint(tokenId)], sender).result;
}

function beginV3(sender: string, hash: string, totalSize: number, totalChunks: number) {
  return simnet.callPublicFn(
    v3Contract,
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

function addChunkBatchV3(sender: string, hash: string, chunksHex: string[]) {
  return simnet.callPublicFn(
    v3Contract,
    'add-chunk-batch',
    [
      Cl.bufferFromHex(hash),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk)))
    ],
    sender
  ).result;
}

function sealV3(sender: string, hash: string, tokenUri: string) {
  return simnet.callPublicFn(
    v3Contract,
    'seal-inscription',
    [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintSingleTxV3(sender: string, chunksHex: string[], tokenUri = 'data:text/plain,v3') {
  const expectedHash = computeFinalHash(chunksHex);
  const totalSize = chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
  const result = simnet.callPublicFn(
    v3Contract,
    'mint-single-tx',
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii(tokenUri)
    ],
    sender
  ).result;
  return { expectedHash, totalSize, result };
}

function mintSingleTxWithRelationshipsV3(params: {
  sender: string;
  chunksHex: string[];
  dependencies?: bigint[];
  parents?: bigint[];
  tokenUri?: string;
}) {
  const expectedHash = computeFinalHash(params.chunksHex);
  const totalSize = params.chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
  const result = simnet.callPublicFn(
    v3Contract,
    'mint-single-tx-with-relationships',
    [
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.list(params.chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii(params.tokenUri ?? 'data:text/plain,linked'),
      Cl.list((params.dependencies ?? []).map((id) => Cl.uint(id))),
      Cl.list((params.parents ?? []).map((id) => Cl.uint(id)))
    ],
    params.sender
  ).result;
  return { expectedHash, totalSize, result };
}

function mintSmallSingleTxViaHelper(sender: string, chunksHex: string[]) {
  const expectedHash = computeFinalHash(chunksHex);
  const totalSize = chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
  return simnet.callPublicFn(
    helperContract,
    'mint-small-single-tx',
    [
      v3Principal,
      Cl.bufferFromHex(expectedHash),
      Cl.stringAscii(mime),
      Cl.uint(totalSize),
      Cl.list(chunksHex.map((chunk) => Cl.bufferFromHex(chunk))),
      Cl.stringAscii('data:text/plain,helper-v3')
    ],
    sender
  ).result;
}

function mintV2Token(sender: string, chunksHex: string[], tokenUri: string) {
  const expectedHash = computeFinalHash(chunksHex);
  const totalSize = chunksHex.reduce((sum, chunk) => sum + chunk.length / 2, 0);
  unwrapOk(
    simnet.callPublicFn(
      v2Contract,
      'begin-inscription',
      [
        Cl.bufferFromHex(expectedHash),
        Cl.stringAscii(mime),
        Cl.uint(totalSize),
        Cl.uint(chunksHex.length)
      ],
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
  return unwrapUInt(
    unwrapOk(
      simnet.callPublicFn(
        v2Contract,
        'seal-inscription',
        [Cl.bufferFromHex(expectedHash), Cl.stringAscii(tokenUri)],
        sender
      ).result
    )
  );
}

describe('xtrata-v3.0.0', () => {
  it('allows duplicate content to mint multiple times while keeping advisory first-seen hash lookup', () => {
    unwrapOk(setV3Paused(false));

    const chunks = ['aa'];
    const expectedHash = computeFinalHash(chunks);
    const firstId = getNextV3Id(wallet1);

    unwrapUInt(unwrapOk(mintSingleTxV3(wallet1, chunks, 'data:text/plain,first').result));
    const secondId = getNextV3Id(wallet1);
    unwrapUInt(unwrapOk(mintSingleTxV3(wallet1, chunks, 'data:text/plain,second').result));

    expect(secondId).toBe(firstId + 1n);
    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-id-by-hash', [Cl.bufferFromHex(expectedHash)], wallet1).result
    ).toBeSome(Cl.uint(firstId));
  });

  it('tracks mint origin for contract callers without tagging direct wallet mints', () => {
    unwrapOk(setV3Paused(false));
    unwrapOk(setHelperPaused(false));
    unwrapOk(setHelperCoreToV3());

    const directId = unwrapUInt(
      unwrapOk(mintSingleTxV3(wallet1, ['01'], 'data:text/plain,direct').result)
    );
    expect(getMintOrigin(directId, wallet1)).toBeNone();

    const helperId = unwrapTupleUint(
      mintSmallSingleTxViaHelper(wallet1, ['02']),
      'token-id'
    );
    expect(getMintOrigin(helperId, wallet1)).toBeSome(helperPrincipal);
  });

  it('treats dependencies as open references but enforces ownership for parents', () => {
    unwrapOk(setV3Paused(false));

    const parentId = unwrapUInt(unwrapOk(mintSingleTxV3(wallet2, ['ab'], 'data:text/plain,parent').result));

    const dependencyOnly = mintSingleTxWithRelationshipsV3({
      sender: wallet1,
      chunksHex: ['cd'],
      dependencies: [parentId],
      parents: []
    }).result;
    unwrapUInt(unwrapOk(dependencyOnly));

    const blockedParent = mintSingleTxWithRelationshipsV3({
      sender: wallet1,
      chunksHex: ['ef'],
      dependencies: [],
      parents: [parentId]
    }).result;
    expect(blockedParent).toBeErr(Cl.uint(117));

    unwrapOk(
      simnet.callPublicFn(
        v3Contract,
        'transfer',
        [Cl.uint(parentId), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet1)],
        wallet2
      ).result
    );

    const childId = unwrapUInt(
      unwrapOk(
        mintSingleTxWithRelationshipsV3({
          sender: wallet1,
          chunksHex: ['f0'],
          dependencies: [],
          parents: [parentId],
          tokenUri: 'data:text/plain,child'
        }).result
      )
    );

    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-parents', [Cl.uint(childId)], wallet1).result
    ).toEqual(Cl.list([Cl.uint(parentId)]));
    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-parent-child-count', [Cl.uint(parentId)], wallet1).result
    ).toBeOk(Cl.uint(1));
    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-parent-child', [Cl.uint(parentId), Cl.uint(0)], wallet1).result
    ).toBeSome(Cl.uint(childId));
  });

  it('quotes byte-proportional fees and keeps single-tx cheaper for tiny files', () => {
    unwrapOk(setStagedBeginFee(100_000n));
    unwrapOk(setStagedSealFee(200_000n));
    unwrapOk(setSingleTxFee(25_000n));

    const tiny = simnet.callReadOnlyFn(
      v3Contract,
      'quote-inscription-fee',
      [
        Cl.standardPrincipal(wallet1),
        Cl.none(),
        Cl.uint(1024),
        Cl.uint(1),
        Cl.uint(2)
      ],
      wallet1
    ).result;
    expect(tiny).toBeOk(
      Cl.tuple({
        'resolved-bps': Cl.uint(10_000),
        'policy-source': Cl.uint(0),
        'begin-fee': Cl.uint(100_000),
        'seal-fee': Cl.uint(200_125),
        'single-tx-fee': Cl.uint(25_125),
        'size-fee': Cl.uint(125),
        'extra-batches': Cl.uint(0),
        'extra-batch-fee': Cl.uint(0),
        'total-fee': Cl.uint(25_125)
      })
    );

    const fullChunk = simnet.callReadOnlyFn(
      v3Contract,
      'quote-inscription-fee',
      [
        Cl.standardPrincipal(wallet1),
        Cl.none(),
        Cl.uint(16_384),
        Cl.uint(1),
        Cl.uint(2)
      ],
      wallet1
    ).result;
    expect(fullChunk).toBeOk(
      Cl.tuple({
        'resolved-bps': Cl.uint(10_000),
        'policy-source': Cl.uint(0),
        'begin-fee': Cl.uint(100_000),
        'seal-fee': Cl.uint(202_000),
        'single-tx-fee': Cl.uint(27_000),
        'size-fee': Cl.uint(2_000),
        'extra-batches': Cl.uint(0),
        'extra-batch-fee': Cl.uint(0),
        'total-fee': Cl.uint(27_000)
      })
    );
  });

  it('allows v3 fee units to reach one microstx', () => {
    applyFeeSteps(setSingleTxFee, [10_000n, 1_000n, 100n, 10n, 1n]);
    applyFeeSteps(setUploadByteFee, [200n, 20n, 2n, 1n]);

    const tiny = simnet.callReadOnlyFn(
      v3Contract,
      'quote-inscription-fee',
      [
        Cl.standardPrincipal(wallet1),
        Cl.none(),
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2)
      ],
      wallet1
    ).result;

    expect(tiny).toBeOk(
      Cl.tuple({
        'resolved-bps': Cl.uint(10_000),
        'policy-source': Cl.uint(0),
        'begin-fee': Cl.uint(100_000),
        'seal-fee': Cl.uint(100_001),
        'single-tx-fee': Cl.uint(2),
        'size-fee': Cl.uint(1),
        'extra-batches': Cl.uint(0),
        'extra-batch-fee': Cl.uint(0),
        'total-fee': Cl.uint(2)
      })
    );
  });

  it('applies wallet fee bps to staged writes', () => {
    unwrapOk(setV3Paused(false));
    unwrapOk(setFeeRecipient(wallet2));
    unwrapOk(setWalletFeeBps(wallet1, 0n));

    const hash = computeFinalHash(['11']);
    const before = stxBalance(wallet2);

    unwrapOk(beginV3(wallet1, hash, 1, 1));
    unwrapOk(addChunkBatchV3(wallet1, hash, ['11']));
    unwrapUInt(unwrapOk(sealV3(wallet1, hash, 'data:text/plain,free-wallet')));

    const after = stxBalance(wallet2);
    expect(after - before).toBe(0n);
  });

  it('applies caller fee bps to helper-mediated writes', () => {
    unwrapOk(setV3Paused(false));
    unwrapOk(setHelperPaused(false));
    unwrapOk(setHelperCoreToV3());
    unwrapOk(setFeeRecipient(wallet2));
    unwrapOk(setCallerFeeBps(helperPrincipal, 0n));

    const before = stxBalance(wallet2);
    const result = mintSmallSingleTxViaHelper(wallet1, ['22']);
    expect(result.type).toBe(ClarityType.ResponseOk);
    const after = stxBalance(wallet2);

    expect(after - before).toBe(0n);
  });

  it('exposes fee-recipient getters and keeps royalty-recipient alias for compatibility', () => {
    unwrapOk(setFeeRecipient(wallet2));

    expect(simnet.callReadOnlyFn(v3Contract, 'get-fee-recipient', [], wallet1).result).toBeOk(
      Cl.standardPrincipal(wallet2)
    );
    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-royalty-recipient', [], wallet1).result
    ).toBeOk(Cl.standardPrincipal(wallet2));

    unwrapOk(
      simnet.callPublicFn(
        v3Contract,
        'set-royalty-recipient',
        [Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    );
    expect(simnet.callReadOnlyFn(v3Contract, 'get-fee-recipient', [], wallet1).result).toBeOk(
      Cl.standardPrincipal(wallet1)
    );
  });

  it('migrates from v2 and advances next-id to avoid collision with fresh v3 mints', () => {
    unwrapOk(setV2Paused(false));
    unwrapOk(setV3Paused(false));

    const legacyId = mintV2Token(wallet1, ['33'], 'data:text/plain,legacy-v2');
    expect(legacyId).toBe(0n);

    unwrapUInt(
      unwrapOk(
        simnet.callPublicFn(v3Contract, 'migrate-from-v2-1-0', [Cl.uint(legacyId)], wallet1).result
      )
    );

    expect(simnet.callReadOnlyFn(v3Contract, 'get-next-token-id', [], wallet1).result).toBeOk(
      Cl.uint(1)
    );

    const freshId = unwrapUInt(unwrapOk(mintSingleTxV3(wallet1, ['44'], 'data:text/plain,fresh-v3').result));
    expect(freshId).toBe(1n);

    expect(
      simnet.callReadOnlyFn(v3Contract, 'get-migration-source', [Cl.uint(legacyId)], wallet1).result
    ).toBeSome(
      Cl.tuple({
        'source-contract': Cl.contractPrincipal(deployer, 'xtrata-v2-1-0'),
        'source-id': Cl.uint(legacyId)
      })
    );
  });
});
