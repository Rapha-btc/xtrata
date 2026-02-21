# Astro Blaster Standalone

This folder is a self-contained standalone package for Astro Blaster with on-chain Top 10 and wallet connect support.

## Runtime entry
- `index.html`

## Local modules/assets included
- `styles.css`
- `lib/utils.js`
- `lib/highscores.js`
- `games/game01_astro_blaster-v2.37.js`
- `main.js`

## Startup behavior
- Opens directly to Astro Blaster start screen (Top 10 + mission briefing loop).
- Uses same wallet connect/disconnect flow as arcade.
- Uses same on-chain high score contract configuration used in main arcade.
- Uses same-origin RPC first (`/rpc`) for read-only chain data, with safe fallback to Hiro API if `/rpc` is unavailable.

## Script load order (for recursive inscription planning)
1. `lib/utils.js`
2. inline config in `index.html` (`window.ARCADE_ONCHAIN_CONFIG`)
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`

## Notes
- This package intentionally removes the multi-game home lobby flow.
- Exit/Esc returns to this game's own start screen.

## Recursive inscription artifacts
- Plan/runbook: `inscription/INSCRIPTION-PLAN.md`
- Ready manifest: `inscription/astro-blaster-standalone.inscription-manifest.json`
- Recursive parent template: `inscription/astro-blaster-parent.template.html`
- Auto-fill helper: `inscription/fill-inscription-ids.mjs`

## Exact files to inscribe (for full working standalone)
Inscribe these files in this order:
1. `styles.css`
2. `lib/utils.js`
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`
6. `inscription/astro-blaster-parent.template.html` (recursive parent, last)

Do not use `index.html` as the recursive parent inscription. `index.html` is for local/off-chain testing.

## Auto-fill minted IDs
After minting all five leaf modules, run:

```bash
node inscription/fill-inscription-ids.mjs \
  --styles <styles-id> \
  --utils <utils-id> \
  --highscores <highscores-id> \
  --game-runtime <game-runtime-id> \
  --main <main-id>
```

Optional: include parent ID after recursive parent mint:

```bash
node inscription/fill-inscription-ids.mjs --parent <parent-id>
```

You can dry-run first:

```bash
node inscription/fill-inscription-ids.mjs ... --dry-run
```
