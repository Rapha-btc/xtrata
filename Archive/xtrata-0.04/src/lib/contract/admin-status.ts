import { useQuery } from '@tanstack/react-query';
import type { XtrataClient } from './client';
import { getContractId } from './config';
import { resolveContractCapabilities } from './capabilities';

export type ContractAdminStatus = {
  admin: string | null;
  royaltyRecipient: string | null;
  feeUnitMicroStx: bigint | null;
  paused: boolean | null;
  nextTokenId: bigint | null;
};

export const EMPTY_ADMIN_STATUS: ContractAdminStatus = {
  admin: null,
  royaltyRecipient: null,
  feeUnitMicroStx: null,
  paused: null,
  nextTokenId: null
};

export const getAdminStatusKey = (contractId: string) => [
  'contract-admin',
  contractId
];

export const fetchContractAdminStatus = async (params: {
  client: XtrataClient;
  senderAddress: string;
}): Promise<ContractAdminStatus> => {
  const capabilities = resolveContractCapabilities(params.client.contract);

  const [
    admin,
    royaltyRecipient,
    feeUnitMicroStx,
    paused,
    nextTokenId
  ] = await Promise.all([
    capabilities.supportsAdminReadOnly
      ? params.client.getAdmin(params.senderAddress)
      : Promise.resolve(null),
    capabilities.supportsRoyaltyRecipientRead
      ? params.client.getRoyaltyRecipient(params.senderAddress)
      : Promise.resolve(null),
    capabilities.supportsFeeUnit
      ? params.client.getFeeUnit(params.senderAddress)
      : Promise.resolve(null),
    capabilities.supportsPause
      ? params.client.isPaused(params.senderAddress)
      : Promise.resolve(null),
    capabilities.supportsNextTokenId
      ? params.client.getNextTokenId(params.senderAddress)
      : Promise.resolve(null)
  ]);

  return {
    admin,
    royaltyRecipient,
    feeUnitMicroStx,
    paused,
    nextTokenId
  };
};

export const useContractAdminStatus = (params: {
  client: XtrataClient;
  senderAddress: string;
  enabled?: boolean;
}) => {
  const contractId = getContractId(params.client.contract);
  const capabilities = resolveContractCapabilities(params.client.contract);
  const supportsReadOnly =
    capabilities.supportsAdminReadOnly ||
    capabilities.supportsRoyaltyRecipientRead ||
    capabilities.supportsFeeUnit ||
    capabilities.supportsPause ||
    capabilities.supportsNextTokenId;
  const enabled =
    (params.enabled ?? true) &&
    supportsReadOnly &&
    params.senderAddress.length > 0;

  return useQuery({
    queryKey: getAdminStatusKey(contractId),
    queryFn: () => fetchContractAdminStatus(params),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });
};
