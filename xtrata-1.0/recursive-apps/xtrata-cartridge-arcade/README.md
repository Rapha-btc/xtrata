# Xtrata Cartridge Arcade

A fully on-chain recursive game platform for Xtrata.

This folder includes everything needed to:
1. Build the base arcade parent inscription.
2. Inscribe all leaf modules in the correct order.
3. Seal the parent as a recursive inscription.
4. Expand the arcade with additional cartridges over time.

## Why this project exists

Most on-chain game demos prove one game can run on-chain.
This project proves a stronger claim: an on-chain arcade can load multiple games as replaceable cartridges, with dependency provenance anchored on-chain.

## Module graph

```
Parent (recursive)
└── cabinet.html (parent loader)
    ├── runtime.js
    ├── cartridge-manifest.json
    ├── orb-heist.logic.js
    └── orb-heist.assets.json
```

`cabinet.html` references module IDs in config and boots the runtime.
The runtime loads cartridge modules declared in `cartridge-manifest.json`.

## Folder layout

- `modules/cabinet.html`: Parent inscription loader (recursive parent).
- `modules/runtime.js`: Shared arcade runtime that mounts cartridges.
- `modules/cartridge-manifest.json`: Cartridge registry + module IDs.
- `modules/orb-heist.logic.js`: Playable game logic cartridge.
- `modules/orb-heist.assets.json`: Level/data module for Orb Heist.
- `modules/cartridges/`: Additional standalone cartridges (logic + assets).
  - `signal-sprint.*`: Real-time lane runner.
  - `glyph-link.*`: Memory/pattern puzzle.
  - `reactor-warden.*`: Turn-based systems strategy.
- `modules/cartridge-template.logic.js`: Starter template for new cartridges.
- `modules/cartridge-template.assets.json`: Starter template data file.
- `docs/01-architecture.md`: Module interfaces and runtime contracts.
- `docs/02-build-and-inscribe.md`: Step-by-step inscription instructions.
- `docs/03-expansion-guide.md`: How to add new cartridges safely.
- `docs/04-verification-and-troubleshooting.md`: Post-inscription checks and fixes.

## Quick start

Standalone local test (no inscription required yet):

1. Run `npm install` in this folder.
2. Run `npm run dev` in this folder.
3. Open `/modules/local-runner.html`.
4. Edit files in `modules/` and refresh.

Run from repo root (monorepo-style):

1. Run `npm --prefix recursive-apps/xtrata-cartridge-arcade install`.
2. Run `npm --prefix recursive-apps/xtrata-cartridge-arcade run dev`.

Standalone identity details:

- npm package name: `@xtrata/cartridge-arcade`
- Local app landing page: `/`
- Local runner path: `/modules/local-runner.html`
- Recursive parent shell path: `/modules/cabinet.html`

If you prefer to reuse the root app dependencies and skip local installs:

1. Run `npm run dev:shared` in this folder.
2. Open `/modules/local-runner.html`.

On-chain recursive flow:

1. Read `docs/02-build-and-inscribe.md` and fill your contract + module IDs.
2. Inscribe leaf modules first (runtime, logic, assets, then manifest).
3. Update `modules/cabinet.html` with runtime + manifest IDs.
4. Seal `modules/cabinet.html` with `seal-recursive` and dependency IDs.
5. Open the parent inscription in Xtrata Viewer to verify module resolution.

## Important protocol constraints

- Dependencies must exist before sealing the parent.
- Max dependency list length is 50 IDs.
- `seal-inscription-batch` does not support dependencies.
- Recursive parent must be minted with the single-item flow using `seal-recursive`.

These constraints are documented in the root doc `../../docs/recursive-inscriptions.md`.
