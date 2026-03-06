# SDK Compatibility Matrix

Purpose: provide a single compatibility reference for protocol versions, template contracts, and SDK support level.

Status legend:
- `supported`: validated by SDK tests and active docs.
- `baseline`: supported path exists; broader integration coverage still expanding.
- `planned`: targeted but not yet validated through SDK gates.
- `archived`: legacy compatibility only; no new SDK features/tests are added.

## Core protocol contracts

| Contract family | Version / target | SDK support | Notes |
| --- | --- | --- | --- |
| Xtrata core | `xtrata-v1.1.1` | baseline | Capability fallback default in SDK compatibility resolver. |
| Xtrata core | `xtrata-v2.1.0` | supported | Default contract target across docs/examples and capability resolver. |

## Collection and sale templates

| Contract family | Version / target | SDK support | Notes |
| --- | --- | --- | --- |
| Collection mint | `xtrata-collection-mint-v1.0` | archived | Legacy only. New SDK development does not target this version. |
| Collection mint | `xtrata-collection-mint-v1.1` | archived | Legacy only. New SDK development does not target this version. |
| Collection mint | `xtrata-collection-mint-v1.4` | supported | **Only active collection-mint SDK target moving forward.** |
| Preinscribed sale | `xtrata-preinscribed-collection-sale-v1.0` | baseline | Market/sale support available through market + workflow helpers. |

## SDK module-level support

| SDK module | Stability | Compatibility notes |
| --- | --- | --- |
| `simple` | baseline | Primary read-only entrypoint; tested in package export and example smoke flows. |
| `client` | baseline | Typed low-level read/call builders for custom integrations. |
| `mint` | baseline | Chunking/hash/fee utilities for core and collection workflows. |
| `collections` | baseline | Collection snapshot helpers and lifecycle convenience logic. |
| `market` | baseline | Listing and market helper support with workflow planners. |
| `safe` | baseline | Deterministic spend caps and guided flow primitives. |
| `workflows` | supported | Covered by workflow tests and pack smoke subpath import checks. |
| `deploy` | baseline | Template naming/injection support; deployment orchestration still evolving. |
| `@xtrata/reconstruction` | supported | Deterministic chunk assembly/hash verification and dependency traversal. |

## Error compatibility contract

The SDK normalizes the following known core error codes:

`u100`, `u101`, `u102`, `u103`, `u104`, `u105`, `u106`, `u107`, `u109`, `u110`, `u111`, `u112`, `u113`, `u114`.

Validation source:
- `packages/xtrata-sdk/src/__tests__/errors.test.ts`

## Collection-mint policy (active)

- SDK roadmap scope is now v1.4-first for collection mint support.
- `v1.0` and `v1.1` are archived for SDK development efficiency.
- No new SDK features/tests should be added specifically for `v1.0` or `v1.1` unless policy is explicitly changed.

## Validation gates for this matrix

- Update this matrix whenever:
  - new protocol or template contract versions are added,
  - capability inference behavior changes,
  - error code mapping changes.
- Required gate commands after matrix-impacting changes:
  1. `npm run sdk:typecheck`
  2. `npm run sdk:test`
  3. `npm run sdk:pack:smoke`
  4. `npm run sdk:examples:smoke`
