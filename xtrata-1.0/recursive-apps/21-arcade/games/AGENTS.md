# Game Module Rules

## Mandatory Read Before Astro Blaster Updates
1) Before editing `game01_astro_blaster.js`, read `game01_astro_blaster.playbook.md`.
2) Preserve the hard invariants and checklist defined in that playbook.

## General Game File Rules
- Keep each game as a standalone ES5 IIFE returning a `GameNN` API object.
- Preserve `getTestHooks()` for lifecycle/level test coverage.
- Keep `shared.highScores` integration intact for score-submitting games.
- Do not bypass global scoring lock rules triggered by production test controls (for example, Force/Next Wave).
