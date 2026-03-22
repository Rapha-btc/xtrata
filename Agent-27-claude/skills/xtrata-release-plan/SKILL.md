---
name: xtrata-release-plan
description: Build dependency-aware Xtrata release quotes and execution plans from a planning brief plus accessible file links or local paths. Use when Codex must analyze a multi-artifact release, compute live Xtrata protocol fees and current network-fee estimates from real file bytes, determine helper vs staged route per artifact, order inscriptions so dependencies resolve before dependents, plan runtime token-map updates, and describe exactly when rendered copies must be minted instead of unresolved templates.
---

# Xtrata Release Plan

## Overview

Use this skill before any multi-artifact Xtrata release that has dependency edges,
rendered catalogs, or runtime token rewrites. Turn the request into a dry-run
quote and a concrete execution plan first; hand off actual minting to the
existing inscription skills only after the plan is complete and approved.

## Intake

Require enough input to read the real bytes of every artifact. A planning doc by
itself is not enough for an accurate quote.

Gather:

- one planning brief that defines release rules, batch order, and rendering rules
- accessible file links or local paths for every artifact to be analyzed
- artifact metadata when not derivable from the file itself:
  `name`, `mimeType`, optional `route`, optional `depends_on`, optional render rule
- target network and wallet context
- optional existing runtime state:
  `token-map.runtime.json`, prior inscription log, active upload sessions

Prefer the manifest shape in
[assets/release-request.example.json](assets/release-request.example.json)
when the user is setting up a repeatable service.

If a linked file is missing, private, or unresolved, stop and mark the quote as
incomplete. Do not guess file sizes or hashes.

## Workflow

1. Read the planning brief and extract release rules.
2. Read the real bytes of every linked artifact.
3. Detect size, chunk count, MIME type, and incremental Xtrata hash for each file.
4. Build a dependency graph from `depends_on` and any render-time token rewrite rules.
5. Query live chain state before quoting:
   - `get-fee-unit`
   - `get-id-by-hash`
   - `get-upload-state` when resume behavior matters
   - `get-last-token-id` only for reporting, never as a dependency source
6. Decide the route per artifact:
   - respect an explicit route from the brief when given
   - otherwise choose helper only for fresh `1..30` chunk items
   - choose staged for resumable uploads, large files, or helper-disabled cases
7. Topologically sort the release so every dependency resolves before its dependents.
8. Mark any artifact that must be rendered after parent token IDs are known.
9. Produce a dry-run quote and execution plan.
10. Only after approval, hand off execution to `skill-inscribe` or another
    purpose-built runner.

## Quote Rules

Separate exact protocol fees from network-fee estimates.

- Protocol fee:
  - query `get-fee-unit` live
  - begin fee = `fee-unit`
  - seal fee = `fee-unit * (1 + ceil(totalChunks / 50))`
  - helper route uses the same protocol economics as begin + seal
- Network fee:
  - base it on actual artifact bytes and current fee-rate inputs
  - if unsigned transaction building is unavailable, present a low/base/high estimate
  - never present a stale hardcoded total as an "accurate quote"

For each artifact, report:

- `name`
- `local_source` or linked source
- `sha256` / expected Xtrata hash
- size in bytes
- chunk count
- route
- duplicate status from `get-id-by-hash`
- dependency names
- dependency token IDs if already known
- exact protocol fee
- estimated network fee
- total estimated spend
- whether a rendered copy is required before minting

## Dependency and Rendering Rules

Never mint a dependent artifact from an unresolved template.

Apply these rules:

1. Resolve every `depends_on` entry by artifact name.
2. Fail fast on missing dependencies or cycles.
3. If a catalog or manifest contains placeholder token IDs, render a resolved copy
   after the parent token IDs are known.
4. Mint the rendered copy, not the unresolved source.
5. Record exactly which runtime state file supplies the resolved token IDs.
6. Update runtime token state immediately after each successful mint.

When a planning brief defines render mutations, carry them into the plan
verbatim. For the catalog pattern in `TASKS/INSCRIPTION_AUTOMATION.md`, that means:

- replace embedded `token_id: null` values from runtime token state
- preserve string catalog names and add companion token metadata fields
- add `dependency_token_ids`
- add `resolved_at`
- add `resolved_from`

## Runtime State

Plan around three local state surfaces:

- `token-map.runtime.json`
- `inscription-log.json`
- a `rendered/` directory for dependency-resolved copies

If the release already has runtime state:

- skip reminting when `name` and `sha256` already match a known token
- stop if the name matches but the hash changed
- resume staged uploads when `get-upload-state` reports an active session
- never switch an active staged upload to the helper route mid-attempt

## Required Output

Return a planning response with these sections:

1. `Intake Gaps`
   - missing files
   - ambiguous dependencies
   - assumptions the quote still depends on
2. `Fee Quote`
   - per-artifact line items
   - protocol subtotal
   - network estimate subtotal
   - total estimated range
3. `Execution Order`
   - exact topological order
   - which artifacts are duplicates to reuse
   - which artifacts must be rendered after earlier mints
4. `State Mutations`
   - what gets written to runtime token map after each mint
   - what gets appended to inscription log
   - which rendered files must exist before dependents are minted
5. `Write Calls`
   - helper: `mint-small-single-tx` or `mint-small-single-tx-recursive`
   - staged: `begin-or-get`, `add-chunk-batch`, `seal-inscription` or `seal-recursive`
6. `Stop Conditions`
   - unresolved dependency
   - hash drift
   - byte reconstruction mismatch
   - rendered file still containing unresolved token placeholders

## Service Positioning

Offer this as a two-step service:

1. Planning tier:
   - ingest the brief plus file links
   - compute live quote and ordered plan
   - return blockers before any wallet action
2. Execution tier:
   - reuse the approved plan
   - update runtime token IDs as mints succeed
   - render and mint dependents only after parents are confirmed

This separation matters. The planning tier is safe, auditable, and easy to sell
as "quote plus release choreography." The execution tier is where wallet access
and post-confirmation verification begin.

## References

Read [references/service-contract.md](references/service-contract.md) when you need:

- a suggested customer-facing intake contract
- the recommended service outputs
- guidance on when a quote is exact versus estimated

Use [scripts/xtrata-release-preflight.cjs](scripts/xtrata-release-preflight.cjs) when you want a deterministic dry-run over a real bundle directory. It verifies hashes and batch order, inspects catalog templates, fetches live `get-fee-unit` / `get-last-token-id`, optionally runs dedupe checks, and emits a machine-readable quote and execution plan.
