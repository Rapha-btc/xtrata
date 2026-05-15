# AGENTS

## Project Shape

- Main frontend: `index.html`
- Main backend: `server.js`
- Audiobook layer: `audiobook-v23.js`
- Runtime outputs and caches live under `output/`
- Local cloned voice cache lives under `qwen3_cloned_voices/`
- Local designed voice cache lives under `qwen3_designed_voices/`

This repo is intentionally lightweight: most app behavior is still in a single HTML file plus a single Node server.

## Run

```bash
node server.js
```

Then open `http://localhost:3000`.

## Core Voice Modes

- Built-in voices use `qwen3-tts-flash` or `qwen3-tts-instruct-flash`
- Cloned voices use `qwen3-tts-vc-2026-01-22`
- Designed voices use `qwen3-tts-vd-2026-01-26`

Model and voice must match:

- Clone voices only work with the clone model
- Designed voices only work with the design model
- Director-style instruction control only works on the instruct model family

## Provider Constraints That Matter In This Repo

- Director / instruct requests need stricter guarding than plain Flash requests
- Custom voice provider IDs should be provider-safe: letters, numbers, underscores, max 16 chars
- The app keeps a user-facing display label separately from the provider-safe preferred name where possible
- Account voice listing should be treated as paginated, not “first page only”

If a voice or style issue looks random, check request normalization first before changing UI copy.

## Frontend Conventions

- `index.html` owns:
  - the main generator UI
  - voice grid / picker
  - design lab
  - clone manager
  - demo tools
  - usage dashboard
- `audiobook-v23.js` patches and extends the page after `index.html` loads

For main voice selection:

- Built-ins are shown in the top voice grid
- Custom voices should also be surfaced from the saved clone / designed voice lists, not only in their lower management sections
- Refreshing custom voice availability depends on loading both clone and designed voice libraries

## Backend Conventions

- `server.js` wraps DashScope APIs directly
- `/synthesize` is the main non-streaming speech route
- `/list-voices` and `/list-designed-voices` are account-list wrappers and should merge remote results with local cache records
- Audiobook chunk generation also routes through the same synthesis path, so synthesis normalization changes affect book generation too

Be careful with changes to filename building and cache keys because audiobook chunk reuse depends on them.

## Worktree Cautions

- This repo is often dirty with real generated assets and user data
- Do not delete or revert `output/`, `qwen3_cloned_voices/`, or `qwen3_designed_voices/` contents unless explicitly asked
- Many JSON and audio files in those folders are real working state, not test fixtures

## Good First Checks For Future Agents

1. Confirm `node server.js` starts cleanly.
2. Verify the browser can reach `/api/health`.
3. If custom voices are “missing,” check both:
   - whether the relevant library loader ran after the API key was entered
   - whether the account list route is only fetching a single page
4. If Director errors, inspect request length handling before assuming the voice prompt itself is wrong.
