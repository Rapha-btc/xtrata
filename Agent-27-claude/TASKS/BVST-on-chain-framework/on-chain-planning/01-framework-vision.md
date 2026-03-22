# Framework Vision

## Starting Point

BVST V8 already separates the stack into reusable layers:

- Rust DSP primitives in `System/bvst_lib/`
- a unified engine router in `System/unified_audio_engine/src/lib.rs`
- a shared browser runtime in `System/shared/`
- patch-defined plugins in `Plugins/`

That is the right shape for on-chain publication. The missing piece is a formal recursive module model so a future BVST is assembled from referenced on-chain parts rather than re-inscribed as a custom full application every time.

## Target State

The target framework is a dependency graph of immutable on-chain modules:

1. Foundation modules
   - host shell
   - loader/runtime libraries
   - schema definitions
   - unified WASM and processor
2. Plugin-definition modules
   - `manifest.json`
   - `patch.json`
   - preset banks
   - optional UI theme layers
3. Asset modules
   - samples
   - impulse responses
   - waveform images
   - documentation or demo state
4. Catalog modules
   - version indexes
   - compatibility maps
   - named collections

The result should let a new plugin inscription be mostly a small patch, manifest, and optional asset set that depends on already-inscribed engine/runtime tokens.

## Canonical Graph Shape

```text
BVST Root Catalog
|- Runtime Major Catalog
|  |- patch_runtime.js
|  |- plugin_core.js
|  |- controls.js / sampler.js / visualizer.js
|  |- bvst.css / ui_styles.js
|- Engine Major Catalog
|  |- wasm_loader_unified.js
|  |- processor_unified.js
|  |- bvst_unified_bg.wasm
|- Schema Catalog
|  |- bvst_patch_v1.schema.json
|  |- future manifest / descriptor schemas
|- Plugin Release Catalog
   |- plugin manifest token
   |- plugin patch token
   |- preset token(s)
   |- asset token(s)
```

## Design Rules

### 1. Keep shared code shared

Never re-inscribe a plugin-local copy of the unified WASM or shared worklet. The current repo already treats those as global infrastructure; the on-chain framework should preserve that.

### 2. Make plugin inscriptions small

For most future releases, a new BVST should only need:

- a plugin manifest token
- a patch/preset token
- optional asset tokens
- a release catalog token

### 3. Separate stable and fast-moving layers

These layers should evolve at different cadences:

- low churn: WASM, processor, loader, schemas
- medium churn: host shell, controls, sampler, sequencer UI
- high churn: patches, presets, theme packs, assets

### 4. Treat recursion as product infrastructure

Recursive dependencies are not only for provenance. They are the mechanism that keeps future costs down, preserves compatibility, and makes chain-native composition possible.

### 5. Plan for multiple generations

Generation 1 can publish current JS/WASM/runtime artifacts. Generation 2 can publish smaller patch-only instruments. Generation 3 can move toward graph-defined DSP modules and chain-native assembly.

## What Success Looks Like

The framework is working when all of the following are true:

- a new plugin can be described by a small dependency graph rather than a bespoke bundle
- exact token IDs can reconstruct a working runtime without off-chain guessing
- catalogs can answer "which engine/runtime/schema major does this plugin require?"
- old plugins continue to resolve after new engine/runtime versions are published
- the repo can build a deterministic inscription batch plan before any STX is spent
