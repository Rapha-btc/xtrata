export const buildTokenRange = (lastTokenId: bigint) => {
  if (lastTokenId < 0n) {
    throw new Error('lastTokenId must be greater than or equal to zero');
  }
  const ids: bigint[] = [];
  for (let id = 0n; id <= lastTokenId; id += 1n) {
    ids.push(id);
  }
  return ids;
};

export const buildTokenPage = (
  lastTokenId: bigint,
  pageIndex: number,
  pageSize: number
) => {
  if (lastTokenId < 0n) {
    throw new Error('lastTokenId must be greater than or equal to zero');
  }
  if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageSize <= 0) {
    return [];
  }
  const start = BigInt(pageIndex) * BigInt(pageSize);
  if (start > lastTokenId) {
    return [];
  }
  const end = start + BigInt(pageSize) - 1n;
  const last = end > lastTokenId ? lastTokenId : end;
  const ids: bigint[] = [];
  for (let id = start; id <= last; id += 1n) {
    ids.push(id);
  }
  return ids;
};
