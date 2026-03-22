# Sampler Wave

This document describes the experimental sampler track that now lives beside, but not inside, the frozen first-wave BVST release.

## Decision

- keep sampler work in this repo
- keep sampler releases out of the frozen `53`-artifact first wave until their own recursive source-manifest flow is ready
- use `SamplerLab` as the reference shell for runtime policy, source loading, and engine-ingest smoke checks

## Why This Separation Exists

- the frozen first-wave selection explicitly defers sampler-heavy instruments
- the shared runtime now contains hardened sampler support, but the publication economics for recursive sample leaves still need their own plan
- sampler releases will need their own family catalog, release catalog, and rendered source catalogs because sample token IDs are runtime-sensitive in a different way from synth-only patches

## Current Experimental Assets

- `workspace/Plugins/Instruments/SamplerLab/`: experimental sampler-wave shell
- `configs/sampler-wave-selection.json`: dedicated experimental selection and readiness gates
- `sampler-wave/proposed-release-plan.json`: proposed batch/catalog shape for future sampler releases
- `sampler-wave/README.md`: operator entry point for the experimental sampler track
- `sampler-wave/schemas/bvst_sample_source_v1.schema.json`: recursive sample-source manifest schema
- `sampler-wave/manifests/sources/`: actual source-manifest templates for the reference SamplerLab sources
- `sampler-wave/catalogs/`: source, plugin-release, family, and release catalogs
- `scripts/sampler-wave-smoke.mjs`: dedicated smoke runner for the experimental sampler shell
- `scripts/validate-sampler-wave.mjs`: non-browser structural validator plus synthetic render test
- `scripts/render-sampler-wave-catalogs.mjs`: renders source manifests and catalogs from live token-map state

## Readiness Gates Before Freeze

1. Base sampler profile must remain `declared-only`.
2. Standalone profile may override to `standalone-dev` for authoring and smoke automation only.
3. Browser smoke must prove all three states: `BVST_READY`, `bvstSamplerLoaded`, and `bvstSamplerEngineLoaded`.
4. Recursive sample leaves and their source manifests need a live fee quote before they join the inscription queue.
5. Sample-source catalogs must be rendered from live token-map state, not precomputed statically.

## Release Shape

Future sampler releases should introduce:

- a sampler family catalog
- a sampler release catalog
- sampler plugin release catalogs
- recursive sample leaves
- per-sample source manifests
- rendered source catalogs that bind the sampler patch to the live sample token IDs

That is a second release wave, not a last-minute extension of the current one.
