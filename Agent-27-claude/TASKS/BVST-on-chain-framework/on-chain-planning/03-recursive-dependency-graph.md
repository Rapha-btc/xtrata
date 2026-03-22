# Recursive Dependency Graph

## Core Idea

Every inscribed BVST artifact should sit inside a graph with three properties:

1. exact reproducibility
2. explicit compatibility
3. cheap reuse by future releases

That means dependencies need structure, not just a flat array of token IDs.

## Graph Layers

### Layer 0: Protocol references

These are not BVST modules, but they anchor the release system:

- Xtrata core contract
- Xtrata helper contract
- optional off-chain indexers used only for discovery, never for correctness

### Layer 1: Foundation catalogs

One or more root catalog tokens define the known majors for:

- runtime
- engine
- schemas
- host shell

These are the first dependency a client resolves.

### Layer 2: Major catalogs

Each major catalog points to immutable module tokens for a major line, for example:

- runtime v1 major catalog
- engine v1 major catalog
- schema v1 major catalog

This keeps old plugin families stable even when v2 exists.

### Layer 3: Release catalogs

Each release catalog assembles a compatible set of exact token IDs, such as:

- `BVST Foundation Release 2026-04`
- `UniversalSynth On-Chain Release 1.0.0`
- `Sampler Factory Pack Release 1.0.0`

### Layer 4: Leaf modules

Leaf modules are the immutable code, schema, patch, manifest, and asset tokens that actually hold bytes.

## Resolution Model

Use a two-step resolution model:

1. Human chooses a catalog or plugin release by name.
2. Client resolves that catalog to exact token IDs and pins those IDs for execution.

Do not run production audio sessions against a moving "latest" alias. Catalogs may evolve, but a session should always pin the exact leaf set it resolved.

## Release Graph Pattern

```text
root catalog
|- foundation runtime v1 catalog
|- foundation engine v1 catalog
|- foundation schema v1 catalog
`- plugin family catalog
   `- UniversalSynth release 1.0.0 catalog
      |- manifest token
      |- patch token
      |- preset token
      |- runtime major catalog
      |- engine major catalog
      `- schema major catalog
```

This gives both human discoverability and machine determinism.

## Upgrade Strategy

### Patch-only update

If only presets or control layout changed:

- inscribe new patch token
- inscribe new plugin release catalog
- keep runtime/engine dependencies unchanged

### Plugin family update

If routing rules or plugin identity changed:

- inscribe new manifest token
- inscribe new patch token if needed
- publish a new family release catalog

### Runtime or engine update

If shared runtime or unified WASM changed:

- inscribe new leaf module(s)
- publish a new runtime or engine major/minor catalog
- only migrate plugin families after compatibility testing

## Compatibility Rules

Every release catalog should declare:

- `runtime_major`
- `engine_major`
- `schema_major`
- `plugin_api_level`
- `content_hashes`
- `dependency_token_ids`

If a module cannot declare its compatibility, it is not release-ready.

## Dependency Hygiene Rules

1. No cycles between executable runtime modules.
2. Plugin catalogs may depend on major catalogs, but leaf modules should depend only on leaf prerequisites when possible.
3. Never hide required assets in out-of-band docs; every required asset must be in the dependency plan.
4. Never treat indexer metadata as canonical. The dependency array and the published catalogs are canonical.
5. If a release is found to be broken, supersede it with a new catalog and mark the old one as deprecated in the next catalog. Do not overwrite history.

## Why This Matters For Future BVST Generations

The first generation uses recursive modules to reduce duplication. Later generations can use the same graph model for:

- graph-defined DSP building blocks
- sample library inheritance
- shared sequencer or sampler UI packs
- collection-level releases of instruments and effects
- self-hosted "build from chain" environments
