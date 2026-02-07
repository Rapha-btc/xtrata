# Rollout Checklist

## Pre-Implementation

1. Read `docs/app-reference.md`.
2. Confirm active scope is `ViewerScreen` wallet mode + `MarketScreen`.
3. Record baseline manual behavior for:
   - wallet transfer,
   - market buy,
   - market cancel via listing id input.

## Implementation Sequence

1. Add shared market action helpers and unit tests.
2. Add listing-resolution helper and unit tests.
3. Integrate wallet listing tools into `ViewerScreen` wallet mode.
4. Add preview listed-badge shortcut to listing tools.
5. Update `MarketScreen` active listing seller actions (`Manage` + direct cancel path).
6. Adjust CSS only where needed to preserve existing panel geometry.

## Verification Gates

1. Run `npm run test:app`.
2. Run `npm run test:clarinet`.
3. Run `npm run lint`.
4. Manual check wallet and market flows from `05-test-and-validation-plan.md`.

## Release Readiness

1. Confirm no mint flow or deploy flow behavior changed.
2. Confirm no new aggressive polling intervals.
3. Confirm no horizontal layout shift in module collapse/expand.
4. Confirm square grid + square preview invariants are preserved.

## Post-Delivery Notes

1. Update `docs/app-reference.md` for new helper modules.
2. Optionally deprecate or archive `MyWalletScreen` once parity is fully in `ViewerScreen`.
