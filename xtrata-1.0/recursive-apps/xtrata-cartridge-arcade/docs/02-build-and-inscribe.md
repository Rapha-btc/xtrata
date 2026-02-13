# Build And Inscribe Runbook

This runbook is the source of truth for minting the arcade correctly on mainnet with the Xtrata contract.

## Core rule

For this project, a working on-chain build depends on two things:

1. Mint files in the correct order.
2. Wire the exact minted Xtrata IDs into `cartridge-manifest.json`, `cabinet.html`, and parent dependencies.

No contract/Clarity edits are required in this flow.

## How to use this runbook

- First-time release (`v1`): follow Steps 1 through 6 exactly.
- Update releases (`v2+`): use the same order (changed leaves -> manifest if needed -> parent), and reuse unchanged IDs to reduce cost.

## Prerequisites

1. You can mint single inscriptions in Xtrata Mint.
2. You know the mainnet Xtrata contract address + name you are minting against.
3. You know the sender address you are using for read-only lookups in `cabinet.html`.
4. You have tested locally (`npm run dev` -> `/modules/local-runner.html`) and confirmed cartridges boot.

## Files involved

- `modules/runtime.js`
- `modules/orb-heist.logic.js`
- `modules/orb-heist.assets.json`
- `modules/cartridges/signal-sprint.logic.js`
- `modules/cartridges/signal-sprint.assets.json`
- `modules/cartridges/glyph-link.logic.js`
- `modules/cartridges/glyph-link.assets.json`
- `modules/cartridges/reactor-warden.logic.js`
- `modules/cartridges/reactor-warden.assets.json`
- `modules/cartridge-manifest.json`
- `modules/cabinet.html`

This runbook assumes the full current cartridge roster (4 cartridges). If you publish a smaller set, remove unused cartridges from the manifest and keep dependency lists fully aligned.

## Step 1: Configure mainnet Xtrata fields in `cabinet.html`

Edit `modules/cabinet.html` `CONFIG` block:

- `contractAddress`
- `contractName`
- `senderAddress`
- `networkPriority`

Keep contract + sender + network fields aligned to the release target.
For this runbook, set mainnet explicitly:

- `networkPriority: ['mainnet']`

## Step 2: Mint leaf modules first

Mint each file below using standard single-item minting with no parents:

1. `runtime.js`
2. `orb-heist.logic.js`
3. `orb-heist.assets.json`
4. `cartridges/signal-sprint.logic.js`
5. `cartridges/signal-sprint.assets.json`
6. `cartridges/glyph-link.logic.js`
7. `cartridges/glyph-link.assets.json`
8. `cartridges/reactor-warden.logic.js`
9. `cartridges/reactor-warden.assets.json`

Do not mint `modules/local-runner.html` or folder-level `index.html` as recursive dependencies. Those are local/dev entry points, not on-chain runtime leaves.

Record the minted IDs:

- `RUNTIME_ID = 51`
- `ORB_LOGIC_ID = 48`
- `ORB_ASSETS_ID = 47`
- `SIGNAL_LOGIC_ID = 53`
- `SIGNAL_ASSETS_ID = 52`
- `GLYPH_LOGIC_ID = 46`
- `GLYPH_ASSETS_ID = 45`
- `REACTOR_LOGIC_ID = 50`
- `REACTOR_ASSETS_ID = 49`

## Step 3: Fill manifest with all cartridge IDs

Edit `modules/cartridge-manifest.json`:

- `orb-heist-v1` -> `logicModuleId = 48`, `assetsModuleId = 47`
- `signal-sprint-v1` -> `logicModuleId = 53`, `assetsModuleId = 52`
- `glyph-link-v1` -> `logicModuleId = 46`, `assetsModuleId = 45`
- `reactor-warden-v1` -> `logicModuleId = 50`, `assetsModuleId = 49`

Confirm there are no `0` IDs left in the manifest, then mint `cartridge-manifest.json` as another leaf (no parents):

- `MANIFEST_ID = 54`

## Step 4: Fill cabinet with runtime + manifest IDs

Edit `modules/cabinet.html`:

- `runtimeModuleId = 51`
- `manifestModuleId = 54`
- `declaredDependencyIds` set to:

```js
[
  51,
  54,
  48, 47,
  53, 52,
  46, 45,
  50, 49
]
```

This list must match every module the manifest references.

## Step 5: Mint the parent with recursive dependencies

Mint `modules/cabinet.html` using single-item flow with parents set.

Set parent IDs to the exact same list used in `declaredDependencyIds`:

`51, 54, 48, 47, 53, 52, 46, 45, 50, 49`

This must use the recursive parent seal path in Xtrata mint (single-item flow with parents).

Important:

- Do not use batch mint for this parent.
- If any dependency ID does not exist yet, seal will fail.
- Dependency order is not enforced by contract, but keep one canonical ordered list in both cabinet config and parent mint form.

Record parent ID:

- `CABINET_PARENT_ID = ____`

## Step 6: Verify parent works in viewer

Open `CABINET_PARENT_ID` in Xtrata Viewer and confirm:

1. Loader log shows successful module loads.
2. Runtime UI appears with cartridge selector.
3. All cartridges load and are playable when selected (`Orb Heist`, `Signal Sprint`, `Glyph Link`, `Reactor Warden`).
4. Provenance panel lists runtime, manifest, and each cartridge module ID.
5. Loader log does not show missing dependencies or fallback zero IDs.

## Update release flow (`v2+`) for efficient iteration

Use this after your first successful on-chain release.

### A) Keep and reuse stable IDs

- Reuse any leaf module ID whose file content is unchanged.
- Reuse `MANIFEST_ID` if manifest content is unchanged.
- Always mint a new parent ID when `cabinet.html` content changes (including updated IDs).

### B) Remint decision matrix

| Change in release | Mint changed leaves | Mint new manifest | Mint new parent |
| --- | --- | --- | --- |
| One cartridge logic or assets changed | Yes (only changed file(s)) | Yes | Yes |
| Add new cartridge | Yes (new logic + new assets) | Yes | Yes |
| Remove cartridge | No new leaves required | Yes | Yes |
| Runtime only changed | Yes (`runtime.js`) | No (reuse old `MANIFEST_ID`) | Yes |
| Contract/sender/network config only changed in cabinet | No | No | Yes |
| No file/content changes | No | No | No |

### C) Update sequencing rules

1. Mint only changed/new leaf modules first.
2. If any manifest-referenced ID changed, update and mint `cartridge-manifest.json`.
3. Update `cabinet.html` with `runtimeModuleId`, `manifestModuleId`, and exact `declaredDependencyIds`.
4. Mint new parent with the exact same dependency IDs used in `declaredDependencyIds`.

### D) Dependency list policy

`declaredDependencyIds` should include exactly:

1. `runtime.js` ID
2. `cartridge-manifest.json` ID
3. all cartridge logic IDs referenced by manifest
4. all cartridge assets IDs referenced by manifest

Do not carry stale IDs from old releases. Keep each parent deterministic and minimal.

## MIME guidance

Use these MIME types when minting:

- `cabinet.html`: `text/html`
- `runtime.js`: `text/javascript`
- `cartridge-manifest.json`: `application/json`
- `*.logic.js` files: `text/javascript`
- `*.assets.json` files: `application/json`

## Common mint mistakes to avoid

1. Minting parent before all leaves exist.
2. Forgetting to replace `0` IDs in manifest/cabinet.
3. Using wrong contract or sender in `cabinet.html`.
4. Leaving `networkPriority` as anything other than `['mainnet']` for this flow.
5. Using non-recursive or batch parent flow instead of single-item recursive parent mint.
6. Dependency list not matching actual module IDs referenced by the manifest.

## Recommended release naming

Use version tags in notes/metadata:

- `xtrata-cartridge-arcade-parent-v1`
- `orb-heist-v1-logic`
- `orb-heist-v1-assets`
- `signal-sprint-v1-logic`
- `signal-sprint-v1-assets`
- `glyph-link-v1-logic`
- `glyph-link-v1-assets`
- `reactor-warden-v1-logic`
- `reactor-warden-v1-assets`
- `arcade-manifest-v1`

This makes future upgrades and audits easier.
