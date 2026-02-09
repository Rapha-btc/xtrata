# Rollout Checklist

## Pre-implementation

1. Confirm final decision set from `02-product-options-and-design-decisions.md`.
2. Confirm storage/runtime target for asset staging backend.
3. Confirm env var names for manager allowlist and API auth.

## Pre-deploy readiness

1. Manager gate tested with allowlisted and non-allowlisted wallets.
2. Owner-check enforcement validated against live read-only owner values.
3. Deploy wizard validated on testnet end-to-end.
4. Collection setup sequencing verified (including paused/finalized guards).
5. Asset upload and manifest persistence verified with realistic folders.
6. Buyer mint from staged assets verified on testnet.

## Launch sequencing

1. Deploy backend endpoints and storage policies.
2. Deploy frontend with feature flag default `off`.
3. Enable feature for internal allowlist only.
4. Run pilot with one or two artist wallets.
5. Evaluate logs and failure patterns.
6. Expand allowlist gradually.

## Operational safeguards

1. Add rate limits on upload and reservation endpoints.
2. Enforce max file size/count and accepted MIME guardrails.
3. Add TTL cleanup for stale reservations.
4. Maintain explicit audit logs for deploy/config/publish actions.

## Rollback strategy

1. Disable manager feature flag.
2. Keep existing admin and collection mint screens operational.
3. Leave published collection manifests read-only.
4. Preserve registry data for later re-enable.

## Post-launch monitoring

1. Track mint success/failure rate by collection.
2. Track reservation expiration/failure ratio.
3. Track average upload processing time and error classes.
4. Monitor support tickets for permission/confusion issues.
