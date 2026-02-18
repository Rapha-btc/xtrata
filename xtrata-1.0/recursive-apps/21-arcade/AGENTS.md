# Repository Guidelines

## Project Structure & Module Organization
- `index.html` loads shared libraries, all game modules, and `main.js`.
- `main.js` is the launcher: home grid rendering, game lifecycle, error handling, and keyboard navigation.
- `games/` contains one game per file (`gameNN_slug.js`), each exposing a global `GameNN` object.
- `lib/utils.js` and `lib/highscores.js` provide shared utilities, audio helpers, and leaderboard logic.
- `tests/` contains the browser-based harness: `test_runner.html`, `tests.js`, and `test_utils.js`.
- `styles.css` defines global arcade, overlay, and responsive layout styles.

## Build, Test, and Development Commands
- No Node build pipeline is used here; this is a static HTML/CSS/JS project.
- Run locally with a static server:
  - `python3 -m http.server 8000`
- Open the app:
  - `http://localhost:8000/index.html`
- Run tests:
  - `http://localhost:8000/tests/test_runner.html` then click **Run All Tests**.
- Useful repo navigation:
  - `rg --files`
  - `rg "Game[0-9]{2}" games/`

## Coding Style & Naming Conventions
- Follow existing vanilla JS style: ES5 patterns (`var`, IIFEs, explicit returned API objects).
- Use 2-space indentation, semicolons, and compact function declarations consistent with current files.
- Keep naming aligned:
  - File: `games/gameNN_slug.js`
  - Module global: `GameNN`
  - Game metadata keys: `id`, `title`, `description`, `genreTag`, `controls`, `hasLevels`, `scoreMode`.
- Preserve shared contracts (`ArcadeUtils`, `HighScores`, `ArcadeLauncher`) when extending functionality.

## Testing Guidelines
- Main coverage is through `tests/tests.js` (smoke, lifecycle cleanup, level progression, high scores).
- For new or changed games, ensure `getTestHooks()` remains available for deterministic checks.
- Before PR: run the full browser test suite and manually verify launch, exit, restart, and score submission behavior.
- Any runtime error overlay should be treated as a blocking issue.

## Commit & Pull Request Guidelines
- Use short, imperative commit subjects (for example: `Fix cleanup on game exit`).
- Keep each commit focused on one concern (single game, shared lib, or tests).
- PRs should include:
  - What changed and why.
  - Test evidence (test runner result + manual steps).
  - Screenshot or GIF for visible UI/gameplay changes.
  - Linked issue/task ID when available.
