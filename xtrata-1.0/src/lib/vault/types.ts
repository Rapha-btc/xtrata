export type VaultRecord = {
  assetId: bigint;
  owner: string;
  amount: bigint;
  tier: bigint;
  reserved: boolean;
  createdAt: bigint;
  updatedAt: bigint;
};
