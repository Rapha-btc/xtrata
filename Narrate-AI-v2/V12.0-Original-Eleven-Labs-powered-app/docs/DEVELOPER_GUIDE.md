# Developer Guide

## Architecture overview

This project is a local web app with a Node.js backend and a vanilla JS frontend.

- Backend: `src/backend/server.js`
  - Native `http` server (no Express)
  - Filesystem-based persistence (projects and audio files)
  - ElevenLabs proxy endpoint and FFmpeg merge pipeline
  - Simple async queues to cap API and FFmpeg concurrency

- Frontend: `src/frontend/`
  - `index.html` for the UI
  - `css/style.css` for layout and theming
  - `js/script.js` for state, parsing, API calls, and playback

## Local development

Run the server:
```bash
node src/backend/server.js
```

Open the app:
- http://localhost:3000

There is no build step and no package.json. All assets are served directly by the backend.

## Key concepts

### Parsing pipeline
- Chapter headings are detected by regex using a multi-language keyword list.
- Text is split into chunks using punctuation-aware heuristics.
- Dual-voice mode alternates segments using a token (default `* * *`).

### Audio generation
- `/api/generate` proxies ElevenLabs and stores chunks as MP3 files.
- Chunks are cached by deterministic hash of text + voice + model.
- `/api/check-cache` allows the UI to skip already-generated chunks.

### Merging
- `/api/merge-chapter` concatenates chunk MP3 files into a chapter MP3 using FFmpeg.
- `/api/merge-book` concatenates all chapters (and optional titles) into a full book MP3.

### Data model (project JSON)
Stored under `output/projects/<projectId>.json`.

```json
{
  "id": "my_project_id",
  "title": "My Book",
  "author": "Author Name",
  "manuscript": "full manuscript text",
  "updatedAt": "ISO timestamp",
  "chapters": [
    {
      "title": "Chapter 1",
      "chunks": [
        {
          "id": "chunk_id",
          "text": "segment text",
          "status": "pending|done|error",
          "audioUrl": "/output/chunks/...",
          "filename": "...mp3",
          "voiceId": "voice id",
          "voiceName": "Voice name",
          "voiceIndex": 0,
          "duration": 0
        }
      ],
      "collapsed": true,
      "audioUrl": "/output/chapters/..."
    }
  ],
  "projectSettings": {
    "mode": "single|dual",
    "voiceIds": ["voice1", "voice2"],
    "voiceNames": ["Narrator", "Hero"],
    "token": "* * *",
    "silenceChunk": 0,
    "silenceChapter": 1,
    "notes": ""
  }
}
```

## Extending the app

- Frontend changes go to `src/frontend/js/script.js` and `src/frontend/css/style.css`.
- Backend changes go to `src/backend/server.js`.
- If you add new API endpoints, update `docs/API_REFERENCE.md`.

## Suggested tests

There are no automated tests currently. Suggested manual checks:
- Parse a manuscript with chapter headings in multiple languages.
- Use dual voice mode and ensure alternating segments.
- Generate with cached content and verify no new files are produced.
- Merge chapters and book, then verify the output MP3s are playable.
