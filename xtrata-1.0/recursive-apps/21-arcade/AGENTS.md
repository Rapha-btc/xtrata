# Arcade AGENTS

This file governs work in `recursive-apps/21-arcade/` and is optimized for long-term scaling
of game content (many levels/waves), stable performance, and trustworthy high-score submission.

## Scope
- Applies to `index.html`, `main.js`, `styles.css`, `lib/*.js`, `games/*.js`, and `tests/*`.
- For game-specific constraints, also read `games/AGENTS.md`.
- Before major architecture changes, review `/Users/melophonic/Documents/GitHub/xtrata/xtrata-1.0/docs/app-reference.md`.

## Product Goals
- Keep each game fun and responsive on desktop and mobile browsers.
- Support content expansion (100+ levels/waves) without rewriting core loops.
- Preserve leaderboard integrity for long-term on-chain score competition.
- Make updates safe: deterministic behavior where needed, test hooks always present, no hidden scoring paths.

## Project Structure
- `index.html`: boot order and runtime config (`window.ARCADE_ONCHAIN_CONFIG`).
- `main.js`: launcher, game lifecycle, wallet status/connect, admin actions, debug controls.
- `lib/highscores.js`: local PB + on-chain submit/fetch + scoring lock behavior.
- `lib/utils.js`: shared rendering/audio/input helpers.
- `lib/game-loader.js`: runtime loader that resolves and loads latest available game versions.
- `games/latest-manifest.js`: auto-generated manifest of latest version per game slot.
- `games/gameNN_slug.js`: standalone ES5 IIFE exposing global `GameNN`.
- `gameNN_slug-vX/`: per-game development workspace (source modules, tests, build scripts, workspace `AGENTS.md`).
- `tests/`: browser test harness and regression checks.

## Main App Consumption
- The arcade launcher main app must always load latest game versions through:
  - `index.html` -> `games/latest-manifest.js` -> `lib/game-loader.js` -> `main.js`
- Do not hardcode individual game version file paths in `main.js`.
- Home tiles should display the resolved version label so testers can verify the active build before launching.
- Version labels in tiles must show decimal form:
  - examples: `v1.0`, `v2.0`, `v2.1`, `v2.2`

## Game-Type Review Gate
- Each workspace must maintain `GAME_STRATEGY.json` with archetype-aware scaling and testing plans.
- Initialize missing profiles:
  - `npm run arcade:strategy:init`
- Run review audit across all workspaces:
  - `npm run arcade:strategy:review`
- Before promoting any game version, pass strict review for that game:
  - `npm run arcade:strategy:review -- --game gameNN_slug --strict`
- If genre/core-loop changes, update `GAME_STRATEGY.json`, workspace `AGENTS.md`, and `README.md` before code promotion.

## Versioned Game Workflow
- Keep `games/` as production-test outputs only.
- Build and test inside per-game workspace folders, then promote via generated `games/gameNN_slug-vX.js` files.
- Follow naming rules:
  - base output: `games/gameNN_slug.js`
  - versioned output: `games/gameNN_slug-vX.js` (example: `games/game01_astro_blaster-v2.js`)
- Default version progression policy:
  - from `v2`, use decimal minor versions by default: `v2.1`, `v2.2`, `v2.3`, ...
  - use an explicit major jump only when requested
  - helper command:
    - `npm run arcade:next-version -- --game game01_astro_blaster`
    - explicit override: `npm run arcade:next-version -- --game game01_astro_blaster --version 3`
- Build automation policy:
  - each workspace build command should mint a new decimal versioned runtime file on every build
  - example progression for repeated builds: `v2 -> v2.1 -> v2.2 -> v2.3`
  - after writing the new versioned file, regenerate `games/latest-manifest.js`
- Loader behavior:
  - `lib/game-loader.js` uses `games/latest-manifest.js` and chooses highest available `-v` version per slot.
  - Deleting an unwanted newer version reverts to the previous version after manifest refresh.
- Manifest lifecycle:
  - Generate manually: `npm run arcade:games:manifest`
  - Auto-generated on `npm run dev` and `npm run build` via `predev`/`prebuild`.

## Per-Game Workspace Standards
- Each `gameNN_slug-vX/` workspace must include:
  - `AGENTS.md` with build/test/promotion rules for that game.
  - `src/` for modular source and catalogs.
  - `tests/` for deterministic workspace tests.
  - `scripts/` with build entrypoint that outputs to `games/`.
- Workspace `AGENTS.md` must document:
  - invariants to preserve (`id`, `scoreMode`, launcher API shape, score submit path),
  - how to add new modules and tests,
  - exact build command,
  - exact test command,
  - promotion checklist for production testing in `games/`.

## Workspace Coverage Model
- Every playable slot in `games/` should have a matching enhancement workspace folder.
- Current standard naming:
  - runtime slot file: `games/gameNN_slug.js` (and optional `games/gameNN_slug-vX.js`)
  - workspace folder: `gameNN_slug-v2/` (then `-v2.1/`, `-v2.2/` by default after v2, unless a major jump is explicitly requested)
- Rule: do not enhance a game directly in `games/`; always implement in its workspace folder first, then promote generated output to `games/`.
- For new slots, create the workspace folder immediately so the same test/build/promotion method is available from day one.

## Coding Rules
- Use existing vanilla ES5 style (`var`, function declarations, IIFE game modules).
- Keep code ASCII unless a file already requires Unicode.
- Do not add dependencies/build tooling unless explicitly requested.
- Keep startup lightweight; avoid blocking event handlers with long synchronous work.
- Preserve existing public contracts: `ArcadeLauncher`, `HighScores`, `ArcadeUtils`, and game module API shape.

## Game Module Contract
- Each game file must expose:
  - `id`, `title`, `description`, `genreTag`, `controls`, `hasLevels`, `scoreMode`
  - `init(containerEl, shared)`
  - `destroy()`
  - `getTestHooks()` for deterministic test control
- `destroy()` must clean timers, animation loops, listeners, and audio to prevent cross-game leaks.
- `getTestHooks()` must remain functional after refactors.

## Scaling Strategy (Levels/Waves)
- Prefer data-driven level definitions over hardcoded per-level conditionals.
- Separate level data from runtime systems:
  - spawn schedules
  - enemy mix/composition
  - speed/health/fire-rate modifiers
  - reward/score multipliers
- Add reusable wave primitives (formation, burst, flank, rush, boss escort) and compose from them.
- Support procedural variation via deterministic seeds only when fairness is preserved.
- Keep difficulty curves smooth; avoid abrupt spikes unless flagged as boss/challenge waves.

## Effects and Animation Rules
- Effects (missiles, trails, explosions, hit flashes) must be pooled/reused when possible.
- Avoid per-frame object churn in hot loops.
- Keep animation timing frame-rate independent (delta-based updates with clamped dt).
- Visual upgrades must not change score rules unless explicitly intended and documented.

## Performance and Stability Budgets
- Target 60fps on typical laptops; degrade gracefully on weaker devices.
- Avoid expensive allocation/parsing inside frame loops.
- Keep click handlers and synchronous setup work short; defer heavy work using async scheduling when possible.
- Treat console runtime errors and overlay crashes as release blockers.

## Score and On-Chain Integrity
- Never mutate final score after a run is marked complete.
- Do not bypass or weaken attestation, nonce, or wallet checks in submit flow.
- Keep game-over -> verify -> submit sequence deterministic from one score snapshot.
- If test shortcuts are used in a browser session (for example force-next-wave), honor scoring lock behavior.

## Wallet and Network Behavior
- Treat detected provider != connected account.
- Resolve Stacks addresses robustly from provider payload variants.
- Respect configured network target and show explicit mismatch status.
- On wallet integration changes, test both connect badge behavior and score-submit behavior.

## Strict Deny-Mode Post Condition Rules
- The arcade score submit path runs in strict fee-trust mode by default:
  - `useDenyModePostConditions: true`
  - `fallbackToAllowModeOnPostConditionFailure: false`
- Compatibility requirements discovered during wallet hardening:
  - do not rely on `stx_callContractV2` (many providers do not support it).
  - for strict submit, generate provider variants that include:
    - post conditions serialized as STX post-condition hex bytes
    - `functionArgs` variants with and without `0x` prefixes
    - mode variants (`deny` string + numeric mode) for provider tolerance
  - Xverse/BitcoinProvider paths may require `transactionRequest`-first behavior in strict mode.
- Keep strict mode enabled; do not silently downgrade to allow mode.
- If wallet submit code changes, run diagnostics before manual wallet testing:
  - `npm run arcade:wallet:diag`

## Testing Requirements
- Maintain and update tests in `tests/tests.js` for any shared logic changes.
- For game updates, verify:
  - launch, play, exit, restart
  - cleanup after destroy
  - level progression correctness
  - overlay display correctness
  - score submit flow (including rejection/failure paths)
- Keep `getTestHooks()` aligned with test harness expectations.

## Development Commands
- Run local server: `python3 -m http.server 8000`
- Open arcade: `http://localhost:8000/index.html`
- Run test harness: `http://localhost:8000/tests/test_runner.html`
- Run wallet compatibility diagnostics: `npm run arcade:wallet:diag`
- Useful search:
  - `rg --files recursive-apps/21-arcade`
  - `rg "Game[0-9]{2}|getTestHooks|submitOnChainScore" recursive-apps/21-arcade`

## Change Management
- Keep commits focused (one concern per commit).
- For substantial gameplay or shared-lib changes, include:
  - behavior summary
  - risk notes
  - test evidence (manual + harness)
- When introducing new game architecture patterns, update this file so future game scaling stays consistent.
