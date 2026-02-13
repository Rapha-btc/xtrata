# ID Worksheet

Use this worksheet during minting to avoid mismatched dependencies.

## Release name

- Release mode: first-time / update
- Parent release tag: ______________________
- Target contract: _________________________
- Network: mainnet
- Previous parent ID (update only): ________

## Leaf modules

- `runtime.js` ID: _________________________
- `orb-heist.logic.js` ID: _________________
- `orb-heist.assets.json` ID: ______________
- `signal-sprint.logic.js` ID: _____________
- `signal-sprint.assets.json` ID: __________
- `glyph-link.logic.js` ID: ________________
- `glyph-link.assets.json` ID: _____________
- `reactor-warden.logic.js` ID: ____________
- `reactor-warden.assets.json` ID: __________
- `cartridge-manifest.json` ID: ____________

## Parent module

- `cabinet.html` ID: _______________________

## Parent dependency list used in mint

`[ runtimeId, manifestId, orbLogicId, orbAssetsId, signalLogicId, signalAssetsId, glyphLogicId, glyphAssetsId, reactorLogicId, reactorAssetsId ]`

Actual list: __________________________________________

## Reuse tracking (update only)

- Reused unchanged leaf IDs: _______________
- Newly minted leaf IDs this release: ______
- Reused previous manifest ID: yes / no
- Reused previous runtime ID: yes / no

## Validation

- `runtimeModuleId` updated in `cabinet.html`: yes / no
- `manifestModuleId` updated in `cabinet.html`: yes / no
- manifest `logicModuleId` updated for all cartridges: yes / no
- manifest `assetsModuleId` updated for all cartridges: yes / no
- `networkPriority` in `cabinet.html` matches mint network: yes / no
- dependency list matches actual module IDs: yes / no
- parent minted with recursive flow: yes / no
