import { validateStacksAddress } from '@stacks/transactions';
import type { NetworkType } from '../lib/network/types';
import { getNetworkFromAddress } from '../lib/network/guard';
import { getStacksExplorerAddressUrl } from '../lib/network/explorer';
import { useBnsNames } from '../lib/bns/hooks';
import { truncateMiddle } from '../lib/utils/format';

const joinClassName = (...values: Array<string | null | undefined>) =>
  values.filter(Boolean).join(' ');

type AddressLabelProps = {
  address: string | null | undefined;
  name?: string | null;
  network?: NetworkType | null;
  className?: string;
  head?: number;
  tail?: number;
  fallback?: string;
  linkToExplorer?: boolean;
  showAddressWhenNamed?: boolean;
};

export default function AddressLabel(props: AddressLabelProps) {
  const trimmed = props.address?.trim() ?? '';
  const hasAddress = trimmed.length > 0;
  const inferredNetwork =
    props.network ?? (hasAddress ? getNetworkFromAddress(trimmed) : null);
  const canResolve =
    !props.name && hasAddress && validateStacksAddress(trimmed) && !!inferredNetwork;
  const bnsQuery = useBnsNames({
    address: trimmed,
    network: inferredNetwork,
    enabled: canResolve
  });
  const primaryName = props.name ?? bnsQuery.data?.primary ?? null;
  const truncated = hasAddress
    ? truncateMiddle(trimmed, props.head ?? 6, props.tail ?? 6)
    : '';
  const primaryLabel = primaryName ?? truncated;
  const showSecondary = !!primaryName && !!props.showAddressWhenNamed;
  const fallback = props.fallback ?? 'Unknown';
  const explorerUrl =
    props.linkToExplorer === false || !hasAddress
      ? null
      : getStacksExplorerAddressUrl(trimmed, inferredNetwork);

  if (!hasAddress) {
    return (
      <span className={joinClassName('address-label', props.className)}>
        {fallback}
      </span>
    );
  }

  const ariaLabel = primaryName
    ? `${primaryName} (${trimmed})`
    : trimmed;

  const labelContent = (
    <>
      <span className="address-label__name address-label__line">
        {primaryLabel}
      </span>
      {showSecondary && (
        <span className="address-label__address address-label__line">
          {truncated}
        </span>
      )}
    </>
  );

  if (explorerUrl) {
    return (
      <a
        className={joinClassName('address-label address-label__link', props.className)}
        title={trimmed}
        aria-label={ariaLabel}
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
      >
        {labelContent}
      </a>
    );
  }

  return (
    <span
      className={joinClassName('address-label', props.className)}
      title={trimmed}
      aria-label={ariaLabel}
    >
      {labelContent}
    </span>
  );
}
