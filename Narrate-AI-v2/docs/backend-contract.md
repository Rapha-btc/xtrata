# Backend Contract

## Summary

The frontend assumes a server layer exists at the same origin. That server is not included in this repository, so this document captures the contract that the current browser code expects.

## Endpoint inventory

| Endpoint | Method | Used for |
| --- | --- | --- |
| `/synthesize` | `POST` | Single generation, demo mode, and preview generation |
| `/clone-voice` | `POST` | Uploading an audio sample for cloned-voice creation |
| `/list-voices` | `POST` | Listing saved cloned voices |
| `/delete-voice` | `POST` | Removing a saved cloned voice |

## `/synthesize`

### Request

- Method: `POST`
- Content-Type: `application/json`

Expected JSON body:

```json
{
  "api_key": "sk-...",
  "text": "Hello world",
  "voice": "Cherry",
  "language": "English",
  "model": "qwen3-tts-flash",
  "instructions": "Use a calm tone."
}
```

Notes:

- `instructions` is passed by the single-generation flow.
- demo mode and preview mode do not always send `instructions`.
- `voice` may be either a built-in voice name or a cloned voice ID.

### Success response

- Status: `200`
- Content-Type: audio MIME type such as `audio/wav`, or `application/octet-stream`
- Body: raw audio bytes

Optional but expected headers:

- `X-Usage-Chars`: integer character count
- `X-Usage-Cost`: decimal USD cost

Frontend fallback behavior:

- if `X-Usage-Chars` is missing, it falls back to `text.length`
- if `X-Usage-Cost` is missing, it computes cost locally

### Error response

- Non-2xx status
- Prefer `application/json`

Expected error shape:

```json
{
  "error": "Human-readable message"
}
```

## `/clone-voice`

### Request

- Method: `POST`
- Content-Type: `multipart/form-data`

Expected form fields:

- `api_key`
- `name`
- `audio`

Client-side validations before upload:

- allowed file extensions: `wav`, `mp3`, `m4a`
- max size: 10 MB

### Success response

Expected JSON body:

```json
{
  "name": "My Narrator",
  "voice_id": "voice_xxxxx",
  "cost_usd": 3.50
}
```

### Error response

Expected JSON body:

```json
{
  "error": "Human-readable message"
}
```

## `/list-voices`

### Request

- Method: `POST`
- Content-Type: `application/json`

Expected JSON body:

```json
{
  "api_key": "sk-...",
  "page_size": 100
}
```

### Success response

Expected JSON body:

```json
{
  "voices": [
    {
      "voice": "voice_xxxxx",
      "preferred_name": "My Narrator",
      "target_model": "qwen3-tts-vc-2026-01-22",
      "gmt_create": "2026-05-10T12:34:56Z"
    }
  ]
}
```

The frontend reads:

- `voice`
- `preferred_name`
- `target_model`
- `gmt_create`

## `/delete-voice`

### Request

- Method: `POST`
- Content-Type: `application/json`

Expected JSON body:

```json
{
  "api_key": "sk-...",
  "voice_id": "voice_xxxxx"
}
```

### Success response

The current frontend only checks:

- HTTP success status
- absence of `error` in the JSON body

A minimal compatible response would be:

```json
{
  "ok": true
}
```

## Backend implementation guidance

### Minimum viable backend

- receive browser requests on the same origin as the page
- forward authenticated calls to the DashScope / Alibaba endpoints
- normalize all errors into `{ "error": "..." }`
- return audio bytes directly for `/synthesize`
- attach `X-Usage-Chars` and `X-Usage-Cost` headers consistently

### Better production contract

- remove raw API key handling from the browser
- store provider credentials server-side
- issue user sessions or signed job tokens instead of passing provider keys from the page
- validate allowed models and voice IDs server-side
- rate-limit cloning and batch synthesis
- move long-running jobs such as book generation into async queues
- store generated artifacts in object storage and return signed URLs

### Suggested server modules

```text
server/
├── api/
│   ├── synthesize.ts
│   ├── clone-voice.ts
│   ├── list-voices.ts
│   └── delete-voice.ts
├── services/
│   ├── dashscope-client.ts
│   ├── pricing.ts
│   └── usage.ts
├── validation/
│   ├── synthesize-schema.ts
│   └── clone-schema.ts
└── tests/
    ├── api.test.ts
    └── contract.test.ts
```

## Compatibility warnings

- The current frontend assumes immediate audio responses for all synthesize calls.
- The current frontend is not designed for server-side job polling.
- If you change header names or switch to JSON-wrapped audio URLs, the existing browser code will need updates.
