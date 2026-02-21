# Astro Blaster Standalone Inscription Plan (Non-Developer Friendly)

This is the exact order to inscribe a fully working standalone Astro Blaster.

## Short answer: which files do I inscribe?
Inscribe these 6 files:

1. `styles.css`
2. `lib/utils.js`
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`
6. `inscription/astro-blaster-parent.template.html` (this one is last)

Important:
- Files 1-5 are leaf modules (normal inscriptions, no parents).
- File 6 is the recursive parent (must be minted after 1-5).
- `index.html` is for local/off-chain testing and is not used as the recursive parent inscription.

## Why this order matters
`main.js` depends on:
- `lib/utils.js`
- `lib/highscores.js`
- `games/game01_astro_blaster-v2.37.js`

The parent template then loads all 5 leaf modules by inscription ID.

## Step-by-step checklist

### Step 1) Mint the 5 leaf modules
Mint in this exact order:

1. `styles.css`
2. `lib/utils.js`
3. `lib/highscores.js`
4. `games/game01_astro_blaster-v2.37.js`
5. `main.js`

Save each minted inscription ID.

### Step 2) Auto-fill IDs into manifest + parent template
Run this command from `Astro-Blaster-Standalone`:

```bash
node inscription/fill-inscription-ids.mjs \
  --styles <styles-id> \
  --utils <utils-id> \
  --highscores <highscores-id> \
  --game-runtime <game-runtime-id> \
  --main <main-id>
```

This updates:
- `inscription/astro-blaster-standalone.inscription-manifest.json`
- `inscription/astro-blaster-parent.template.html`

### Step 3) Mint the recursive parent
Now mint:
- `inscription/astro-blaster-parent.template.html`

Use dependency list in this exact order:
- `[stylesId, utilsId, highscoresId, gameRuntimeId, mainId]`

### Step 4) Save the parent inscription ID
After parent mint succeeds:

```bash
node inscription/fill-inscription-ids.mjs --parent <parent-id>
```

## Quick verification after mint
Open the parent inscription and confirm:

1. Loader shows modules loading.
2. Start screen shows Top 10 first.
3. Game starts correctly.
4. Wallet `Connect` and `Disconnect` both work.
5. High score read works.
6. Score verify opens wallet transaction prompt.

## Canonical files for this process
- Manifest: `inscription/astro-blaster-standalone.inscription-manifest.json`
- Parent template: `inscription/astro-blaster-parent.template.html`
- ID helper script: `inscription/fill-inscription-ids.mjs`

## Notes
- Parent uses same-origin RPC first (`/rpc`), then falls back to Hiro API.
- Keep dependency order consistent everywhere:
  - `leafModules` in manifest
  - `recursiveSeal.dependencies` in manifest
  - `CONFIG.moduleIds.*` in parent template
  - dependency list entered during parent mint
