# Astro Blaster Portable - Inscription Plan

This plan is for this portable folder layout:

- `modules/` (leaf files to inscribe first)
- `parent/` (recursive parent + manifest + ID script)

## Files to inscribe

Leaf modules first:
1. `modules/styles.css` - 69
2. `modules/utils.js` - 70
3. `modules/highscores.js` - 68
4. `modules/game01_astro_blaster-v2.37.js` - 71
5. `modules/main.js` - 72

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
  --styles <69> \
  --utils <70> \
  --highscores <68> \
  --game-runtime <71> \
  --main <72>
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
