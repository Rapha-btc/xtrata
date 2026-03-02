import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

const coreContract = `${deployer}.xtrata-v2-1-0`;
const mintContract = `${deployer}.xtrata-collection-mint-v1-3`;
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

function unwrapOk(result: any) {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
}

function expectErr(result: any, code: number | bigint) {
  expect(result).toBeErr(Cl.uint(code));
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

describe('xtrata-collection-mint-v1.3 recipient access controls', () => {
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

  it('keeps mint begin/chunk/seal flow working with v1.3 controls', () => {
    unwrapOk(simnet.callPublicFn(coreContract, 'set-paused', [Cl.bool(false)], deployer).result);
    unwrapOk(simnet.callPublicFn(mintContract, 'set-max-supply', [Cl.uint(10)], deployer).result);
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

    const hash = computeFinalHash(['aa']);
    unwrapOk(beginMint(wallet1, hash));
    unwrapOk(addChunk(wallet1, hash, 'aa'));
    const sealResult = sealMint(wallet1, hash, 'data:text/plain,v1.3');
    expect(sealResult.type).toBe(ClarityType.ResponseOk);
  });
});
