# Expansion Guide

This guide explains how to add cartridges without breaking recursive integrity.

## Expansion pattern

For each new cartridge:

1. Create new logic/assets files.
2. Mint them as leaf inscriptions.
3. Update manifest with new cartridge entry and IDs.
4. Mint a new manifest leaf.
5. Mint a new parent `cabinet.html` with updated dependency list.

This creates deterministic parent releases (`parent-v2`, `parent-v3`, etc.).

## Create new cartridge modules

Start from templates:

- `modules/cartridge-template.logic.js`
- `modules/cartridge-template.assets.json`

Recommended location for new modules:

- `modules/cartridges/<cartridge-name>.logic.js`
- `modules/cartridges/<cartridge-name>.assets.json`

Rename and implement, for example:

- `signal-run.logic.js`
- `signal-run.assets.json`

Logic module requirements:

- Export `mountCartridge(root, api)`.
- Return optional cleanup object with `destroy()`.
- Keep all network calls optional; prefer in-memory or asset-driven game loops.

## Add entry to manifest

Append a new object in `cartridge-manifest.json`:

```json
{
  "id": "signal-run-v1",
  "title": "Signal Run",
  "description": "Reroute packets through blocked channels.",
  "version": "1.0.0",
  "logicModuleId": 123,
  "assetsModuleId": 124
}
```

You can keep `defaultCartridge` unchanged or point it to the new one.

## Re-mint required modules

Any time `cartridge-manifest.json` changes, mint a new manifest inscription.

Then update `cabinet.html` IDs:

- `manifestModuleId` = new manifest ID
- `declaredDependencyIds` includes every module ID the manifest references

Mint a new recursive parent.

## Dependency budgeting (max 50)

Each cartridge usually adds 2 dependencies (logic + assets).

Rule of thumb:

- base runtime + manifest = 2
- 20 cartridges x 2 = 40
- total = 42

This leaves space for optional shared modules.

If you approach 50 dependencies:

1. Publish `runtime-v2` that can bundle shared helpers.
2. Split into themed parent releases with smaller cartridge sets.

## Compatibility checklist before minting a new parent

1. Every cartridge entry has positive integer `logicModuleId` and `assetsModuleId`.
2. Every referenced module ID already exists on-chain.
3. `declaredDependencyIds` covers runtime, manifest, and all cartridge modules.
4. Parent boots in local test environment or previous viewer run.
5. You are using single-item recursive mint for parent.

## Versioning strategy

Use semantic versioning by module role:

- runtime: `runtime@1.0.0`, `runtime@1.1.0`
- manifest: `manifest@1.0.0`, `manifest@1.1.0`
- cartridge: `orb-heist@1.0.0`, `signal-run@1.0.0`

Keep a simple changelog in your release notes for collectors and indexers.
