# Narrate AI v2 Documentation

This repository currently contains a single-file frontend prototype for a Qwen3 TTS demo. The working app lives in `Narrate_AI_05-26-v2.2/index.html`; the other Markdown files in that folder are captured Alibaba Cloud reference material.

## Current status

- Frontend shape: one static HTML file with embedded CSS and JavaScript.
- Implemented browser features: single-pass TTS, voice previews, demo mode, usage tracking, cloned-voice management UI, and language auto-detection.
- Required backend endpoints: `/synthesize`, `/clone-voice`, `/list-voices`, `/delete-voice`.
- Built-in voices: 48.
- External runtime dependencies: `lamejs` from jsDelivr for MP3 export and `JSZip` from jsDelivr for ZIP export.
- Storage used in browser: `localStorage` keys `qwen3tts_history` and `qwen3tts_skip_autoload`.
- Known gap: the repository does not include the backend/API layer that the frontend calls.
- Known gap: the Book / Script Analyser and Event Log render UI controls, but the corresponding JavaScript handlers are not implemented.

## Document map

- [Current Implementation](./current-implementation.md): source layout, feature inventory, state model, and runtime behavior.
- [Backend Contract](./backend-contract.md): inferred API contract from the frontend code and implementation guidance for the missing server layer.
- [Code Review](./code-review.md): review findings with severity, impact, and references into `index.html`.
- [Upgrades and Enhancements](./upgrades-and-enhancements.md): a prioritized stabilization and modernization roadmap.
- [V12 Audiobook Review And Module Plan](./v12-audiobook-review-and-module-plan.md): review of the reference ElevenLabs audiobook app and a concrete module design for bringing full-manuscript automation into Narrate-AI.

## Repository inventory

```text
Narrate-AI-v2/
├── docs/
│   ├── README.md
│   ├── current-implementation.md
│   ├── backend-contract.md
│   ├── code-review.md
│   ├── upgrades-and-enhancements.md
│   └── v12-audiobook-review-and-module-plan.md
└── Narrate_AI_05-26-v2.2/
    ├── index.html
    ├── www.alibabacloud.com_help_en_model-studio_qwen-tts_1778413805261.md
    ├── www.alibabacloud.com_help_en_model-studio_qwen-tts-voice-cloning_1778414145241.md
    ├── www.alibabacloud.com_help_en_model-studio_qwen-tts_section-request.md
    ├── www.alibabacloud.com_help_en_model-studio_qwen-tts_section-request_1778415324138.md
    └── www.alibabacloud.com_help_en_model-studio_qwen-tts_section-voices.md
```

## Recommended reading order

1. Start with [Current Implementation](./current-implementation.md).
2. Read [Code Review](./code-review.md) for the concrete issues in the current prototype.
3. Use [Backend Contract](./backend-contract.md) if you plan to make the app actually runnable.
4. Use [Upgrades and Enhancements](./upgrades-and-enhancements.md) as the implementation roadmap.
