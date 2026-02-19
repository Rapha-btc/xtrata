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
- `games/gameNN_slug.js`: standalone ES5 IIFE exposing global `GameNN`.
- `tests/`: browser test harness and regression checks.

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
