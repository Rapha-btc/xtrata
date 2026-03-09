const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toSortableText = (value: unknown) => String(value ?? '').trim();

export const getCollectionPageDisplayOrder = (metadata: unknown) => {
  const metadataRecord = toRecord(metadata);
  const collectionPage = toRecord(metadataRecord?.collectionPage);
  const rawOrder = toFiniteNumber(collectionPage?.displayOrder);
  if (rawOrder === null) {
    return null;
  }
  return Math.trunc(rawOrder);
};

export const sortPublicCollectionCards = <
  T extends {
    id?: unknown;
    name?: unknown;
    displayOrder?: unknown;
  }
>(
  cards: T[]
) => {
  const copy = [...cards];
  copy.sort((left, right) => {
    const leftOrder = toFiniteNumber(left.displayOrder);
    const rightOrder = toFiniteNumber(right.displayOrder);
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== null && rightOrder === null) {
      return -1;
    }
    if (leftOrder === null && rightOrder !== null) {
      return 1;
    }
    const leftName = toSortableText(left.name);
    const rightName = toSortableText(right.name);
    const nameComparison = leftName.localeCompare(rightName);
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return toSortableText(left.id).localeCompare(toSortableText(right.id));
  });
  return copy;
};
