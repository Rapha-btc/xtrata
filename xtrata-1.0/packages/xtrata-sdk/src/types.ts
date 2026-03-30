export type NetworkType = 'mainnet' | 'testnet';

export type ProtocolVersion = '1.1.1' | '2.1.0' | '2.1.1' | '3.0.0';

export type ContractConfig = {
  address: string;
  contractName: string;
  network: NetworkType;
  protocolVersion?: ProtocolVersion;
};

export type ContractCapabilities = {
  version: ProtocolVersion;
  feeModel: 'fee-unit';
  supportsFeeUnit: boolean;
  supportsPause: boolean;
  supportsAdminReadOnly: boolean;
  supportsRoyaltyRecipientRead: boolean;
  supportsMintOriginRead: boolean;
  supportsOwnershipTransfer: boolean;
  supportsAbandonUpload: boolean;
  supportsChunkBatchRead: boolean;
  pendingChunkRequiresCreator: boolean;
  metaHasCreator: boolean;
  supportsNextTokenId: boolean;
};

export type InscriptionMeta = {
  owner: string;
  creator: string | null;
  mimeType: string;
  totalSize: bigint;
  totalChunks: bigint;
  sealed: boolean;
  finalHash: Uint8Array;
};

export type UploadState = {
  mimeType: string;
  totalSize: bigint;
  totalChunks: bigint;
  currentIndex: bigint;
  runningHash: Uint8Array;
};

export type CollectionPhase = {
  enabled: boolean;
  startBlock: bigint;
  endBlock: bigint;
  mintPrice: bigint;
  maxPerWallet: bigint;
  maxSupply: bigint;
  allowlistMode: bigint;
};

export type CollectionMetadata = {
  name: string;
  symbol: string;
  baseUri: string;
  description: string;
  projectUri: string;
  collectionPageUri: string;
  coverInscriptionId: bigint | null;
  revealBlock: bigint;
};

export type CollectionCoverInscription = {
  coreContract: string;
  tokenId: bigint | null;
};

export type CollectionSummary = CollectionMetadata & {
  paused: boolean;
  finalized: boolean;
  mintPrice: bigint;
  maxSupply: bigint;
  mintedCount: bigint;
  reservedCount: bigint;
  activePhaseId: bigint;
  lockedCoreContract: string;
  maxSmallMintChunks: bigint;
};

export type CollectionRecipients = {
  artist: string;
  marketplace: string;
  operator: string;
};

export type CollectionSplits = {
  artist: bigint;
  marketplace: bigint;
  operator: bigint;
};

export type CollectionMintStatus = {
  paused: boolean;
  finalized: boolean;
  mintPrice: bigint;
  maxSupply: bigint;
  mintedCount: bigint;
  reservedCount: bigint;
  activePhaseId: bigint;
  activePhase: CollectionPhase | null;
};

export type CollectionMintSnapshot = CollectionMintStatus & {
  remaining: bigint;
  live: boolean;
  soldOut: boolean;
};

export type MarketListing = {
  seller: string;
  nftContract: string;
  tokenId: bigint;
  price: bigint;
  createdAt: bigint;
};

export type SdkContractRegistryEntry = ContractConfig & {
  label: string;
  legacyContractId?: string;
};
