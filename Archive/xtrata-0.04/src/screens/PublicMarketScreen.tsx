import MarketScreen, { type MarketScreenProps } from './MarketScreen';
import { MARKET_REGISTRY, getMarketContractId } from '../lib/market/registry';

type PublicMarketScreenProps = Omit<
  MarketScreenProps,
  'variant' | 'marketContractIdOverride'
>;

export default function PublicMarketScreen(props: PublicMarketScreenProps) {
  const defaultMarketId = getMarketContractId(MARKET_REGISTRY[0]);
  return (
    <MarketScreen
      {...props}
      variant="public"
      marketContractIdOverride={defaultMarketId}
    />
  );
}
