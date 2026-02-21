# AGENTS - Astro Blaster Standalone

Scope: `recursive-apps/21-arcade/Astro-Blaster-Standalone`

## Purpose
Self-contained standalone Astro Blaster build with wallet connect + on-chain Top 10 flow.

## Required invariants
1. Launches directly into Astro Blaster Top 10 start screen (no multi-game lobby).
2. Uses `Game01` runtime only.
3. Keeps wallet + on-chain score verification flow active.
4. Keeps all required runtime files local to this folder.

## Local module set (inscription package)
- `index.html`
- `styles.css`
- `lib/utils.js`
- `lib/highscores.js`
- `games/game01_astro_blaster-v2.37.js`
- `main.js`

## Recursive inscription set (production)
Leaf inscriptions:
1. `styles.css`
2. `lib/utils.js`
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`

Recursive parent (mint last):
6. `inscription/astro-blaster-parent.template.html`

`index.html` is local/off-chain only and is not the recursive parent file.

## Load order
1. `lib/utils.js`
2. `window.ARCADE_ONCHAIN_CONFIG` inline block in `index.html`
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`

## Validation
- `node --check main.js`
- `node --check lib/highscores.js`
- `node --check lib/utils.js`
- `node --check games/game01_astro_blaster-v2.37.js`

## Notes
- Do not reference `../` paths; keep standalone package fully local.
- If upgrading game runtime version, update both `index.html` and this file.
