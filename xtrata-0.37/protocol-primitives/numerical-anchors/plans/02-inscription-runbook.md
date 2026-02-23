# Inscription Runbook

## Preflight

1. Confirm slot state is `locked`.
2. Confirm payload digest and byte length are frozen.
3. Confirm parent references are immutable IDs.
4. Confirm fallback/error behavior is documented.

## Transaction Procedure

1. Build deterministic payload artifact.
2. Broadcast inscription transaction.
3. Record txid, block, and resulting inscription ID.
4. Verify payload hash after confirmation.
5. Update registry entry from `locked` to `inscribed`.

## Resume And Safety Rules

- If broadcast fails, do not mutate payload.
- Retry from the same artifact and same slot intent.
- Do not mark slot as `inscribed` until confirmation and hash match.

## Post-Inscription Validation

1. Resolve by inscription ID.
2. Execute one recursion integration test.
3. Confirm all documented dependencies resolve.
4. Publish verification notes in the registry.
