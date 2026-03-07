import CommerceScreen, { type CommerceScreenProps } from './CommerceScreen';
import {
  COMMERCE_REGISTRY,
  getCommerceContractId
} from '../lib/commerce/registry';

type PublicCommerceScreenProps = Omit<
  CommerceScreenProps,
  'variant' | 'defaultCommerceContractId'
>;

export default function PublicCommerceScreen(props: PublicCommerceScreenProps) {
  const defaultCommerceId = getCommerceContractId(COMMERCE_REGISTRY[0]);
  return (
    <CommerceScreen
      {...props}
      variant="public"
      defaultCommerceContractId={defaultCommerceId}
    />
  );
}
