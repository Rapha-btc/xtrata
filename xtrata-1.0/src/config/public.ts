import type { ContractRegistryEntry } from '../lib/contract/registry';

export const PUBLIC_CONTRACT: ContractRegistryEntry = {
  label: 'xtrata-v2-1-0',
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-v2-1-0',
  network: 'mainnet',
  protocolVersion: '2.1.0',
  legacyContractId: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v1-1-1'
};

export const PUBLIC_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const PUBLIC_FIXED_BATCH_SIZE = 30;
export const PUBLIC_FIXED_TOKEN_URI =
  'https://xvgh3sbdkivby4blejmripeiyjuvji3d4tycym6hgaxalescegjq.arweave.net/vUx9yCNSKhxwKyJZFDyIwmlUo2Pk8CwzxzAuBZJCIZM';

export const PUBLIC_MINT_RESTRICTIONS = {
  fixedBatchSize: PUBLIC_FIXED_BATCH_SIZE,
  fixedTokenUri: PUBLIC_FIXED_TOKEN_URI,
  maxFileBytes: PUBLIC_MAX_FILE_BYTES,
  hideDelegate: true,
  hideTokenUri: true,
  hideBatchSize: true,
  hideMetadataTools: true,
  hideFeeRateFetch: true,
  disableDuplicateOverride: true
};
