# Narrate AI v2.4 Upgrade Plan

## Completed Foundation

- Centralized app and model metadata in `lib/app-meta.js`.
- Added `/api/models` for server-owned model defaults, pricing, and provider limits.
- Updated v2.4 identity across UI, backend health, logs, README, and API reference.
- Added frontend backend-version guarding so a v2.4 page does not continue against a v2.3 server.
- Added bounded JSON and multipart request reads.
- Restricted static serving to the UI, selected docs, and expected runtime media/state directories.
- Added cleaner port-conflict startup errors.
- Added `npm test` with syntax checks and a local smoke test.
- Added `.gitignore` coverage for generated output and local voice cache directories.

## Next Engineering Phases

1. Split `index.html` scripts into no-build modules: `core-studio.js`, `voice-library.js`, `design-lab.js`, `clone-manager.js`, `usage-dashboard.js`, and `demo-tools.js`.
2. Split `server.js` routes into modules: `routes/speech.js`, `routes/voices.js`, `routes/audiobook.js`, `routes/usage.js`, and `routes/static.js`.
3. Add `GET /api/voices/catalog` and move built-in voice compatibility rules out of browser-only state.
4. Replace browser `alert`, `prompt`, and `confirm` flows with app-native modal/toast components.
5. Add a durable audiobook job manifest so long book generation can resume reliably after browser refresh or server restart.
6. Add focused tests for request normalization, cache filename stability, custom voice merge behavior, audiobook parsing, and destructive route authorization.
7. Add frontend smoke coverage with a browser runner once a local browser test dependency is introduced.

## Release Rule

Keep each phase independently runnable with `npm test` passing before moving to the next phase.
