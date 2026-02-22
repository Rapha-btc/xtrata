# Astro Blaster Standalone Portable

This folder is a portable package you can copy out of this repo and use directly.

## Folder layout
- `modules/` -> the 5 leaf modules to inscribe
- `parent/` -> recursive parent template, manifest, and ID autofill script
- `index.html` -> local/off-chain test app (loads from `modules/`)

## Local test (before inscription)
Serve this folder over HTTP (not `file://`) and open:
- `index.html`

You can also test the parent-style loader:
- `parent/astro-blaster-parent.local-test.html`

## Leaf modules to inscribe
Inscribe these first:
1. `modules/styles.css`
2. `modules/utils.js`
3. `modules/highscores.js`
4. `modules/game01_astro_blaster-v2.37.js`
5. `modules/main.js`

## Parent to inscribe last
After the 5 leaf inscriptions are minted and IDs are known:
- update IDs with `parent/fill-inscription-ids.mjs`
- then inscribe `parent/astro-blaster-parent.template.html` as recursive parent

## Update IDs automatically
From this folder:

```bash
node parent/fill-inscription-ids.mjs \
  --styles <styles-id> \
  --utils <utils-id> \
  --highscores <highscores-id> \
  --game-runtime <game-runtime-id> \
  --main <main-id>
```

Then, after parent mint:

```bash
node parent/fill-inscription-ids.mjs --parent <parent-id>
```

## Important
- Do not inscribe `index.html` for recursive deployment.
- Parent dependency order must be:
  `[stylesId, utilsId, highscoresId, gameRuntimeId, mainId]`
