# Contract TODO Notes

Purpose:
- keep a short, practical shortcomings and upgrade note for each major first-party contract line
- separate "what the contract does today" from "what has to change next"
- make parent/child upgrade work explicit in the core line before code changes start

Current repo posture:
- The repo still treats `xtrata-v2.1.0` as the current first-party production core.
- `xtrata-v2.1.1` exists in-repo as a fee-controls upgrade candidate, not the default production assumption.
- These notes track repo posture and code assumptions. They do not verify live chain deployment state.

How to read this folder:
- Start with `xtrata-v2.1.0.md` for the current default core line.
- Read `xtrata-v2.1.1.md` if the upgrade path is expected to start from the split-fee variant.
- Use the market, collection, commerce, and vault notes for downstream redeploy scope.

Coverage map:

| Contract file in `contracts/live/` | TODO note |
| --- | --- |
| `sip010-ft-trait.clar` | `sip010-ft-trait.md` |
| `xtrata-v1.1.0.clar` | `xtrata-v1.1.0.md` |
| `xtrata-v1.1.1.clar` | `xtrata-v1.1.1.md` |
| `xtrata-v2.1.0.clar` | `xtrata-v2.1.0.md` |
| `xtrata-v2.1.1.clar` | `xtrata-v2.1.1.md` |
| `xtrata-small-mint-v1.0.clar` | `xtrata-small-mint-v1.0.md` |
| `xtrata-collection-mint-v1.0.clar` | `xtrata-collection-mint-v1.0.md` |
| `xtrata-collection-mint-v1.1.clar` | `xtrata-collection-mint-v1.1.md` |
| `xtrata-collection-mint-v1.2.clar` | `xtrata-collection-mint-v1.2.md` |
| `xtrata-collection-mint-v1.3.clar` | `xtrata-collection-mint-v1.3.md` |
| `xtrata-collection-mint-v1.4.clar` | `xtrata-collection-mint-v1.4.md` |
| `xtrata-preinscribed-collection-sale-v1.0.clar` | `xtrata-preinscribed-collection-sale-v1.0.md` |
| `xtrata-market-v1.1.clar` | `xtrata-market-v1.1.md` |
| `xtrata-market-stx-v1.0.clar` | `xtrata-market-stx-v1.0.md` |
| `xtrata-market-usdc-v1.0.clar` | `xtrata-market-usdc-v1.0.md` |
| `xtrata-market-sbtc-v1.0.clar` | `xtrata-market-sbtc-v1.0.md` |
| `xtrata-commerce.clar` | `xtrata-commerce.md` |
| `xtrata-vault.clar` | `xtrata-vault.md` |
| `xtrata-arcade-scores-v1.0.clar` | `xtrata-arcade-scores-v1.0.md` |
| `xtrata-arcade-scores-v1.1.clar` | `xtrata-arcade-scores-v1.1.md` |
| `xtrata-arcade-scores-v1.2.clar` | `xtrata-arcade-scores-v1.2.md` |
| `xtrata-arcade-scores-v1.3.clar` | `xtrata-arcade-scores-v1.3.md` |

Parent/child focus:
- The main parent/child upgrade problem lives in the core `xtrata` line.
- Today the core line stores one dependency list, but that is not the same thing as ownership-gated parent/child provenance.
- The core TODO notes call out the needed split:
  - `dependency` = composition / recursion / content reference
  - `parent` = provenance link created only when the inscribing wallet controls the parent at seal time

Cross-contract design notes:
- `xtrata-v3-fee-spec.md`
  - proposed next-core fee model for byte-proportional pricing, wallet and caller fee overrides, and quote-based client integration
- `xtrata-collection-mint-v3-upgrade-spec.md`
  - recommended architecture and required changes for the next collection-mint template that targets `xtrata-v3.0.0`
