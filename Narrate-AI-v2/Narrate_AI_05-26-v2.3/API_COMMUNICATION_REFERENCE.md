# Narrate:AI API Communication Reference

This file is the canonical menu and dictionary for how this app talks to APIs.

It covers:

- the local app backend routes that exist today
- the upstream Alibaba Cloud / DashScope endpoints those routes wrap
- the request and response patterns modules should follow
- the capabilities we do not wrap yet, but may want to use later

If a future module needs to call an API, start here first.

## Scope

Current app folder:

- `/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3`

Main implementation files:

- [index.html](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/index.html)
- [audiobook-v23.js](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/audiobook-v23.js)
- [server.js](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/server.js)

## Architecture

The app has three communication layers:

1. Browser UI modules call the local backend.
2. The local backend normalizes requests, stores local files, tracks usage, and calls DashScope.
3. DashScope returns JSON metadata or audio URLs, and the backend returns normalized results to the browser.

In practice, most future modules should not call Alibaba directly from the browser. They should call the local backend unless there is a strong reason not to.

## Canonical Helpers

### Browser helper for general app modules

Use `fetchBackend()` in [index.html](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/index.html).

Why:

- it tries multiple backend targets
- it supports file-open fallback cases
- it logs useful diagnostics
- it avoids hard-coding a single origin

Pattern:

```js
const resp = await fetchBackend("/some-route", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
const data = await resp.json();
if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`);
```

### Browser helper for audiobook module

Use `postJson()` in [audiobook-v23.js](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/audiobook-v23.js).

Why:

- it always posts JSON
- it resolves backend-relative `url` fields through `window.NarrateAPI.resolveUrl`
- it throws a normalized error on non-OK responses

### Server helper for upstream HTTP JSON calls

Use `httpRequestJson()` in [server.js](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/server.js).

Why:

- it centralizes HTTPS requests
- it rejects non-JSON remote responses with a readable preview
- it preserves remote status and error payload details

### Server helper for synthesis

Use `qwenSynthesizeToBuffer()` in [server.js](/Users/melophonic/Documents/GitHub/xtrata/Narrate-AI-v2/Narrate_AI_05-26-v2.3/server.js).

Why:

- it builds the correct DashScope synthesis payload
- it supports optional instruction control
- it converts DashScope audio URLs into a returned binary buffer

## Authentication And Region Rules

### API key

DashScope calls use:

- `Authorization: Bearer <DASHSCOPE_API_KEY>`

In the current app, the browser sends the API key to the local backend in request bodies or form data. The backend then adds the Bearer header upstream.

### Region

This app is currently configured for the international endpoint:

- `https://dashscope-intl.aliyuncs.com/api/v1`

If you use China (Beijing) instead, the official docs say the endpoint changes to:

- `https://dashscope.aliyuncs.com/api/v1`

Important:

- Singapore and Beijing API keys are different.
- The same module should not assume one key works in both regions.
- If we ever add region switching, it should be centralized in `server.js`, not scattered across UI modules.

Sources:

- [Speech synthesis API](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-api)
- [Voice cloning user guide](https://www.alibabacloud.com/help/en/model-studio/voice-cloning-user-guide)
- [Voice design user guide](https://www.alibabacloud.com/help/en/model-studio/voice-design-user-guide)

## Response And Error Contract

### Local backend success

Most JSON routes return one of these shapes:

```json
{ "ok": true, ... }
```

or

```json
{ ...dataWithoutOkFlag }
```

Audio synthesis is the exception:

- `POST /synthesize` returns raw audio bytes, not JSON.
- It also sets:
  - `X-Usage-Chars`
  - `X-Usage-Cost`

### Local backend errors

On handled server failures, JSON routes return:

```json
{
  "error": "message",
  "request_id": "req-0001",
  "debug": null,
  "remote": null
}
```

On unknown routes, the backend returns plain text:

```txt
Not found
```

That matters because callers must not blindly assume every failed response is JSON.

### Static file serving

Any real file inside the app root can be served directly by path because `serveStatic()` serves from `ROOT_DIR`.

That includes:

- `/output/chunks/...`
- `/output/chapters/...`
- `/output/titles/...`
- `/output/book/...`
- `/output/packages/...`
- `/qwen3_cloned_voices/...`
- `/qwen3_designed_voices/...`

## Menu: Local Backend Routes Implemented Today

### Health and diagnostics

#### `GET /api/health`

Purpose:

- confirm which backend instance the page is actually talking to

Response:

```json
{
  "ok": true,
  "app": "Narrate AI v2.3",
  "requestId": "req-0001",
  "port": 3000,
  "rootDir": "/abs/path"
}
```

Primary callers:

- app startup health check

### Usage ledger

#### `GET /api/usage-history`

Purpose:

- return the server-side usage ledger for all billable calls that passed through this app

Response:

```json
{
  "ok": true,
  "entries": [ ... ]
}
```

#### `DELETE /api/usage-history`

Purpose:

- clear the server-side usage ledger

Response:

```json
{ "ok": true }
```

### Speech synthesis

#### `POST /synthesize`

Purpose:

- standard single-sample generation
- director-style generation with instructions
- design-lab primary and English samples
- voice demos and style demos

Request body:

```json
{
  "api_key": "sk-...",
  "text": "Hello world",
  "voice": "Cherry or custom voice id",
  "language": "English",
  "model": "qwen3-tts-flash",
  "instructions": "",
  "tracking": {
    "module": "single_sample",
    "display_label": "Cherry",
    "scenario_id": "",
    "scenario_label": "",
    "preset_id": "",
    "settings_tag": ""
  }
}
```

Notes:

- `api_key`, `text`, `voice`, and `model` are required.
- `instructions` activates instruction control on supported models.
- `tracking` is app-defined metadata and should always be included for anything we want to audit later.

Response:

- raw audio bytes

Headers:

- `Content-Type: audio/wav` or the upstream type
- `X-Usage-Chars`
- `X-Usage-Cost`

### Voice cloning

#### `POST /clone-voice`

Purpose:

- create a cloned voice from an uploaded recording

Request:

- `multipart/form-data`

Fields:

- `api_key`
- `name`
- `audio`

Response:

```json
{
  "ok": true,
  "name": "my_voice",
  "voice_id": "voice_xxx",
  "target_model": "qwen3-tts-vc-2026-01-22",
  "cost_usd": 0,
  "local_audio_url": "/qwen3_cloned_voices/..."
}
```

Notes:

- the ledger currently records clone creation as a fixed-count event
- the clone’s source audio is stored locally with a JSON metadata record

#### `POST /list-voices`

Purpose:

- list cloned voices from the account and merge them with local clone records

Request body:

```json
{
  "api_key": "sk-...",
  "page_size": 100
}
```

Response:

```json
{
  "voices": [ ...mergedVoiceRecords ]
}
```

#### `GET /api/local-clones`

Purpose:

- return only locally cached clone records

Response:

```json
{
  "voices": [ ... ]
}
```

#### `POST /delete-voice`

Purpose:

- delete a cloned voice upstream and remove its local record

Request body:

```json
{
  "api_key": "sk-...",
  "voice_id": "voice_xxx"
}
```

Response:

```json
{ "ok": true }
```

### Voice design

#### `POST /design-voice`

Purpose:

- create a designed voice from a text prompt and generate its preview

Request body:

```json
{
  "api_key": "sk-...",
  "voice_prompt": "Describe the target voice",
  "preview_text": "Preview script",
  "preferred_name": "custom_voice",
  "display_name": "Custom Voice",
  "language": "English",
  "target_model": "qwen3-tts-vd-2026-01-26",
  "preset_id": "some_preset"
}
```

Response:

```json
{
  "ok": true,
  "voice_id": "voice_xxx",
  "name": "custom_voice",
  "display_name": "Custom Voice",
  "target_model": "qwen3-tts-vd-2026-01-26",
  "preview_audio_url": "/qwen3_designed_voices/...",
  "preview_response_format": "wav",
  "cost_usd": 0.2
}
```

Notes:

- a local JSON record is created immediately
- preview audio is persisted locally
- `language` is normalized server-side to compact codes like `en`, `fr`, `de`

#### `POST /list-designed-voices`

Purpose:

- list designed voices from the account and merge them with local records

Request body:

```json
{
  "api_key": "sk-...",
  "page_size": 100
}
```

Response:

```json
{
  "voices": [ ...mergedDesignedVoiceRecords ]
}
```

Special behavior:

- if `api_key` is absent, the route returns only local voices

#### `GET /api/local-designed-voices`

Purpose:

- return only locally cached designed voices

Response:

```json
{
  "voices": [ ... ]
}
```

#### `POST /save-designed-sample`

Purpose:

- persist generated design-lab samples after `/synthesize` returns audio

Request body:

```json
{
  "voice_id": "voice_xxx",
  "audio_base64": "...",
  "mode": "native",
  "format": "wav",
  "language": "English",
  "text": "Sample line"
}
```

Response:

```json
{
  "ok": true,
  "voice_id": "voice_xxx",
  "mode": "native",
  "native_sample_audio_url": "/qwen3_designed_voices/...",
  "english_sample_audio_url": "/qwen3_designed_voices/..."
}
```

Notes:

- this route is persistence only
- it does not perform synthesis itself
- billing should be associated with the original `/synthesize` call

#### `POST /delete-designed-voice`

Purpose:

- delete a designed voice upstream if an API key is present
- always delete local metadata and saved audio

Request body:

```json
{
  "api_key": "sk-...",
  "voice_id": "voice_xxx"
}
```

Response:

```json
{ "ok": true }
```

### Audiobook project persistence

#### `GET /api/projects`

Purpose:

- list saved audiobook projects

Response:

- array of project summaries

#### `POST /api/projects`

Purpose:

- save or update an audiobook project payload

Request body:

- complete project JSON object

Response:

```json
{
  "ok": true,
  "id": "book_xxx"
}
```

#### `GET /api/projects/:id`

Purpose:

- load one audiobook project file

Response:

- complete project JSON

#### `DELETE /api/projects/:id`

Purpose:

- delete one audiobook project file

Response:

```json
{ "ok": true }
```

### Audiobook generation and packaging

#### `POST /api/check-cache`

Purpose:

- predict chunk filenames and report whether those audio files already exist

Request body:

```json
{
  "projectId": "book_xxx",
  "projectTitle": "Book Title",
  "language": "English",
  "modelId": "qwen3-tts-flash",
  "chunks": [
    {
      "id": "chunk_1",
      "chapterIndex": 0,
      "chunkIndex": 0,
      "chapterTitle": "Chapter 1",
      "roleLabel": "Narrator",
      "sourceType": "chapter",
      "text": "Chunk text",
      "voiceId": "Cherry",
      "instructions": ""
    }
  ]
}
```

Response:

```json
{
  "chunks": [
    {
      "id": "chunk_1",
      "exists": true,
      "filename": "...wav",
      "url": "/output/chunks/...wav"
    }
  ]
}
```

#### `POST /api/generate-chunk`

Purpose:

- synthesize and store one audiobook chunk

Request body:

```json
{
  "text": "Chunk text",
  "voiceId": "Cherry",
  "apiKey": "sk-...",
  "modelId": "qwen3-tts-flash",
  "projectId": "book_xxx",
  "projectTitle": "Book Title",
  "chapterIndex": 0,
  "chunkIndex": 0,
  "chapterTitle": "Chapter 1",
  "roleLabel": "Narrator",
  "sourceType": "chapter",
  "language": "English",
  "instructions": "",
  "force": false
}
```

Response:

```json
{
  "ok": true,
  "filename": "...wav",
  "url": "/output/chunks/...wav",
  "cached": false
}
```

Notes:

- a cached existing file is reused unless `force` is true
- usage is only logged if a fresh synthesis actually happened

#### `POST /api/merge-chapter`

Purpose:

- concatenate chunk files into one chapter or title-sequence file

Request body:

```json
{
  "projectId": "book_xxx",
  "projectTitle": "Book Title",
  "chapterIndex": 0,
  "chapterTitle": "Chapter 1",
  "filenames": ["chunk1.wav", "chunk2.wav"],
  "isTitle": false,
  "modelId": "qwen3-tts-flash",
  "language": "English",
  "silence": 5,
  "format": "wav"
}
```

Response:

```json
{
  "ok": true,
  "filename": "...wav",
  "url": "/output/chapters/...wav"
}
```

#### `POST /api/merge-book`

Purpose:

- concatenate title sequence and chapter files into a full book file

Request body:

```json
{
  "projectId": "book_xxx",
  "title": "Book Title",
  "language": "English",
  "modelId": "qwen3-tts-flash",
  "chapter_filenames": ["title.wav", "chapter1.wav"],
  "silence": 10,
  "format": "wav"
}
```

Response:

```json
{
  "ok": true,
  "filename": "...wav",
  "url": "/output/book/...wav",
  "sourceFormat": "wav"
}
```

#### `POST /api/book-zip`

Purpose:

- build a ZIP package containing generated chunks, chapter files, full-book files, and the saved project JSON

Request body:

```json
{
  "projectId": "book_xxx",
  "title": "Book Title",
  "language": "English",
  "modelId": "qwen3-tts-flash",
  "chunk_filenames": ["..."],
  "chapter_filenames": ["..."],
  "book_filenames": ["..."]
}
```

Response:

```json
{
  "ok": true,
  "filename": "...zip",
  "url": "/output/packages/...zip"
}
```

## Menu: Upstream DashScope APIs Wrapped Today

The app currently wraps two DashScope HTTP endpoints.

### 1. Non-streaming speech synthesis

Endpoint:

- `POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

Current wrapper:

- `qwenSynthesizeToBuffer()`
- exposed locally through `POST /synthesize`
- also used internally by `POST /api/generate-chunk`

Upstream payload pattern:

```json
{
  "model": "qwen3-tts-flash",
  "input": {
    "text": "Hello world",
    "voice": "Cherry",
    "language_type": "English"
  },
  "parameters": {
    "instructions": "Optional natural-language delivery instructions",
    "optimize_instructions": true
  }
}
```

Current model families used here:

- `qwen3-tts-flash`
- `qwen3-tts-instruct-flash`
- `qwen3-tts-vc-2026-01-22`
- `qwen3-tts-vd-2026-01-26`

Key note:

- the app expects DashScope to return an audio URL in `output.audio.url`
- the backend then downloads the binary before returning it to the browser

Source:

- [Speech synthesis API](https://www.alibabacloud.com/help/en/model-studio/qwen-tts-api)

### 2. Voice customization and management

Endpoint:

- `POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization`

Current wrappers:

- `createClonedVoice()`
- `createDesignedVoice()`
- `listClonedVoices()`
- `listDesignedVoices()`
- `deleteClonedVoice()`
- `deleteDesignedVoice()`

This endpoint is multiplexed by `model` plus `input.action`.

#### Cloned voice create

Payload used now:

```json
{
  "model": "qwen-voice-enrollment",
  "input": {
    "action": "create",
    "target_model": "qwen3-tts-vc-2026-01-22",
    "preferred_name": "my_voice",
    "audio": {
      "data": "data:audio/mpeg;base64,..."
    }
  }
}
```

#### Cloned voice list

Payload used now:

```json
{
  "model": "qwen-voice-enrollment",
  "input": {
    "action": "list",
    "page_size": 100,
    "page_index": 0
  }
}
```

#### Cloned voice delete

Payload used now:

```json
{
  "model": "qwen-voice-enrollment",
  "input": {
    "action": "delete",
    "voice": "voice_xxx"
  }
}
```

#### Designed voice create

Payload used now:

```json
{
  "model": "qwen-voice-design",
  "input": {
    "action": "create",
    "target_model": "qwen3-tts-vd-2026-01-26",
    "voice_prompt": "Describe the desired voice",
    "preview_text": "Preview script",
    "preferred_name": "custom_voice",
    "language": "en"
  },
  "parameters": {
    "sample_rate": 24000,
    "response_format": "wav"
  }
}
```

#### Designed voice list

Payload used now:

```json
{
  "model": "qwen-voice-design",
  "input": {
    "action": "list",
    "page_size": 100,
    "page_index": 0
  }
}
```

#### Designed voice delete

Payload used now:

```json
{
  "model": "qwen-voice-design",
  "input": {
    "action": "delete",
    "voice": "voice_xxx"
  }
}
```

Sources:

- [Voice cloning user guide](https://www.alibabacloud.com/help/en/model-studio/voice-cloning-user-guide)
- [Voice design user guide](https://www.alibabacloud.com/help/en/model-studio/voice-design-user-guide)

## Menu: Upstream Capabilities Not Wrapped Yet

These are relevant future communication paths that should be considered part of the reference even though the current app does not expose them as local routes yet.

Where exact request shapes are not already present in our code, these entries are intentional planning guidance inferred from the official Alibaba documentation, not claims that a local wrapper already exists.

### Real-time speech synthesis over WebSocket

Official capability:

- Qwen realtime TTS supports streaming input and output

Why it matters:

- low-latency preview playback
- conversational or live-reading tools
- progressive generation instead of waiting for a whole file

Likely integration approach:

- add a new server-side proxy route or WebSocket bridge
- keep API keys off the browser where possible
- normalize partial audio chunk handling in one place

Source:

- [Realtime speech synthesis guide](https://www.alibabacloud.com/help/en/model-studio/realtime-tts-user-guide)

### Voice detail lookup / voice metadata inspection

Official docs say custom voices can be queried and managed, including viewing voice details.

Potential use:

- richer voice library screens
- validation of voice-to-model compatibility
- health checks for stale saved voice IDs

Suggested local wrapper:

- `POST /voice-details`

Suggested output:

- normalized voice metadata plus local-record merge result

Sources:

- [Voice cloning user guide](https://www.alibabacloud.com/help/en/model-studio/voice-cloning-user-guide)
- [Voice design user guide](https://www.alibabacloud.com/help/en/model-studio/voice-design-user-guide)

### Region-aware endpoint switching

Potential use:

- support both Singapore and Beijing deployments
- support region-specific model availability

Suggested local wrapper:

- centralize region selection in server configuration
- never scatter `dashscope-intl` vs `dashscope` literals across modules

### Broader model support

The official speech docs list additional models beyond the ones this app currently exposes heavily.

Potential future additions:

- snapshot versions of current models
- legacy `qwen-tts` variants
- realtime variants
- more CosyVoice coverage if needed

Source:

- [Speech synthesis models](https://www.alibabacloud.com/help/en/model-studio/speech-synthesis/)

## Required Metadata For Future Calls

If a future module creates speech or billable assets, it should send structured tracking metadata so the usage ledger and filenames remain meaningful.

Recommended fields:

```json
{
  "tracking": {
    "module": "module_name",
    "display_label": "Human-readable label",
    "scenario_id": "stable_internal_id",
    "scenario_label": "Friendly scenario name",
    "preset_id": "stable_preset_id_if_any",
    "settings_tag": "default_or_custom_variant"
  }
}
```

Guidance:

- `module` should be stable and machine-friendly
- `display_label` should be what the user would recognize
- `preset_id` should be persistent across sessions if a preset concept exists
- `settings_tag` should distinguish default vs custom style choices

## File Persistence Contracts

### Local clone storage

Directory:

- `/qwen3_cloned_voices`

Stored artifacts:

- original uploaded audio copy
- JSON metadata record

### Local designed voice storage

Directory:

- `/qwen3_designed_voices`

Stored artifacts:

- preview audio
- primary sample audio
- English sample audio
- JSON metadata record

### Audiobook outputs

Directories:

- `/output/chunks`
- `/output/chapters`
- `/output/titles`
- `/output/book`
- `/output/packages`
- `/output/projects`

## Decision Rules For Future Modules

### Use the local backend when

- the call needs the API key
- the result should be stored locally
- the result should appear in usage tracking
- the module needs normalized filenames
- the module needs merged local + remote voice views
- the module needs caching

### Direct browser calls are acceptable only when

- there is no secret involved
- no local persistence is needed
- no usage tracking is needed
- no server-side normalization is needed

At the moment, very few speech features meet those conditions.

## Recommended Additions To Keep This Reference Complete

These wrappers are not required immediately, but they would make the API surface more complete and future-proof:

1. `POST /voice-details`
2. `POST /design-voice-preview` as a preview-only path if we ever separate creation from preview generation
3. `POST /synthesize-stream` or a server WebSocket proxy for realtime TTS
4. `GET /api/models` to centralize supported-model metadata in one place
5. `GET /api/voices/catalog` to centralize built-in voice compatibility rules instead of hard-coding them only in the browser

## Change Management

Whenever we add or change an API communication path, update this file in the same change.

Minimum required update:

- add the route or upstream capability
- add request and response shape
- mark whether it is implemented, local-only, remote-only, or planned
- link the calling module if one exists

If this file and the code disagree, the code wins temporarily, and this file should be corrected immediately in the same branch.
