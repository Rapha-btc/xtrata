# Scope and Contract Model

## Contract Truth (v1.1.1)

Parent-child is represented on-chain as:

- `child token id -> list of parent token ids`.
- Storage map: `InscriptionDependencies`.

References:

- `contracts/live/xtrata-v1.1.1.clar:145` defines `InscriptionDependencies uint (list 50 uint)`.
- `contracts/live/xtrata-v1.1.1.clar:789` defines `seal-recursive(expected-hash, token-uri-string, dependencies)`.
- `contracts/live/xtrata-v1.1.1.clar:792` validates dependency existence.
- `contracts/live/xtrata-v1.1.1.clar:794` writes dependencies for the new token id.
- `contracts/live/xtrata-v1.1.1.clar:873` defines `get-dependencies(id)`.
- `contracts/live/xtrata-v1.1.1.clar:60` defines `ERR-DEPENDENCY-MISSING` (`u111`).

## Important Semantics

1. Maximum dependencies per child is 50.
2. Dependencies must already exist when sealing.
3. The contract does not enforce dependency de-duplication or sort order.
4. The contract does not maintain a reverse index (`parent -> children`).

## Current App Status

1. Mint already calls `seal-recursive` when dependencies exist.
2. Dependencies are currently sourced from single `delegateTargetId` only.
3. Viewer already reads and displays dependencies for selected token.
4. Collection mint uses `seal-inscription-batch`, not recursive sealing.

References:

- `src/screens/MintScreen.tsx:1156` current dependency source.
- `src/screens/MintScreen.tsx:1438` branch to `seal-recursive`.
- `src/screens/MintScreen.tsx:766` SIP-016 metadata dependency inclusion.
- `src/screens/ViewerScreen.tsx:292` reads dependencies.
- `src/screens/CollectionMintScreen.tsx:519` batch seal flow.

## Implementation Scope

In scope:

1. Multi-parent selection in Mint UI.
2. Canonical dependency processing and persistence for resume.
3. On-chain child linking via `seal-recursive` with multiple parent ids.
4. Viewer relationship UX for both directions:
   - Parents of child (authoritative on-chain call).
   - Children of parent (derived scan/index in client).
5. Tests for new dependency logic, relationship resolution, and contract behavior.

Out of scope:

1. Contract changes to add reverse index.
2. Automatic background full-chain scans.
3. Changing mint step order (`init -> upload -> seal`).

## Constraints (Project Rules)

1. Preserve layout stability and square grid/preview behavior.
2. Avoid unnecessary network calls; prefer cache and explicit user-triggered scans.
3. Keep wallet session/network guard behavior unchanged.
4. Keep existing fee defaults and mint/deploy flow constraints unchanged.
