# Product Options and Design Decisions

This document compares implementation options and recommends a practical path.

## Decision 1: Artist access control model

Option A: Environment allowlist only

- Mechanism: env-based list checked in UI.
- Pros: fastest to ship.
- Cons: weak operational control and poor auditability.

Option B (Recommended for MVP): Environment allowlist + on-chain owner checks

- Mechanism:
  - gate page entry with platform allowlist,
  - gate collection actions by `get-owner` for each collection contract.
- Pros: good safety with low complexity.
- Cons: allowlist management still off-chain.

Option C: Dedicated on-chain artist registry contract

- Pros: strongest provenance and auditability.
- Cons: new contract surface and migration overhead.

## Decision 2: Collection deploy UX

Option A: Reuse existing freeform Deploy module

- Pros: no extra engineering.
- Cons: high error risk for artists.

Option B (Recommended): Guided deploy wizard

- Inputs:
  - contract name,
  - network confirmation,
  - optional advanced source view.
- Pros: lower error rate, clearer onboarding.
- Cons: template-source management required.

## Decision 3: Folder upload and staging backend

Option A: Local-only browser files

- Pros: no backend.
- Cons: cannot serve buyer mints. Fails requirement.

Option B: Static repository-hosted manifest

- Pros: simple infra.
- Cons: manual ops and weak authoring UX.

Option C (Recommended): Functions + object storage + manifest API

- Store full files/chunks + normalized manifest off-chain.
- Pros: supports artist and buyer workflows at scale.
- Cons: requires backend endpoints and access control.

Option D: Fully on-chain manifest

- Pros: trust-minimized.
- Cons: expensive and large scope increase.

## Decision 4: Buyer mint model for staged assets

Option A: Open mint from staged catalog (no per-asset cap)

- Pros: simple.
- Cons: weak control for curated drops.

Option B (Recommended): Per-asset edition settings in manifest

- Each asset defines edition cap + sold count (off-chain enforcement).
- Pros: supports one-of-one and editioned releases.
- Cons: still off-chain integrity model in MVP.

Option C: On-chain claim map in future collection-mint version

- Pros: strongest asset-level enforcement.
- Cons: needs new contract and migration strategy.

## Decision 5: Collection naming and branding

Option A: Contract name only

- Pros: no metadata service.
- Cons: poor user-facing identity.

Option B (Recommended): Contract identity + off-chain profile

- Store display name, subtitle, description, banner, logo, links.
- Pros: good UX for artists and buyers.
- Cons: metadata service needed.

## Recommended MVP bundle

1. Access control: Option B.
2. Deploy UX: Option B.
3. Asset staging: Option C.
4. Mint model: Option B.
5. Branding model: Option B.

## Post-MVP hardening

1. Signed manifest snapshots for stronger publish integrity.
2. Optional on-chain registry/claim primitives.
3. Ops dashboard for failed/reserved sessions and payout analytics.
