# Astro Blaster Portable - Inscription Plan

This plan is for this portable folder layout:

- `modules/` (leaf files to inscribe first)
- `parent/` (recursive parent + manifest + ID script)

## Files to inscribe

Leaf modules first:
1. `modules/styles.css`
2. `modules/utils.js`
3. `modules/highscores.js`
4. `modules/game01_astro_blaster-v2.37.js`
5. `modules/main.js`

Recursive parent last:
6. `parent/astro-blaster-parent.template.html`

## Recommended test before minting
1. Test direct local app:
   - open `index.html` via local HTTP server
2. Test parent-style local loader:
   - open `parent/astro-blaster-parent.local-test.html`

## After leaf IDs are minted
From the portable folder root:

```bash
node parent/fill-inscription-ids.mjs \
  --styles <styles-id> \
  --utils <utils-id> \
  --highscores <highscores-id> \
  --game-runtime <game-runtime-id> \
  --main <main-id>
```

This updates:
- `parent/astro-blaster-standalone.inscription-manifest.json`
- `parent/astro-blaster-parent.template.html`

## Parent mint dependency order
When minting `parent/astro-blaster-parent.template.html`, dependencies must be:

`[stylesId, utilsId, highscoresId, gameRuntimeId, mainId]`

## After parent is minted

```bash
node parent/fill-inscription-ids.mjs --parent <parent-id>
```

## Notes
- `index.html` is not the recursive parent inscription.
- Manifest file for record-keeping:
  - `parent/astro-blaster-standalone.inscription-manifest.json`
