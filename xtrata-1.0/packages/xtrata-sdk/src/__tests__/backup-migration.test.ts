import { ClarityType, NonFungibleConditionCode, PostConditionMode } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { SdkValidationError } from '../errors';
import {
  buildBackupMigrationWorkflowPlan,
  buildMigratedCollectionMigrateCall,
  buildRegisterBackupCall,
  buildSourceNftEscrowPostCondition,
  buildXtrataBackupUri
} from '../backup-migration';

const mainnetAddress = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const holderAddress = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';

const registryContract = {
  address: mainnetAddress,
  contractName: 'xtrata-backup-registry-v1-0',
  network: 'mainnet' as const
};

const sourceContract = {
  address: mainnetAddress,
  contractName: 'old-ipfs-collection',
  network: 'mainnet' as const
};

const xtrataContract = {
  address: mainnetAddress,
  contractName: 'xtrata-v2-1-0',
  network: 'mainnet' as const
};

const migratedCollectionContract = {
  address: mainnetAddress,
  contractName: 'new-ipfs-collection',
  network: 'mainnet' as const
};

describe('backup migration sdk helpers', () => {
  it('builds a permanent Xtrata backup URI', () => {
    expect(
      buildXtrataBackupUri({
        xtrataContract,
        inscriptionId: 42n
      })
    ).toBe(`${mainnetAddress}.xtrata-v2-1-0`.replace(/^/, 'xtrata://') + '/42');
  });

  it('builds registry registration call args', () => {
    const contentHash = new Uint8Array(32).fill(7);
    const call = buildRegisterBackupCall({
      registryContract,
      sourceContract,
      xtrataContract,
      sourceTokenId: 9n,
      inscriptionId: 42n,
      contentHash,
      metadataUri: 'ipfs://bafy/9.json'
    });

    expect(call.contractName).toBe('xtrata-backup-registry-v1-0');
    expect(call.functionName).toBe('register-backup');
    expect(call.functionArgs).toHaveLength(6);
    expect(call.functionArgs[0].type).toBe(ClarityType.PrincipalContract);
    expect(call.functionArgs[2].type).toBe(ClarityType.UInt);
  });

  it('builds migrated collection migrate call', () => {
    const call = buildMigratedCollectionMigrateCall({
      migratedCollectionContract,
      sourceTokenId: 9n
    });

    expect(call.functionName).toBe('migrate');
    expect(call.functionArgs).toHaveLength(1);
    expect(call.functionArgs[0].type).toBe(ClarityType.UInt);
  });

  it('builds source NFT escrow post-condition', () => {
    const postCondition = buildSourceNftEscrowPostCondition({
      sourceContract,
      holderAddress,
      sourceTokenId: 9n,
      sourceAssetName: 'old-token'
    }) as { conditionCode: number };

    expect(postCondition.conditionCode).toBe(NonFungibleConditionCode.Sends);
  });

  it('builds a holder migration workflow with deny-mode safety', () => {
    const plan = buildBackupMigrationWorkflowPlan({
      migratedCollectionContract,
      sourceContract,
      holderAddress,
      sourceTokenId: 9n,
      sourceAssetName: 'old-token'
    });

    expect(plan.call.functionName).toBe('migrate');
    expect(plan.call.postConditionMode).toBe(PostConditionMode.Deny);
    expect(plan.postConditions).toHaveLength(1);
    expect(plan.summaryLines[0]).toContain('Migrate source token #9');
  });

  it('validates hash length and contract networks', () => {
    expect(() =>
      buildRegisterBackupCall({
        registryContract,
        sourceContract,
        xtrataContract,
        sourceTokenId: 9n,
        inscriptionId: 42n,
        contentHash: new Uint8Array(31),
        metadataUri: 'ipfs://bafy/9.json'
      })
    ).toThrow(SdkValidationError);

    expect(() =>
      buildBackupMigrationWorkflowPlan({
        migratedCollectionContract: {
          ...migratedCollectionContract,
          network: 'testnet'
        },
        sourceContract,
        holderAddress,
        sourceTokenId: 9n,
        sourceAssetName: 'old-token'
      })
    ).toThrow('Contract networks do not match');
  });
});
