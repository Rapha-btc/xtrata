type FindFirstMatchInBatchesParams<T> = {
  items: readonly T[];
  batchSize?: number;
  predicate: (item: T, index: number) => Promise<boolean>;
};

export const findFirstMatchInBatches = async <T>({
  items,
  batchSize = 4,
  predicate
}: FindFirstMatchInBatchesParams<T>): Promise<T | null> => {
  if (items.length === 0) {
    return null;
  }

  const normalizedBatchSize = Math.max(1, Math.min(batchSize, items.length));
  for (let start = 0; start < items.length; start += normalizedBatchSize) {
    const batch = items.slice(start, start + normalizedBatchSize);
    const matches = await Promise.all(
      batch.map((item, offset) => predicate(item, start + offset))
    );
    const matchIndex = matches.findIndex(Boolean);
    if (matchIndex !== -1) {
      return batch[matchIndex] ?? null;
    }
  }

  return null;
};
