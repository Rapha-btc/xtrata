# On-Chain Planning

This folder is now the finalized release plan for the frozen BVST first-wave bundle in [`../README.md`](../README.md). It is no longer only conceptual architecture work. It describes the exact staged release that is ready for Xtrata execution.

## Finalized Bundle State

Verified and quoted on `2026-03-21`:

- `53` artifacts total
- `38` static leaves
- `15` dependent catalogs that must be rendered from live token-map state
- `362,165` total staged bytes
- `0` verification mismatches
- `0` duplicate on-chain artifacts found during preflight
- live fee-unit at quote time: `0.001 STX`
- exact Xtrata protocol-fee subtotal: `0.159 STX`

All current artifacts remain eligible for the `helper` route after render. The only runtime-sensitive part of the release is catalog rendering and token-map capture.

## What This Planning Folder Now Covers

- the module boundaries and graph shape that define the frozen release
- the exact inscription workflow for this copied bundle
- the operator controls needed for leaf-first publication
- the runtime-state files and rendered catalog outputs needed during live minting

## Working Assumptions

- the copied bundle in `TASKS/BVST-on-chain-framework/` is the source of truth for live execution
- `build-bundle.mjs` only regenerates the bundle if `BVST_SOURCE_ROOT` points at the original BVST source repo
- `verify-bundle.mjs`, `preflight-quote.mjs`, `init-inscription-state.mjs`, `inscription-status.mjs`, and `apply-inscription-result.mjs` are the operator entry points for this workspace

## Document Map

- `01-framework-vision.md`: long-horizon architecture target behind the release
- `02-module-strata.md`: why the current files were split the way they were
- `03-recursive-dependency-graph.md`: graph structure and compatibility model
- `04-xtrata-inscription-workflow.md`: exact execution flow for this frozen bundle
- `05-roadmap.md`: current readiness status and next release gates
- `06-operations-and-governance.md`: operator controls, stop conditions, and release discipline
- `07-manifest-templates.md`: runtime-state and log shapes used during execution
- `08-sampler-wave.md`: experimental sampler-wave track kept outside the frozen first-wave release

## Recommended Starting Point

1. Verify the frozen bundle.
2. Refresh the live preflight quote.
3. Initialize runtime inscription state.
4. Mint leaves in batch order.
5. Record each mint immediately so dependent catalogs can be rendered safely.
