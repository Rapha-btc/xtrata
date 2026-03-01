import type { ContractCapabilities, ProtocolVersion } from './types.js';

export const PROTOCOL_VERSIONS = ['1.1.1', '2.1.0', '2.1.1'] as const;

export const isProtocolVersion = (value: string): value is ProtocolVersion =>
  PROTOCOL_VERSIONS.includes(value as ProtocolVersion);

const CAPABILITIES_BY_VERSION: Record<ProtocolVersion, ContractCapabilities> = {
  '1.1.1': {
    version: '1.1.1',
    feeModel: 'fee-unit',
    supportsFeeUnit: true,
    supportsPause: true,
    supportsAdminReadOnly: true,
    supportsRoyaltyRecipientRead: true,
    supportsOwnershipTransfer: true,
    supportsAbandonUpload: true,
    supportsChunkBatchRead: true,
    pendingChunkRequiresCreator: true,
    metaHasCreator: true,
    supportsNextTokenId: true
  },
  '2.1.0': {
    version: '2.1.0',
    feeModel: 'fee-unit',
    supportsFeeUnit: true,
    supportsPause: true,
    supportsAdminReadOnly: true,
    supportsRoyaltyRecipientRead: true,
    supportsOwnershipTransfer: true,
    supportsAbandonUpload: true,
    supportsChunkBatchRead: true,
    pendingChunkRequiresCreator: true,
    metaHasCreator: true,
    supportsNextTokenId: true
  },
  '2.1.1': {
    version: '2.1.1',
    feeModel: 'fee-unit',
    supportsFeeUnit: true,
    supportsPause: true,
    supportsAdminReadOnly: true,
    supportsRoyaltyRecipientRead: true,
    supportsOwnershipTransfer: true,
    supportsAbandonUpload: true,
    supportsChunkBatchRead: true,
    pendingChunkRequiresCreator: true,
    metaHasCreator: true,
    supportsNextTokenId: true
  }
};

const inferProtocolVersion = (contractName: string): ProtocolVersion | null => {
  const normalized = contractName.toLowerCase();
  if (normalized.includes('v1-1-1') || normalized.includes('v1.1.1')) {
    return '1.1.1';
  }
  if (normalized.includes('v2-1-0') || normalized.includes('v2.1.0')) {
    return '2.1.0';
  }
  if (normalized.includes('v2-1-1') || normalized.includes('v2.1.1')) {
    return '2.1.1';
  }
  return null;
};

export const resolveContractCapabilities = (contract: {
  protocolVersion?: string;
  contractName?: string;
}): ContractCapabilities => {
  if (contract.protocolVersion && isProtocolVersion(contract.protocolVersion)) {
    return CAPABILITIES_BY_VERSION[contract.protocolVersion];
  }
  if (contract.contractName) {
    const inferred = inferProtocolVersion(contract.contractName);
    if (inferred) {
      return CAPABILITIES_BY_VERSION[inferred];
    }
  }
  return CAPABILITIES_BY_VERSION['1.1.1'];
};
