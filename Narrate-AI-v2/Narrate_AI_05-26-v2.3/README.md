# Narrate AI v2.3

This version adds a local backend and a real audiobook workflow to the existing Qwen TTS front-end.

## What changed

- local Node.js server for synthesis, clone-voice management, chunk caching, chapter merges, and full-book merges
- audiobook analyser and generator wired into the existing Book / Script section
- event log implementation
- persistent audiobook project JSON snapshots under `output/projects/`
- chunk, chapter, book, and ZIP export outputs under `output/`

## Prerequisites

- Node.js
- FFmpeg on your `PATH`
- DashScope / Alibaba Model Studio API key
- optional: `zip` command for ZIP package export

## Run

```bash
node server.js
```

Then open:

- [http://localhost:3000](http://localhost:3000)

## Output folders

- `output/chunks/`
- `output/chapters/`
- `output/titles/`
- `output/book/`
- `output/packages/`
- `output/projects/`
- `output/temp/`

## Notes

- Audiobook parsing modes include `single`, `dual_pov`, `multi_cast_marked`, and `script`.
- Multi-cast parsing is marker-driven in this version. Use `[[Role]]` or `Role:` labels for explicit assignment.
- Cloned voices use `qwen3-tts-vc-2026-01-22` and must be paired with the cloned-voice model in audiobook generation.
