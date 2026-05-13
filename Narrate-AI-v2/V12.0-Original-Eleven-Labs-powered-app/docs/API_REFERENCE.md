# API Reference

Base URL: `http://localhost:3000`

All endpoints return JSON unless otherwise noted. The server sets `Access-Control-Allow-Origin: *`.

## GET /

Serves the frontend UI (`index.html`).

## GET /output/*

Serves generated MP3 files from the `output/` directory.

---

## GET /api/projects

List saved projects and recovered "ghost" projects.

Response:
```json
[
  {
    "id": "project_id",
    "title": "Book Title",
    "author": "Author",
    "updatedAt": "2026-01-26T12:34:56.000Z",
    "filename": "project_id.json",
    "type": "saved"
  }
]
```

## GET /api/projects/:id

Load a specific project. If no JSON exists, attempts to recover project data from existing audio chunks.

Response (project JSON):
```json
{
  "id": "project_id",
  "title": "Book Title",
  "author": "Author",
  "manuscript": "...",
  "chapters": [],
  "projectSettings": {}
}
```

## POST /api/projects

Create or update a project.

Request body:
```json
{
  "id": "project_id",
  "title": "Book Title",
  "author": "Author",
  "manuscript": "...",
  "chapters": [],
  "projectSettings": {}
}
```

Response:
```json
{ "id": "project_id", "status": "saved" }
```

## PATCH /api/projects/:id

Rename a project.

Request body:
```json
{ "title": "New Title" }
```

Response:
```json
{ "status": "updated", "id": "project_id", "title": "New Title" }
```

## DELETE /api/projects/:id

Delete a project file.

Response:
```json
{ "status": "deleted", "id": "project_id" }
```

---

## POST /api/generate

Generate a single audio chunk via ElevenLabs.

Request body:
```json
{
  "text": "Segment text",
  "voiceId": "elevenlabs_voice_id",
  "apiKey": "xi-...",
  "modelId": "eleven_turbo_v2",
  "projectId": "project_id",
  "chapterIndex": 0,
  "chunkIndex": 0,
  "force": false
}
```

Response:
```json
{ "url": "/output/chunks/<file>.mp3", "filename": "<file>.mp3", "cached": false }
```

## POST /api/check-cache

Batch cache existence check for chunks.

Request body:
```json
{
  "projectId": "project_id",
  "modelId": "eleven_turbo_v2",
  "chunks": [
    { "id": "chunk_id", "text": "...", "voiceId": "...", "chapterIndex": 0, "chunkIndex": 0 }
  ]
}
```

Response:
```json
{
  "chunks": [
    { "id": "chunk_id", "exists": true, "filename": "...mp3", "url": "/output/chunks/...mp3" }
  ]
}
```

## POST /api/merge-chapter

Merge chunk MP3s into a chapter MP3.

Request body:
```json
{
  "projectId": "project_id",
  "chapterIndex": 1,
  "filenames": ["chunk1.mp3", "chunk2.mp3"],
  "isTitle": false,
  "silence": 0.0
}
```

Response:
```json
{ "url": "/output/chapters/project_id_chapter_1.mp3", "path": "<absolute path>" }
```

## POST /api/merge-book

Merge all chapters (and optional titles) into a single book MP3.

Request body:
```json
{ "projectId": "project_id", "silence": 1.0 }
```

Response:
```json
{ "url": "/output/book/project_id_full_book.mp3", "path": "<absolute path>" }
```
