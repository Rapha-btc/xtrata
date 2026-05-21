import type { ContractCallOptions } from '@stacks/connect';
import type { StacksNetwork } from '@stacks/network';
import {
  NonFungibleConditionCode,
  PostConditionMode,
  bufferCV,
  contractPrincipalCV,
  createAssetInfo,
  makeStandardNonFungiblePostCondition,
  stringAsciiCV,
  uintCV,
  type PostCondition
} from '@stacks/transactions';
import { buildContractCallOptions, type ContractCallOverrides } from './client.js';
import { getContractId } from './config.js';
import { SdkValidationError } from './errors.js';
import { MAX_TOKEN_URI_LENGTH } from './mint.js';
import { toStacksNetwork } from './network.js';
import type { ContractConfig } from './types.js';

const EXPECTED_HASH_BYTES = 32;

const assertTrimmedString = (value: string, field: string) => {
  if (!value.trim()) {
    throw new SdkValidationError('invalid-input', `${field} is required.`);
  }
};

const assertAsciiString256 = (value: string, field: string) => {
  assertTrimmedString(value, field);
  if (value.length > MAX_TOKEN_URI_LENGTH) {
    throw new SdkValidationError(
      'invalid-input',
      `${field} exceeds max length (${MAX_TOKEN_URI_LENGTH}).`
    );
  }
};

const assertContentHash = (contentHash: Uint8Array) => {
  if (contentHash.length !== EXPECTED_HASH_BYTES) {
    throw new SdkValidationError(
      'invalid-input',
      `contentHash must be ${EXPECTED_HASH_BYTES} bytes.`
    );
  }
};

const assertNonNegativeBigint = (value: bigint, field: string) => {
  if (value < 0n) {
    throw new SdkValidationError(
      'invalid-input',
      `${field} must be zero or greater.`
    );
  }
};

const assertMatchingNetwork = (left: ContractConfig, right: ContractConfig) => {
  if (left.network !== right.network) {
    throw new SdkValidationError(
      'network-mismatch',
      `Contract networks do not match (${left.network} vs ${right.network}).`
    );
  }
};

export type XtrataBackupPointer = {
  xtrataContract: ContractConfig;
  inscriptionId: bigint;
  contentHash: Uint8Array;
  metadataUri: string;
  backupUri: string;
};

export const buildXtrataBackupUri = (params: {
  xtrataContract: Pick<ContractConfig, 'address' | 'contractName'>;
  inscriptionId: bigint;
}) => {
  assertNonNegativeBigint(params.inscriptionId, 'inscriptionId');
  return `xtrata://${getContractId(params.xtrataContract)}/${params.inscriptionId.toString()}`;
};

export const buildRegisterBackupCall = (params: {
  registryContract: ContractConfig;
  sourceContract: ContractConfig;
  xtrataContract: ContractConfig;
  sourceTokenId: bigint;
  inscriptionId: bigint;
  contentHash: Uint8Array;
  metadataUri: string;
  backupUri?: string;
  network?: StacksNetwork;
  apiBaseUrl?: string;
  overrides?: ContractCallOverrides;
}) => {
  assertMatchingNetwork(params.registryContract, params.sourceContract);
  assertMatchingNetwork(params.registryContract, params.xtrataContract);
  assertNonNegativeBigint(params.sourceTokenId, 'sourceTokenId');
  assertNonNegativeBigint(params.inscriptionId, 'inscriptionId');
  assertContentHash(params.contentHash);
  assertAsciiString256(params.metadataUri, 'metadataUri');

  const backupUri =
    params.backupUri ??
    buildXtrataBackupUri({
      xtrataContract: params.xtrataContract,
      inscriptionId: params.inscriptionId
    });
  assertAsciiString256(backupUri, 'backupUri');

  return buildContractCallOptions({
    contract: params.registryContract,
    network:
      params.network ??
      toStacksNetwork(params.registryContract.network, params.apiBaseUrl),
    functionName: 'register-backup',
    functionArgs: [
      contractPrincipalCV(
        params.sourceContract.address,
        params.sourceContract.contractName
      ),
      uintCV(params.sourceTokenId),
      uintCV(params.inscriptionId),
      bufferCV(params.contentHash),
      stringAsciiCV(params.metadataUri),
      stringAsciiCV(backupUri)
    ],
    overrides: params.overrides
  });
};

export const buildMigratedCollectionMigrateCall = (params: {
  migratedCollectionContract: ContractConfig;
  sourceTokenId: bigint;
  network?: StacksNetwork;
  apiBaseUrl?: string;
  overrides?: ContractCallOverrides;
}) => {
  assertNonNegativeBigint(params.sourceTokenId, 'sourceTokenId');
  return buildContractCallOptions({
    contract: params.migratedCollectionContract,
    network:
      params.network ??
      toStacksNetwork(params.migratedCollectionContract.network, params.apiBaseUrl),
    functionName: 'migrate',
    functionArgs: [uintCV(params.sourceTokenId)],
    overrides: params.overrides
  });
};

export const buildSourceNftEscrowPostCondition = (params: {
  sourceContract: ContractConfig;
  holderAddress: string;
  sourceTokenId: bigint;
  sourceAssetName: string;
}) => {
  assertTrimmedString(params.holderAddress, 'holderAddress');
  assertTrimmedString(params.sourceAssetName, 'sourceAssetName');
  assertNonNegativeBigint(params.sourceTokenId, 'sourceTokenId');
  return makeStandardNonFungiblePostCondition(
    params.holderAddress,
    NonFungibleConditionCode.Sends,
    createAssetInfo(
      params.sourceContract.address,
      params.sourceContract.contractName,
      params.sourceAssetName
    ),
    uintCV(params.sourceTokenId)
  );
};

export type BackupMigrationWorkflowPlan = {
  call: ContractCallOptions;
  postConditions: PostCondition[];
  summaryLines: string[];
};

export const buildBackupMigrationWorkflowPlan = (params: {
  migratedCollectionContract: ContractConfig;
  sourceContract: ContractConfig;
  holderAddress: string;
  sourceTokenId: bigint;
  sourceAssetName: string;
  apiBaseUrl?: string;
}): BackupMigrationWorkflowPlan => {
  assertMatchingNetwork(params.migratedCollectionContract, params.sourceContract);

  const postConditions = [
    buildSourceNftEscrowPostCondition({
      sourceContract: params.sourceContract,
      holderAddress: params.holderAddress,
      sourceTokenId: params.sourceTokenId,
      sourceAssetName: params.sourceAssetName
    })
  ];

  const call = buildMigratedCollectionMigrateCall({
    migratedCollectionContract: params.migratedCollectionContract,
    sourceTokenId: params.sourceTokenId,
    apiBaseUrl: params.apiBaseUrl,
    overrides: {
      postConditionMode: PostConditionMode.Deny,
      postConditions
    }
  });

  return {
    call,
    postConditions,
    summaryLines: [
      `Migrate source token #${params.sourceTokenId.toString()} into ${getContractId(
        params.migratedCollectionContract
      )}.`,
      'Deny mode enforces source NFT escrow from the holder wallet.'
    ]
  };
};
