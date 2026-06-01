# Xboard V1 Clarinet Suite

Runnable Clarinet project for the X-Board ownership and programme registry.

## Run

```bash
npm install
clarinet check --use-computed-deployment-plan
npm test
```

Current verification result: `15` Vitest cases pass.

## Files

| File | Purpose |
|---|---|
| `contracts/xboard-v1.clar` | Registry contract |
| `contracts/xboard-v1-proxy.clar` | Test-only forwarding contract for nested-call rejection |
| `tests/xboard-v1.test.ts` | Clarinet SDK tests |
| `Clarinet.toml` | Contract manifest and analyzer settings |
| `settings/` | Network scaffold |
| `deployments/default.simnet-plan.yaml` | Generated simnet deployment plan |
| `test-suite-plan.md` | Plain-English coverage summary |

## V1 Contract Rules

- `93` tiles: `u0..u92`.
- Styled `(string-ascii 96)` `B1` programmes.
- `1 STX` minimum initial bid.
- `1%` protocol fee.
- Rounded-up `1%` minimum outbid.
- Refundable owner lock.
- Release remains available while paused.
- Every mutation must be called directly by a wallet.
- Protocol fees can be withdrawn only to standard wallet principals.
- `get-tile-page` returns at most `10` entries.

The proxy contract is test infrastructure only. Do not deploy it with the
production registry.
