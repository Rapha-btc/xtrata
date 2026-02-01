export type ProtocolVersion = '1.1.1';

export const PROTOCOL_VERSIONS = ['1.1.1'] as const;

export const isProtocolVersion = (value: string): value is ProtocolVersion =>
  PROTOCOL_VERSIONS.includes(value as ProtocolVersion);

export type ContractCapabilities = {
  version: ProtocolVersion;
  feeModel: 'fee-unit';
  supportsFeeUnit: boolean;
  supportsPause: boolean;
  supportsAdminReadOnly: boolean;
  supportsRoyaltyRecipientRead: boolean;
  supportsOwnershipTransfer: boolean;
  supportsAbandonUpload: boolean;
  supportsChunkBatchRead: boolean;
  pendingChunkRequiresCreator: boolean;
  metaHasCreator: boolean;
  supportsNextTokenId: boolean;
};

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
  }
};

const inferProtocolVersion = (contractName: string): ProtocolVersion | null => {
  const normalized = contractName.toLowerCase();
  if (normalized.includes('v1-1-1') || normalized.includes('v1.1.1')) {
    return '1.1.1';
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
