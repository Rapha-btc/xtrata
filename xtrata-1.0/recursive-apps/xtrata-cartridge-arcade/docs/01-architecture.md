# Architecture

## Design goals

1. Keep the parent inscription small and stable.
2. Keep gameplay logic swappable without replacing the runtime.
3. Preserve deterministic on-chain dependencies for every playable build.
4. Keep expansion simple: add cartridge modules, update manifest, mint a new parent.

## Module responsibilities

### `cabinet.html` (parent)

- Bootstraps recursive loading.
- Resolves `runtime.js` and `cartridge-manifest.json` by inscription ID.
- Passes module resolver + provenance metadata into runtime.
- Displays loader diagnostics.

### `runtime.js` (shared engine)

- Renders arcade shell and cartridge selector.
- Loads cartridge logic/assets based on manifest entries.
- Imports cartridge logic dynamically from on-chain text modules.
- Provides cartridge API (`setStatus`, `setStats`, `log`, persistence helpers).
- Exposes module provenance panel so users can see loaded IDs.

### `cartridge-manifest.json` (registry)

- Declares available cartridges and default cartridge.
- Stores `logicModuleId` and `assetsModuleId` per cartridge.
- Allows runtime to discover and switch cartridges without hardcoding.

### `orb-heist.logic.js` (cartridge logic)

- Exports `mountCartridge(root, api)`.
- Reads level/data payload from assets.
- Runs gameplay loop, input handling, win/loss state.
- Sends stats/status updates back to runtime.

### `orb-heist.assets.json` (cartridge data)

- Holds mission text, palette hints, and level maps.
- Keeps game data separate so balancing/content updates do not require logic rewrites.

## Cartridge interface contract

Each cartridge logic module must export:

```js
export async function mountCartridge(root, api) {
  // render + run game
  // return optional cleanup object
  return { destroy() {} };
}
```

Runtime passes this `api` object:

- `runtimeVersion`: runtime semantic version.
- `manifest`: parsed manifest object.
- `cartridge`: selected cartridge metadata.
- `assets`: parsed JSON from `assetsModuleId`.
- `setStatus(message, kind?)`: update runtime status text.
- `setStats(record)`: render runtime stat cards.
- `log(message)`: write to loader/runtime log stream.
- `saveProgress(payload)`: persist cartridge-local progress.
- `loadProgress()`: read cartridge-local progress.

## Dependency strategy

The recursive parent should include every leaf module it may load:

1. `runtime.js` module ID
2. `cartridge-manifest.json` module ID
3. cartridge `logicModuleId`
4. cartridge `assetsModuleId`

If you add cartridges later, include those new module IDs in the next parent version's dependency list.

## Expandability model

Current model is versioned parent releases:

- `parent-v1`: runtime + manifest-v1 + cartridge set A
- `parent-v2`: runtime (same or new) + manifest-v2 + cartridge set A+B

This keeps each published parent deterministic and reproducible while allowing rapid cartridge expansion.

## Limits to track

- Max dependencies per parent: 50.
- Max chunks per inscription: 2048.
- Max chunk size: 16,384 bytes.
- Batch recursive minting is not supported in `seal-inscription-batch`.

Use parent versioning before you hit 50 dependencies.
