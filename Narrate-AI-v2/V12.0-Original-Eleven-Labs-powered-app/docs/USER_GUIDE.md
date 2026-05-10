# User Guide

## What this app does

Audiobook Studio Gen-3 is a local, browser-based studio for turning manuscripts into audiobook audio. It connects to ElevenLabs to generate high quality voices, splits long text into safe chunks, caches audio by content hash, and merges chapters into a single book file.

## Prerequisites

- Node.js installed on your machine
- FFmpeg installed and available on PATH
- ElevenLabs API key for premium voices

## Start the app

1) Start the local server:
```bash
node src/backend/server.js
```
2) Open the studio in your browser:
- http://localhost:3000

## Basic workflow

1) Connect ElevenLabs
- Go to the Connections tab.
- Paste your xi-api-key and click Connect.

2) Configure narration
- Choose Single Voice or Dual Voice.
- Select voices for Voice 1 (and Voice 2 for dual mode).
- Adjust chunk size and silence settings.

3) Paste and analyze
- Paste your manuscript in the editor.
- Click "Analyze & Parse" to split chapters and segments.

4) Generate
- Click "Generate Audio" (or use the timeline buttons to generate per chapter/segment).
- Confirm the cost estimate in the modal.

5) Merge and download
- Chapters are merged automatically when all segments exist.
- The full book MP3 is created at the end and can be downloaded from the success link.

## Text formatting tips

### Chapter headings
The parser detects chapter headers across several languages. Examples:
- "Chapter 1"
- "# Chapter One"
- "Kapitel 1"
- "Capitulo Uno"
- "Chapitre 1"

Supported heading keywords include:
English, German, Spanish, French, Italian, Portuguese, Dutch, Polish, Russian, Turkish, Finnish, Hungarian, Czech, Greek, Indonesian.

### Preamble / Titles
If text appears before the first chapter heading, it is treated as a Titles section and will be merged into a separate titles MP3.

### Dual voice mode
Use the voice switch token (default `* * *`) on its own line to alternate voices. Example:
```
Narrator text here.

* * *

Character text here.
```

If a segment starts with the current voice name (for example, "Vincent."), a dramatic pause is inserted automatically. You can set voice names next to the voice selector to improve detection.
You can add multiple aliases per voice by separating names with commas (for example, `Layla, Charlotte` and `Drake, Mason`).
The starting voice for each chapter is chosen from the first speaker line after the chapter heading, using these UI name mappings.
You do not need to edit manuscript text to force chapter starts if the opening speaker line matches one of your configured names.
To force the opening voice for a chapter, add `[[voice1]]` or `[[voice2]]` on its own line near the start of the chapter.

### Chunk size
The "Split Strategy" value controls max characters per segment (min 200, max 4000). Smaller chunks generate faster but create more segments to manage.

## Cost and caching

- The app estimates cost based on total characters and the selected ElevenLabs model multiplier.
- Cached segments do not cost credits and are reused automatically.
- Use the budget warning field to be alerted if a session exceeds your limit.

## Project management

- Save projects to the server using the Projects modal.
- Load saved projects to resume work.
- Rename or delete via the context menu.
- "Ghost" projects can be recovered from existing audio chunk files.

## Output files

Generated audio and project files are saved under `output/`:
- `output/chunks/` - individual audio segments
- `output/chapters/` - merged chapters
- `output/titles/` - merged titles
- `output/book/` - final merged audiobook
- `output/projects/` - project JSON files

## Privacy and local storage

- API keys and draft text are stored in the browser localStorage on your machine.
- Generated audio and project files are stored locally under `output/`.
