# V12 Audiobook Review And Narrate-AI Module Plan

## Executive summary

`V12.0-Original-Eleven-Labs-powered-app` is a real audiobook workflow, not just a TTS demo. It already has:

- chapter parsing
- deterministic chunking
- dual-voice segment alternation
- chunk-level cache reuse
- chapter merge
- full-book merge
- autosaved project snapshots
- recovery from existing chunk audio

Those are the right primitives for full-manuscript generation. The main limitation is that V12 is optimized for:

- structured chaptered books
- single-voice narration
- dual-voice POV books with explicit delimiters or strong chapter-label hints

It is not a general multi-character dialogue parser. Narrate-AI should borrow the workflow architecture, but not copy the parser model unchanged.

## Review of V12

### What V12 does well

### 1. It treats a book as a persistent project, not a single request

V12 stores chapters, chunk state, manuscript text, voice assignments, merge settings, and output references in a project payload on the server. That is the biggest difference from the current Narrate-AI prototype.

Relevant code:

- project state shape: `src/frontend/js/script.js:7-39`
- autosave payload: `src/frontend/js/script.js:623-639`
- queued autosave: `src/frontend/js/script.js:657-672`
- saved/ghost project listing and recovery: `src/backend/server.js:251-427`

Why it matters for Narrate-AI:

- long books need resumability
- generation should survive refreshes and partial failures
- later merges should not require re-synthesizing every chunk

### 2. It has the correct generation pipeline for audiobooks

The V12 backend stores:

- chunk audio under `output/chunks/`
- merged chapter audio under `output/chapters/`
- titles audio under `output/titles/`
- final book audio under `output/book/`

Relevant code:

- output directories: `src/backend/server.js:13-25`
- deterministic cached chunk naming: `src/backend/server.js:552-563`
- chapter merge: `src/backend/server.js:582-618`
- full-book merge: `src/backend/server.js:621-673`
- front-end full run orchestration: `src/frontend/js/script.js:1280-1319`

Why it matters for Narrate-AI:

- it enables chunk reuse
- it decouples parsing from synthesis
- it gives you chapter-level and book-level recoverability

### 3. Its chapter parsing is useful and worth porting

V12 detects chapter headings using a multilingual regex and also treats preamble text as a Titles section.

Relevant code:

- chapter-heading regex construction: `src/frontend/js/script.js:168-200`
- chapter analysis loop: `src/frontend/js/script.js:978-1095`
- project metadata detection from preamble: `src/frontend/js/script.js:440-484`

Why it matters for Narrate-AI:

- this is a good base for book ingestion
- it already improves on the current Narrate-AI book UI, which has no implementation behind it

### 4. Its chunking strategy is practical, though basic

V12 splits long text by preferring sentence-ending punctuation within the last 25 percent of the allowed window, then falling back to spaces or newlines.

Relevant code:

- chunk-size clamp: `src/frontend/js/script.js:928`
- chunker: `src/frontend/js/script.js:930-940`

Why it matters for Narrate-AI:

- it avoids many mid-sentence cuts
- it is easy to port
- it is still too shallow for premium audiobook quality, so it should be upgraded rather than copied blindly

### 5. It has usable dual-voice heuristics

V12 supports:

- a two-voice project mode
- a configurable delimiter token
- explicit chapter-start markers like `[[voice1]]`
- starting voice detection from chapter title or opening label
- alternating voice blocks after each delimiter

Relevant code:

- dual-voice state model: `src/frontend/js/script.js:10-18`
- voice candidate/alias handling: `src/frontend/js/script.js:212-344`
- explicit voice marker detection: `src/frontend/js/script.js:346-366`
- starting-voice inference: `src/frontend/js/script.js:507-529`
- dual-voice block segmentation: `src/frontend/js/script.js:393-438`
- parser wiring into chapter analysis: `src/frontend/js/script.js:1037-1063`

Why it matters for Narrate-AI:

- this is the clearest reusable parsing logic in V12
- it works for alternating POV or manually marked books

### Where V12 falls short

### [P1] It is not a real multi-character manuscript parser

V12 only models `single` and `dual` narration modes, and its parsing logic only alternates between two voice slots.

Relevant code:

- `mode: 'single'` or `'dual'`: `src/frontend/js/script.js:10-18`
- only two voice slots: `src/frontend/js/script.js:13-14`
- dual parser toggles `currentVoice = (currentVoice + 1) % 2`: `src/frontend/js/script.js:402-434`

Impact:

- it is fine for two-POV books
- it is not suitable for ensemble fiction, scripts, or books with more than two speaking roles unless the user manually flattens the manuscript into alternating blocks

### [P1] Speaker attribution is delimiter-based, not dialogue-aware

V12 does not infer speakers from quotation marks, dialogue verbs, or named dialogue turns. It relies on:

- explicit token splits such as `* * *`
- title/opening-line hints
- explicit `[[voice1]]` / `[[voice2]]` markers

Relevant code:

- token-based splitting: `src/frontend/js/script.js:393-400`
- explicit start-voice markers: `src/frontend/js/script.js:346-366`
- starting voice inference from title/opening line: `src/frontend/js/script.js:507-529`

Impact:

- it cannot reliably convert a normal multi-speaker novel into per-character narration
- it is best understood as a structured POV parser, not a dialogue parser

### [P2] The chunker is sentence-aware but not structure-aware

V12’s chunker uses punctuation and whitespace heuristics only.

Relevant code:

- `splitTextIntoChunks`: `src/frontend/js/script.js:930-940`

Impact:

- it can still split across paragraph boundaries, quote-group boundaries, list structures, and semantic scene beats
- it does not preserve paragraph grouping explicitly
- it does not distinguish narration paragraphs from dialogue paragraphs

### [P2] The provider logic is tightly coupled to the workflow

The storage and workflow are good, but the backend generation path is strongly ElevenLabs-specific.

Relevant code:

- ElevenLabs request path: `src/backend/server.js:129-157`
- backend generation endpoint: `src/backend/server.js:540-579`

Impact:

- Narrate-AI should port the workflow architecture, but introduce a provider abstraction instead of embedding Qwen-specific and ElevenLabs-specific logic directly into the same module

## Gap against current Narrate-AI

Current Narrate-AI has a Book / Script Analyser UI shell, but not the actual implementation.

Relevant code in `Narrate_AI_05-26-v2.2/index.html`:

- book UI controls: `1409-1457`
- missing handlers discovered in review: `bookAnalyse`, `bookGenerate`, `bookCancel`, `bookDownloadZip`, `bookDownloadCombined`

Current Narrate-AI also lacks:

- project persistence
- chunk cache
- chapter merge and book merge pipeline
- server-side output storage
- real manuscript segmentation

What Narrate-AI already has that can still be reused:

- built-in voice catalogue
- provider-side synth endpoint pattern
- clone-voice UI concepts
- language auto-detection
- cost-estimation patterns

## Recommendation: add a dedicated Audiobook module, not more inline page logic

Do not implement this as more functions inside the existing `index.html`.

Add a separate audiobook module with:

- a provider-agnostic backend pipeline
- a reusable manuscript parser
- a persistent project model
- a dedicated UI state machine for long-form generation

## Proposed module architecture

```text
Narrate-AI-v2/
├── audiobook/
│   ├── parser/
│   │   ├── chapter-detector.js
│   │   ├── structure-normalizer.js
│   │   ├── speaker-attribution.js
│   │   ├── segmenter.js
│   │   └── chunker.js
│   ├── pipeline/
│   │   ├── analyze-project.js
│   │   ├── generate-chunks.js
│   │   ├── merge-chapter.js
│   │   ├── merge-book.js
│   │   └── recover-project.js
│   ├── providers/
│   │   ├── qwen.js
│   │   └── elevenlabs.js
│   ├── storage/
│   │   ├── project-store.js
│   │   ├── artifact-store.js
│   │   └── cache-key.js
│   └── models/
│       └── project-schema.js
└── web/
    └── audiobook-ui.js
```

## Recommended project data model

```json
{
  "id": "book_abc123",
  "title": "My Book",
  "author": "Author Name",
  "manuscript": "raw manuscript text",
  "language": "English",
  "settings": {
    "mode": "single|dual_pov|multi_cast|script",
    "chunkMaxChars": 1200,
    "chunkMinChars": 250,
    "respectParagraphs": true,
    "respectSentences": true,
    "voiceSwitchToken": "* * *",
    "silenceBetweenChunksSec": 0.0,
    "silenceBetweenChaptersSec": 1.0,
    "provider": "qwen",
    "model": "qwen3-tts-instruct-flash",
    "forceRegenerate": false,
    "forceMerge": false
  },
  "roles": [
    { "id": "narrator", "label": "Narrator", "voiceId": "Cherry" },
    { "id": "voice_1", "label": "Hero", "voiceId": "Ethan" },
    { "id": "voice_2", "label": "Villain", "voiceId": "Vincent" }
  ],
  "chapters": [
    {
      "index": 0,
      "title": "Prologue",
      "audioUrl": null,
      "segments": [
        {
          "index": 0,
          "speakerRoleId": "narrator",
          "sourceType": "narration|dialogue|header",
          "text": "Chapter header or paragraph text",
          "chunks": [
            {
              "index": 0,
              "text": "safe chunk text",
              "status": "pending|processing|done|error",
              "cacheKey": "hash",
              "audioUrl": null,
              "filename": null
            }
          ]
        }
      ]
    }
  ]
}
```

## Recommended parsing pipeline for Narrate-AI

### Phase 1. Normalize

- normalize line endings
- collapse malformed pasted artifacts
- preserve paragraph breaks
- preserve chapter headings before segmentation

### Phase 2. Detect document structure

- detect title page and preamble
- detect chapters, prologue, epilogue, and optional part headings
- keep paragraph boundaries as first-class structure

### Phase 3. Assign narration roles

Support four parsing modes:

- `single`
- `dual_pov`
- `multi_cast_marked`
- `script`

Suggested behavior:

- `single`: all paragraphs go to narrator role
- `dual_pov`: port V12 starting-voice and token logic
- `multi_cast_marked`: parse explicit markers like `[[Hero]]` or `Hero:` at paragraph start
- `script`: parse screenplay- or play-like speaker blocks

Important point:

- do not promise general “AI dialogue attribution” in v1
- require explicit structure for multi-cast books unless a later experimental mode is added

### Phase 4. Convert segments into chunks

Upgrade beyond V12’s chunker:

1. split by chapter
2. split by paragraph
3. split oversized paragraphs by sentence
4. only if still too large, split by clause or whitespace fallback

Rules:

- never split in the middle of a sentence if avoidable
- prefer keeping short adjacent sentences together
- preserve paragraph ordering and role assignment
- keep chapter headers as dedicated short segments

### Phase 5. Cache and generation planning

- compute deterministic cache key from provider + model + voice + normalized text + synthesis instructions
- check artifact store before generation
- compute cost estimate from planned billable characters
- present generation plan before full run

### Phase 6. Generate, merge, and recover

- generate chunk audio sequentially or with conservative concurrency
- merge chunks into chapter files
- merge chapter files into full-book output
- support rebuild-from-existing-audio without regenerating text

## Recommended UI settings to add to Narrate-AI

These are the settings worth porting and expanding:

- `Narration mode`
- `Primary narrator voice`
- `Secondary POV voice`
- `Additional cast map`
- `Voice switch token`
- `Max chars per chunk`
- `Min chars per chunk`
- `Silence between chunks`
- `Silence between chapters`
- `Provider model`
- `Force regenerate`
- `Force merge incomplete chapter`
- `Resume from cache`
- `Project notes`
- `Download mode: chunks / chapters / full book`

Additional settings V12 does not have but Narrate-AI should:

- `Paragraph-preserving mode`
- `Dialogue-marker pattern`
- `Chapter heading profile`
- `Speaker label style`
- `Chunk preview before generation`
- `Per-role synthesis instructions`
- `Normalize smart quotes / OCR cleanup`

## Proposed backend API for Narrate-AI

Use a separate long-form API surface instead of overloading `/synthesize`.

```text
POST /api/audiobook/analyze
POST /api/audiobook/check-cache
POST /api/audiobook/generate-chunk
POST /api/audiobook/merge-chapter
POST /api/audiobook/merge-book
GET  /api/audiobook/projects
POST /api/audiobook/projects
GET  /api/audiobook/projects/:id
PATCH /api/audiobook/projects/:id
DELETE /api/audiobook/projects/:id
POST /api/audiobook/projects/:id/recover
```

## Implementation strategy for Narrate-AI

### Phase 1. Replace the current book UI shell with real analysis

Implement the handlers behind the existing book controls in `Narrate_AI_05-26-v2.2/index.html` and move their logic into dedicated JS modules.

Initial scope:

- chapter detection
- paragraph-aware chunking
- single-voice full-book generation

### Phase 2. Add persistent project storage and output directories

Borrow V12’s artifact model:

- `output/chunks/`
- `output/chapters/`
- `output/book/`
- `output/projects/`

Required additions:

- deterministic cache keys
- per-project JSON manifests
- rebuild-from-existing-audio path

### Phase 3. Port only the safe subset of V12 multi-voice logic

Port first:

- chapter-start voice detection
- explicit `[[voice1]]` / `[[voice2]]`
- configurable switch token
- per-role alias matching

Do not port as-is for v1:

- the assumption that all multi-voice books alternate between exactly two voices

Instead:

- keep `dual_pov` as a supported mode
- add `multi_cast_marked` as a separate, explicit-input mode

### Phase 4. Add a better chunker than V12

Narrate-AI should improve the V12 chunker by:

- respecting paragraph boundaries before sentence boundaries
- keeping headings isolated
- keeping dialogue blocks intact when possible
- using a `targetRange` rather than one hard `max` threshold

### Phase 5. Add recovery and resumability

Port these V12 ideas directly:

- chunk cache lookup
- autosaved project snapshots
- rebuild book from existing chunk audio
- recovered project listing from orphaned audio

## Suggested initial milestone

If the goal is to bring audiobook capability into Narrate-AI quickly, the best first deliverable is:

1. single-voice full-manuscript analysis
2. chapter detection
3. paragraph and sentence aware chunking
4. chunk cache
5. chapter merge
6. full-book merge
7. saved project manifests

Then add:

8. `dual_pov` mode using the V12 token and starting-voice heuristics
9. `multi_cast_marked` mode for explicit speaker labels

That sequence gives you a reliable audiobook pipeline without pretending to solve full dialogue attribution up front.

## Bottom line

V12 is a strong reference for workflow and storage, but only a partial reference for parsing.

Narrate-AI should copy:

- project persistence
- deterministic chunk caching
- chapter/book merge flow
- resumable generation
- chapter detection basics
- explicit two-voice POV support

Narrate-AI should not copy unchanged:

- the exact parser assumption that multi-voice means alternating two voices
- the flat punctuation-only chunking strategy
- the provider-specific backend structure

The right path is to build a new audiobook module in Narrate-AI that uses V12 as the workflow template and upgrades the parser into a hierarchical manuscript processor: chapter -> paragraph -> segment -> chunk -> chapter audio -> full book audio.
