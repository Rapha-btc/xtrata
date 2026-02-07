import type { TokenSummary } from './types';

export const filterTokensByOwner = (
  tokens: TokenSummary[],
  ownerAddress?: string | null
) => {
  if (!ownerAddress) {
    return [];
  }
  const normalized = ownerAddress.toUpperCase();
  return tokens.filter(
    (token) => token.owner && token.owner.toUpperCase() === normalized
  );
};
