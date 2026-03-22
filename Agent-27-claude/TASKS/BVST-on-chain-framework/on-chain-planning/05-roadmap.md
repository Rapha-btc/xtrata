# Roadmap

This roadmap now reflects the actual state of the frozen first-wave BVST release bundle.

## Wave 0: Inventory And Freeze

Status: complete

Delivered:

- staged `workspace/`, `catalogs/`, `batches/`, `configs/`, and `verification/`
- deterministic module naming and dependency records
- machine-readable batch plans
- live preflight quote for the copied bundle

Exit status:

- every planned artifact has a stratum and dependency record
- the first-wave scope is fixed at `53` artifacts
- the copied bundle is ready for operator execution

## Wave 1: Foundation Release

Status: ready to inscribe

Scope:

- `17` foundation leaves
- `4` foundation catalogs

Readiness:

- all foundation artifacts verify locally
- all foundation artifacts remain on `helper`
- runtime-state tooling now exists for live token capture and catalog rendering

Remaining gate:

- live mint execution and final token recording

## Wave 2: First Recursive Plugin Families

Status: ready to inscribe

Scope:

- UniversalSynth family batch
- standalone synth family batch
- total across both batches: `21` leaves and `9` catalogs

Readiness:

- plugin leaves are staged and verified
- dependent catalogs render cleanly from runtime token state
- rendered catalogs stay on `helper`

Remaining gate:

- live mint execution with per-artifact state updates

## Wave 3: Release Root And Post-Release Catalog Hygiene

Status: blocked on Waves 1 and 2 completing on-chain

Scope:

- first-wave release catalog
- root catalog
- final token-map commit back into repo records

Exit criteria:

- root catalog is minted from rendered bytes
- token IDs and txids are committed locally
- a future operator can replay the release state without reconstructing it manually

## Wave 4: Family Expansion

Status: deferred until the first-wave release proves stable on-chain

Priority after first-wave completion:

- effects and modulation families
- explicit asset-pack conventions
- category-level catalogs
- compatibility matrix across published families

## Wave 5: Chain-Native Asset Libraries And Future BVST Generations

Status: long-horizon

This phase only makes sense after the first-wave release has demonstrated:

1. exact artifact reproducibility
2. safe operator workflow
3. clean catalog-based dependency resolution
4. acceptable marginal cost per new plugin family

## Immediate Next Step

The planning work is finished for this release. The next step is operational:

1. verify
2. refresh quote
3. initialize runtime state
4. mint leaves
5. record each result immediately
6. mint rendered catalogs as they become ready
