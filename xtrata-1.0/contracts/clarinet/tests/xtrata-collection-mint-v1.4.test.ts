import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

const coreContract = `${deployer}.xtrata-v2-1-0`;
const legacyCoreContractPrincipal = Cl.contractPrincipal(deployer, 'xtrata-v1-1-0');
const mintContract = `${deployer}.xtrata-collection-mint-v1-4`;
const coreContractPrincipal = Cl.contractPrincipal(deployer, 'xtrata-v2-1-0');
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

function totalSizeFromChunks(chunksHex: string[]) {
  return chunksHex.reduce((sum, chunkHex) => sum + Buffer.from(chunkHex, 'hex').length, 0);
}

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function unwrapOkUint(result: any) {
  const value = unwrapOk(result);
  expect(value.type).toBe(ClarityType.UInt);
  return value.value;
}

function expectErr(result: any, code: number | bigint) {
  expect(result).toBeErr(Cl.uint(code));
}

function configureMintForTests() {
  unwrapOk(simnet.callPublicFn(coreContract, 'set-paused', [Cl.bool(false)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, 'set-max-supply', [Cl.uint(50)], deployer).result);
  unwrapOk(simnet.callPublicFn(mintContract, 'set-mint-price', [Cl.uint(0)], deployer).result);
  unwrapOk(
    simnet.callPublicFn(
      mintContract,
      'set-splits',
      [Cl.uint(0), Cl.uint(0), Cl.uint(0)],
      deployer
    ).result
  );
  unwrapOk(simnet.callPublicFn(mintContract, 'set-paused', [Cl.bool(false)], deployer).result);
}

function beginMint(sender: string, hash: string) {
  return simnet.callPublicFn(
    mintContract,
    'mint-begin',
    [
      coreContractPrincipal,
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(1),
      Cl.uint(1)
    ],
    sender
  ).result;
}

function addChunk(sender: string, hash: string, chunkHex: string) {
  return simnet.callPublicFn(
    mintContract,
    'mint-add-chunk-batch',
    [coreContractPrincipal, Cl.bufferFromHex(hash), Cl.list([Cl.bufferFromHex(chunkHex)])],
    sender
  ).result;
}

function sealMint(sender: string, hash: string, tokenUri: string) {
  return simnet.callPublicFn(
    mintContract,
    'mint-seal',
    [coreContractPrincipal, Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
    sender
  ).result;
}

function mintSmallSingleTx(sender: string, hash: string, chunksHex: string[], tokenUri: string) {
  return simnet.callPublicFn(
    mintContract,
    'mint-small-single-tx',
    [
      coreContractPrincipal,
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSizeFromChunks(chunksHex)),
      Cl.list(chunksHex.map((chunkHex) => Cl.bufferFromHex(chunkHex))),
      Cl.stringAscii(tokenUri)
    ],
    sender
  ).result;
}

function mintSmallSingleTxRecursive(
  sender: string,
  hash: string,
  chunksHex: string[],
  tokenUri: string,
  dependencies: bigint[]
) {
  return simnet.callPublicFn(
    mintContract,
    'mint-small-single-tx-recursive',
    [
      coreContractPrincipal,
      Cl.bufferFromHex(hash),
      Cl.stringAscii(mime),
      Cl.uint(totalSizeFromChunks(chunksHex)),
      Cl.list(chunksHex.map((chunkHex) => Cl.bufferFromHex(chunkHex))),
      Cl.stringAscii(tokenUri),
      Cl.list(dependencies.map((dependency) => Cl.uint(dependency)))
    ],
    sender
  ).result;
}

function mintCoreDirect(sender: string, chunksHex: string[], tokenUri: string) {
  const hash = computeFinalHash(chunksHex);
  unwrapOk(
    simnet.callPublicFn(
      coreContract,
      'begin-inscription',
      [
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(totalSizeFromChunks(chunksHex)),
        Cl.uint(chunksHex.length)
      ],
      sender
    ).result
  );
  unwrapOk(
    simnet.callPublicFn(
      coreContract,
      'add-chunk-batch',
      [Cl.bufferFromHex(hash), Cl.list(chunksHex.map((chunkHex) => Cl.bufferFromHex(chunkHex)))],
      sender
    ).result
  );
  return unwrapOkUint(
    simnet.callPublicFn(
      coreContract,
      'seal-inscription',
      [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
      sender
    ).result
  );
}

describe('xtrata-collection-mint-v1.4 recipient access controls', () => {
  it('keeps marketplace/operator recipient updates locked by default', () => {
    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-artist-recipient',
        [Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    );

    const ownerCannotSetMarketplace = simnet.callPublicFn(
      mintContract,
      'set-marketplace-recipient',
      [Cl.standardPrincipal(wallet2)],
      deployer
    ).result;
    expectErr(ownerCannotSetMarketplace, 100);

    const ownerCannotSetOperator = simnet.callPublicFn(
      mintContract,
      'set-operator-recipient',
      [Cl.standardPrincipal(wallet3)],
      deployer
    ).result;
    expectErr(ownerCannotSetOperator, 100);

    const recipients = simnet.callReadOnlyFn(mintContract, 'get-recipients', [], deployer).result;
    expect(recipients).toBeOk(
      Cl.tuple({
        artist: Cl.standardPrincipal(wallet1),
        marketplace: Cl.standardPrincipal(deployer),
        operator: Cl.standardPrincipal(deployer)
      })
    );
  });

  it('lets only main Xtrata admin grant recipient editor access', () => {
    const nonAdminGrant = simnet.callPublicFn(
      mintContract,
      'set-recipient-editor-access',
      [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(true), Cl.bool(false)],
      wallet1
    ).result;
    expectErr(nonAdminGrant, 100);

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipient-editor-access',
        [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(true), Cl.bool(false)],
        deployer
      ).result
    );

    expect(
      simnet.callReadOnlyFn(
        mintContract,
        'get-recipient-editor-access',
        [Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    ).toBeOk(Cl.tuple({ marketplace: Cl.bool(true), operator: Cl.bool(false) }));

    unwrapOk(
      simnet.callPublicFn(
        coreContract,
        'transfer-contract-ownership',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    );

    const formerAdminBlocked = simnet.callPublicFn(
      mintContract,
      'set-recipient-editor-access',
      [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(false), Cl.bool(true)],
      deployer
    ).result;
    expectErr(formerAdminBlocked, 100);

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipient-editor-access',
        [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(false), Cl.bool(true)],
        wallet2
      ).result
    );
  });

  it('enforces scoped marketplace/operator permissions and revoke behavior', () => {
    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipient-editor-access',
        [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(true), Cl.bool(false)],
        deployer
      ).result
    );

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-marketplace-recipient',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      ).result
    );

    const noOperatorScope = simnet.callPublicFn(
      mintContract,
      'set-operator-recipient',
      [Cl.standardPrincipal(wallet3)],
      wallet1
    ).result;
    expectErr(noOperatorScope, 100);

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipient-editor-access',
        [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(false), Cl.bool(false)],
        deployer
      ).result
    );

    const revoked = simnet.callPublicFn(
      mintContract,
      'set-marketplace-recipient',
      [Cl.standardPrincipal(wallet3)],
      wallet1
    ).result;
    expectErr(revoked, 100);
  });

  it('set-recipients enforces per-field permissions', () => {
    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipient-editor-access',
        [coreContractPrincipal, Cl.standardPrincipal(wallet1), Cl.bool(true), Cl.bool(false)],
        deployer
      ).result
    );

    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-recipients',
        [
          Cl.standardPrincipal(deployer),
          Cl.standardPrincipal(wallet2),
          Cl.standardPrincipal(deployer)
        ],
        wallet1
      ).result
    );

    const editorCannotChangeArtist = simnet.callPublicFn(
      mintContract,
      'set-recipients',
      [
        Cl.standardPrincipal(wallet3),
        Cl.standardPrincipal(wallet2),
        Cl.standardPrincipal(deployer)
      ],
      wallet1
    ).result;
    expectErr(editorCannotChangeArtist, 100);

    const ownerCannotChangeMarketplaceWithoutAccess = simnet.callPublicFn(
      mintContract,
      'set-recipients',
      [
        Cl.standardPrincipal(deployer),
        Cl.standardPrincipal(wallet3),
        Cl.standardPrincipal(deployer)
      ],
      deployer
    ).result;
    expectErr(ownerCannotChangeMarketplaceWithoutAccess, 100);
  });

  it('keeps mint begin/chunk/seal flow working with v1.4 controls', () => {
    configureMintForTests();

    const hash = computeFinalHash(['aa']);
    unwrapOk(beginMint(wallet1, hash));
    unwrapOk(addChunk(wallet1, hash, 'aa'));
    const sealResult = sealMint(wallet1, hash, 'data:text/plain,v1.4');
    expect(sealResult.type).toBe(ClarityType.ResponseOk);
  });
});

describe('xtrata-collection-mint-v1.4 single-tx small flow', () => {
  it('mints a small file in one transaction and records collection accounting', () => {
    configureMintForTests();

    const hash = computeFinalHash(['aa']);
    const result = mintSmallSingleTx(wallet1, hash, ['aa'], 'data:text/plain,small');
    expect(result.type).toBe(ClarityType.ResponseOk);

    expect(simnet.callReadOnlyFn(mintContract, 'get-minted-count', [], deployer).result).toBeOk(
      Cl.uint(1)
    );
    expect(simnet.callReadOnlyFn(mintContract, 'get-reserved-count', [], deployer).result).toBeOk(
      Cl.uint(0)
    );
  });

  it('supports recursive small single-tx minting', () => {
    configureMintForTests();

    const parentId = mintCoreDirect(wallet1, ['01'], 'data:text/plain,parent');

    const childHash = computeFinalHash(['02']);
    const result = mintSmallSingleTxRecursive(
      wallet1,
      childHash,
      ['02'],
      'data:text/plain,child',
      [parentId]
    );
    expect(result.type).toBe(ClarityType.ResponseOk);

    expect(simnet.callReadOnlyFn(mintContract, 'get-minted-count', [], deployer).result).toBeOk(
      Cl.uint(1)
    );
  });

  it('rejects recursive small single-tx overrides when default dependencies are configured', () => {
    configureMintForTests();
    unwrapOk(
      simnet.callPublicFn(
        mintContract,
        'set-default-dependencies',
        [Cl.list([Cl.uint(1)])],
        deployer
      ).result
    );

    const childHash = computeFinalHash(['aa']);
    const result = mintSmallSingleTxRecursive(
      wallet1,
      childHash,
      ['aa'],
      'data:text/plain,child',
      [1n]
    );
    expectErr(result, 120);
  });

  it('rejects single-tx small path above 30 chunks', () => {
    configureMintForTests();

    const chunks = Array.from({ length: 31 }, () => 'aa');
    const hash = computeFinalHash(chunks);
    const result = mintSmallSingleTx(wallet1, hash, chunks, 'data:text/plain,too-many');
    expectErr(result, 111);
  });

  it('rejects duplicate hashes before reservation/mint accounting', () => {
    configureMintForTests();

    const hash = computeFinalHash(['aa']);
    unwrapOk(mintSmallSingleTx(wallet1, hash, ['aa'], 'data:text/plain,first'));

    const duplicateResult = mintSmallSingleTx(wallet2, hash, ['aa'], 'data:text/plain,dupe');
    expectErr(duplicateResult, 122);

    expect(simnet.callReadOnlyFn(mintContract, 'get-minted-count', [], deployer).result).toBeOk(
      Cl.uint(1)
    );
  });

  it('rejects small single-tx path when provided core contract is invalid', () => {
    configureMintForTests();
    const hash = computeFinalHash(['aa']);
    const result = simnet.callPublicFn(
      mintContract,
      'mint-small-single-tx',
      [
        legacyCoreContractPrincipal,
        Cl.bufferFromHex(hash),
        Cl.stringAscii(mime),
        Cl.uint(1),
        Cl.list([Cl.bufferFromHex('aa')]),
        Cl.stringAscii('data:text/plain,bad-core')
      ],
      wallet1
    ).result;
    expectErr(result, 112);
  });
});
