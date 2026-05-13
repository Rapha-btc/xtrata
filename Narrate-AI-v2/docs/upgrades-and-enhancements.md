# Upgrades and Enhancements

## Objective

Move the current single-file prototype into a maintainable, testable product that can support real users, long-form generation, and cloned-voice workflows without hiding critical behavior in ad hoc browser state.

## Phase 0: Stabilize the existing prototype

Recommended first fixes:

- implement or remove the Book / Script Analyser and Event Log sections
- replace inline `onclick` HTML with explicit DOM listeners
- add the cloned-voice model to pricing and quota logic
- fix the single-generation cost fallback so it always uses `.rate`
- recompute quota state after usage reset
- add a small `getModelPricing(model)` helper instead of ad hoc fallback expressions
- revoke Blob URLs when replacing audio sources to reduce memory leaks

Expected outcome:

- the prototype stops advertising broken features
- browser behavior becomes less fragile
- cost and quota numbers become internally consistent

## Phase 1: Separate concerns

Break the monolith into explicit frontend files:

```text
web/
├── index.html
├── styles/
│   └── app.css
├── scripts/
│   ├── app.js
│   ├── state.js
│   ├── api-client.js
│   ├── pricing.js
│   ├── voices.js
│   ├── features/
│   │   ├── synthesize.js
│   │   ├── previews.js
│   │   ├── demo-mode.js
│   │   ├── cloning.js
│   │   ├── book-mode.js
│   │   └── log-panel.js
│   └── utils/
│       ├── dom.js
│       ├── download.js
│       └── language-detect.js
└── assets/
```

Design goals:

- one source of truth for state
- one module for backend communication
- one module for pricing/quota rules
- feature-specific render and event code separated from shared utilities

## Phase 2: Add the missing backend

Minimum backend capabilities:

- synthesize audio for built-in and cloned voices
- normalize provider errors
- return authoritative usage headers
- persist or proxy cloned-voice management

Recommended additions:

- move provider credentials off the client
- add request validation and rate limiting
- add audit logging for cloning and generation jobs
- introduce async jobs for long-form workflows
- support resumable long-running tasks

## Phase 3: Make book generation real

The current UI hints at a larger workflow that the codebase does not yet implement. A robust design would include:

- text segmentation with deterministic chunking rules
- parser support for chapters, scenes, and dialogue attribution
- voice assignment tables backed by structured data rather than raw DOM
- batch job progress from the server instead of browser-only loops
- artifact manifests describing each chapter, chunk, voice, and output file
- merged-download generation on the server for large runs

Suggested data model:

```json
{
  "projectId": "book_123",
  "model": "qwen3-tts-instruct-flash",
  "segments": [
    {
      "id": "seg_001",
      "chapter": "Chapter 1",
      "speaker": "Narrator",
      "voice": "Cherry",
      "text": "..."
    }
  ]
}
```

## Phase 4: Improve product quality

### Engineering

- add `package.json` and a real dev workflow
- add linting and formatting
- add unit tests for pricing, language detection, and segmentation logic
- add browser tests for the main happy paths
- add CI checks for lint, tests, and static hosting

### UX

- search and filter for the 48 built-in voices
- explicit badges for built-in vs cloned voices
- better status surfaces than `alert()` and `confirm()`
- retry controls for failed batch items
- persisted user preferences for model, language, and style presets
- drag-and-drop bulk import for preview packs with validation feedback

### Reliability

- avoid sequential browser-only loops for large batch jobs
- store generated artifacts outside RAM
- use signed downloads instead of long-lived Blob URLs for large files
- add telemetry hooks for failed requests and export failures

### Security

- remove raw provider API keys from the frontend
- stop building executable HTML strings from user-controlled fields
- pin third-party assets with integrity hashes or bundle them locally

## Enhancement ideas beyond parity

- streaming audio playback during generation
- SSML-like authoring controls if the provider supports them
- pronunciation dictionary support
- reusable project files for long-form narration sessions
- speaker templates for podcasts, audiobooks, and dialog scenes
- waveform previews and clip trimming for cloned voices
- optional IndexedDB cache for generated previews and demos

## Recommended implementation order

1. Fix the broken and risky behaviors already in the prototype.
2. Add the missing backend contract and make the current UI truly runnable.
3. Split frontend code into modules so future changes stop compounding risk.
4. Implement the Book / Script workflow as a real async job system.
5. Add tests, CI, and security hardening before adding more surface area.
