# Module Strata

This plan treats the repository as a set of module families that should be inscribed with different strategies.

## Strata Table

| Stratum | Purpose | Candidate Repo Sources | Publish Cadence | Standalone? |
| --- | --- | --- | --- | --- |
| Root catalogs | Human and machine entry points | new generated index files | every release | yes |
| Host shell | Frame/launcher that loads plugins | `System/host.html`, `OrdinalModules/host.html` | medium | yes |
| Shared runtime JS | UI builders and patch loader | `System/shared/*.js`, mirrored `OrdinalModules/shared/*.js` | medium | yes |
| DSP engine | Shared audio runtime | `System/shared/bvst_unified_bg.wasm`, `System/shared/processor_unified.js` | low | yes |
| Schema and descriptors | Validation and compatibility | `System/shared/bvst_patch_v1.schema.json`, future descriptors | low | yes |
| Plugin manifest | Routing and metadata | `Plugins/*/*/manifest.json` | high | yes |
| Plugin patch/presets | UI, params, presets | `Plugins/*/*/patch.json` | high | yes |
| Optional shell HTML | Legacy compatibility bridge | `Plugins/*/*/gui.html` | high | usually no |
| Asset packs | Samples, IRs, media | future plugin assets | high | yes |
| Test fixtures and docs | Verification vectors, examples | generated docs or sample configs | medium | optional |

## What Should Be Bundled

Bundle content when all of these are true:

- it is tiny
- it is only consumed by one parent module
- separating it would add coordination overhead without meaningful reuse

Examples:

- a one-off theme JSON used by only one plugin release
- a plugin-local README or demo metadata file
- a legacy HTML wrapper that exists only to point at shared runtime tokens

## What Must Stay Standalone

Make a standalone inscription when any of these are true:

- it is reused by many plugins
- it is large enough that duplication is expensive
- it changes more slowly than its dependents
- it deserves independent verification and versioning

Examples:

- `bvst_unified_bg.wasm`
- `processor_unified.js`
- `patch_runtime.js`
- `plugin_core.js`
- `bvst_patch_v1.schema.json`
- sample libraries shared by several sampler plugins

## Naming Convention

Use names that encode layer, role, and version:

- `bvst.catalog.root.v1`
- `bvst.runtime.patch-runtime.v1.0.0`
- `bvst.runtime.plugin-core.v1.0.0`
- `bvst.engine.unified-wasm.v1.0.0`
- `bvst.schema.patch.v1`
- `bvst.plugin.universalsynth.manifest.v1.2.0`
- `bvst.plugin.universalsynth.patch.v1.2.0`
- `bvst.asset.cosmosampler.factory-pack.v1`

Keep the human-readable name stable even though the real dependency points to immutable token IDs.

## Dependency Rules By Stratum

### Root catalogs

Depend only on the release catalogs they are curating. They should be lightweight indexes, not giant bundles.

### Runtime and engine modules

Depend only on lower-level infrastructure and schemas they actually require. Avoid cycles between runtime libraries.

### Plugin modules

A production plugin should depend on:

- one runtime major
- one engine major
- one schema major
- its own manifest and patch
- optional assets and preset packs

### Asset modules

Assets should not depend on runtime code unless absolutely necessary. Keep them reusable across plugin families.

## Mapping Current Repo Paths To Future On-Chain Modules

- `System/shared/` -> runtime library family
- `System/shared/bvst_unified_bg.wasm` -> engine binary family
- `System/unified_audio_engine/src/lib.rs` -> source of the engine family build
- `Plugins/<Category>/<PluginName>/manifest.json` -> plugin identity layer
- `Plugins/<Category>/<PluginName>/patch.json` -> plugin configuration layer
- `OrdinalModules/` -> compatibility mirror and good candidate for a portable host/package view

## Immediate Planning Outcome

If a file cannot be assigned to one of these strata, it should not be inscribed yet. First classify it, then decide whether it is a reusable module, release metadata, or purely local build scaffolding.
