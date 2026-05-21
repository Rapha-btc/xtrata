import { createHash } from 'crypto';
import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const coreContract = `${deployer}.xtrata-v2-1-0`;
const sourceContract = `${deployer}.mock-ipfs-collection`;
const registryContract = `${deployer}.xtrata-backup-registry-v1-0`;
const migratedContract = `${deployer}.xtrata-migrated-ipfs-collection-v1-0`;

const corePrincipal = Cl.contractPrincipal(deployer, 'xtrata-v2-1-0');
const sourcePrincipal = Cl.contractPrincipal(deployer, 'mock-ipfs-collection');
const migratedPrincipal = Cl.contractPrincipal(
  deployer,
  'xtrata-migrated-ipfs-collection-v1-0'
);

const mime = 'application/json';

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
  return value.value as bigint;
}

function unwrapOptionalTuple(result: any) {
  expect(result.type).toBe(ClarityType.OptionalSome);
  const tuple = result.value;
  expect(tuple.type).toBe(ClarityType.Tuple);
  return tuple.value as Record<string, any>;
}

function expectErr(result: any, code: number | bigint) {
  expect(result).toBeErr(Cl.uint(code));
}

function mintSourceToken(tokenId: bigint, owner: string, tokenUri: string) {
  return unwrapOkUint(
    simnet.callPublicFn(
      sourceContract,
      'mint',
      [Cl.uint(tokenId), Cl.standardPrincipal(owner), Cl.stringAscii(tokenUri)],
      deployer
    ).result
  );
}

function mintXtrataBackup(sender: string, chunksHex: string[], tokenUri: string) {
  const hash = computeFinalHash(chunksHex);
  unwrapOk(simnet.callPublicFn(coreContract, 'set-paused', [Cl.bool(false)], deployer).result);
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
  const tokenId = unwrapOkUint(
    simnet.callPublicFn(
      coreContract,
      'seal-inscription',
      [Cl.bufferFromHex(hash), Cl.stringAscii(tokenUri)],
      sender
    ).result
  );
  return { hash, tokenId };
}

function registerBackup(params: {
  sourceTokenId: bigint;
  inscriptionId: bigint;
  contentHash: string;
  metadataUri: string;
  backupUri: string;
  sender?: string;
}) {
  return simnet.callPublicFn(
    registryContract,
    'register-backup',
    [
      sourcePrincipal,
      Cl.uint(params.sourceTokenId),
      Cl.uint(params.inscriptionId),
      Cl.bufferFromHex(params.contentHash),
      Cl.stringAscii(params.metadataUri),
      Cl.stringAscii(params.backupUri)
    ],
    params.sender ?? deployer
  ).result;
}

describe('xtrata backup migration prototype', () => {
  it('registers immutable backup pointers after verifying Xtrata hash', () => {
    const backup = mintXtrataBackup(wallet1, ['7b226f6b223a747275657d'], 'data:application/json,backup');
    const metadataUri = 'ipfs://bafy-source/1.json';
    const backupUri = `xtrata://${deployer}.xtrata-v2-1-0/${backup.tokenId.toString()}`;

    unwrapOk(
      registerBackup({
        sourceTokenId: 1n,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri,
        backupUri
      })
    );

    const registered = unwrapOptionalTuple(
      simnet.callReadOnlyFn(registryContract, 'get-backup', [sourcePrincipal, Cl.uint(1)], deployer)
        .result
    );
    expect(registered['xtrata-contract']).toEqual(corePrincipal);
    expect(registered['inscription-id']).toEqual(Cl.uint(backup.tokenId));
    expect(registered['content-hash']).toEqual(Cl.bufferFromHex(backup.hash));
    expect(registered['metadata-uri']).toEqual(Cl.stringAscii(metadataUri));
    expect(registered['backup-uri']).toEqual(Cl.stringAscii(backupUri));
    expect(registered.registrar).toEqual(Cl.standardPrincipal(deployer));

    expect(
      simnet.callReadOnlyFn(registryContract, 'has-backup', [sourcePrincipal, Cl.uint(1)], deployer)
        .result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(
        registryContract,
        'get-backup-uri',
        [sourcePrincipal, Cl.uint(1)],
        deployer
      ).result
    ).toBeSome(Cl.stringAscii(backupUri));

    expectErr(
      registerBackup({
        sourceTokenId: 1n,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri,
        backupUri
      }),
      101
    );
  });

  it('rejects unauthorized or unverifiable backup registration', () => {
    const backup = mintXtrataBackup(wallet1, ['7b22626164223a66616c73657d'], 'data:application/json,backup');
    const metadataUri = 'ipfs://bafy-source/2.json';
    const backupUri = `xtrata://${deployer}.xtrata-v2-1-0/${backup.tokenId.toString()}`;

    expectErr(
      registerBackup({
        sourceTokenId: 2n,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri,
        backupUri,
        sender: wallet1
      }),
      100
    );

    unwrapOk(
      simnet.callPublicFn(
        registryContract,
        'set-collection-editor',
        [sourcePrincipal, Cl.standardPrincipal(wallet1), Cl.bool(true)],
        deployer
      ).result
    );

    expect(
      simnet.callReadOnlyFn(
        registryContract,
        'is-collection-editor',
        [sourcePrincipal, Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expectErr(
      registerBackup({
        sourceTokenId: 2n,
        inscriptionId: backup.tokenId,
        contentHash: '00'.repeat(32),
        metadataUri,
        backupUri,
        sender: wallet1
      }),
      104
    );

    unwrapOk(
      registerBackup({
        sourceTokenId: 2n,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri,
        backupUri,
        sender: wallet1
      })
    );
  });

  it('migrates only after a backup exists and preserves token URI behavior', () => {
    const sourceTokenId = mintSourceToken(7n, wallet1, 'ipfs://bafy-source/7.json');
    const backup = mintXtrataBackup(wallet2, ['7b22746f6b656e223a377d'], 'data:application/json,token-7-backup');
    const backupUri = `xtrata://${deployer}.xtrata-v2-1-0/${backup.tokenId.toString()}`;

    expect(sourceTokenId).toBe(7n);
    unwrapOk(
      registerBackup({
        sourceTokenId,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri: 'ipfs://bafy-source/7.json',
        backupUri
      })
    );

    expectErr(
      simnet.callPublicFn(migratedContract, 'migrate', [Cl.uint(sourceTokenId)], wallet2).result,
      100
    );

    expect(
      simnet.callPublicFn(migratedContract, 'migrate', [Cl.uint(sourceTokenId)], wallet1).result
    ).toBeOk(Cl.uint(sourceTokenId));

    expect(
      simnet.callReadOnlyFn(sourceContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1).result
    ).toBeOk(Cl.some(migratedPrincipal));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-token-uri', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeOk(Cl.some(Cl.stringAscii('ipfs://bafy-source/7.json')));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-backup-uri', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeSome(Cl.stringAscii(backupUri));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'is-migrated', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-migrated-id', [Cl.uint(0)], wallet1).result
    ).toBeSome(Cl.uint(sourceTokenId));

    const migratedBackup = unwrapOptionalTuple(
      simnet.callReadOnlyFn(migratedContract, 'get-backup', [Cl.uint(sourceTokenId)], wallet1)
        .result
    );
    expect(migratedBackup['content-hash']).toEqual(Cl.bufferFromHex(backup.hash));
    expect(migratedBackup['backup-uri']).toEqual(Cl.stringAscii(backupUri));

    expectErr(
      simnet.callPublicFn(migratedContract, 'migrate', [Cl.uint(sourceTokenId)], wallet1).result,
      102
    );
  });

  it('blocks migration when the source token has no registered backup', () => {
    const sourceTokenId = mintSourceToken(9n, wallet1, 'ipfs://bafy-source/9.json');

    expectErr(
      simnet.callPublicFn(migratedContract, 'migrate', [Cl.uint(sourceTokenId)], wallet1).result,
      103
    );

    expect(
      simnet.callReadOnlyFn(sourceContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1).result
    ).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeOk(Cl.none());
  });

  it('keeps migrated tokens transferable through the new SIP-009 contract', () => {
    const sourceTokenId = mintSourceToken(11n, wallet1, 'ipfs://bafy-source/11.json');
    const backup = mintXtrataBackup(wallet2, ['7b22746f6b656e223a31317d'], 'data:application/json,token-11-backup');

    unwrapOk(
      registerBackup({
        sourceTokenId,
        inscriptionId: backup.tokenId,
        contentHash: backup.hash,
        metadataUri: 'ipfs://bafy-source/11.json',
        backupUri: `xtrata://${deployer}.xtrata-v2-1-0/${backup.tokenId.toString()}`
      })
    );
    unwrapOk(simnet.callPublicFn(migratedContract, 'migrate', [Cl.uint(sourceTokenId)], wallet1).result);

    expect(
      simnet.callPublicFn(
        migratedContract,
        'transfer',
        [Cl.uint(sourceTokenId), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      ).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(migratedContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1)
        .result
    ).toBeOk(Cl.some(Cl.standardPrincipal(wallet2)));
    expect(
      simnet.callReadOnlyFn(sourceContract, 'get-owner', [Cl.uint(sourceTokenId)], wallet1).result
    ).toBeOk(Cl.some(migratedPrincipal));
  });
});
