# xtrata market ecosystem note

This file is intentionally short.

Use the per-market notes for actual TODO tracking:
- `xtrata-market-v1.1.md`
- `xtrata-market-stx-v1.0.md`
- `xtrata-market-usdc-v1.0.md`
- `xtrata-market-sbtc-v1.0.md`

Shared limitation across all first-party market contracts:
- each market deployment is pinned to one core contract line
- if the core contract moves, the market layer needs its own matching deployment and registry update
- listing continuity across core versions is a product and migration problem, not just a UI toggle
