import type { NetworkType } from './types';
import { getNetworkFromAddress } from './guard';
import { normalizeBnsName } from '../bns/helpers';

const STACKS_EXPLORER_BASE_URL = 'https://explorer.hiro.so';

const resolveNetwork = (network?: NetworkType | null) =>
  network === 'mainnet' || network === 'testnet' ? network : null;

export const getStacksExplorerAddressUrl = (
  value: string,
  network?: NetworkType | null
) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const chain = resolveNetwork(network) ?? getNetworkFromAddress(trimmed);
  if (!chain) {
    return null;
  }
  return `${STACKS_EXPLORER_BASE_URL}/address/${encodeURIComponent(trimmed)}?chain=${chain}`;
};

export const getStacksExplorerBnsUrl = (
  name: string,
  network?: NetworkType | null
) => {
  const normalizedName = normalizeBnsName(name);
  const chain = resolveNetwork(network);
  if (!normalizedName || !chain) {
    return null;
  }
  return `${STACKS_EXPLORER_BASE_URL}/name/${encodeURIComponent(normalizedName)}?chain=${chain}`;
};

export const getStacksExplorerContractUrl = (
  contractId: string,
  network?: NetworkType | null
) => getStacksExplorerAddressUrl(contractId, network);

export const getStacksExplorerTxUrl = (txId: string, network: NetworkType) => {
  const trimmed = txId.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return `${STACKS_EXPLORER_BASE_URL}/txid/${encodeURIComponent(normalized)}?chain=${network}`;
};
