# Audiobook Studio Gen-3 (V12.0)

A local, browser-based studio for turning manuscripts into audiobook audio using ElevenLabs voices. It parses chapters, splits text into safe segments, caches generated audio, and merges chapters into a full-book MP3.

## Quick start

1) Install prerequisites
- Node.js (for the local server)
- FFmpeg (must be available on your PATH)
- An ElevenLabs API key (for premium voices)

2) Start the server
```bash
node src/backend/server.js
```

3) Open the app
- http://localhost:3000

## Core workflow

1) Connections tab: enter your ElevenLabs API key and connect.
2) Project tab: choose narration mode (single or dual), select voices, and set chunk size / silence / budget.
3) Paste manuscript text and click "Analyze & Parse".
4) Review the timeline, then click "Generate Audio".
5) Download the full book MP3 when generation is complete.

## Output locations

Generated content is stored under `output/` (created automatically):
- `output/chunks/` individual audio segments
- `output/chapters/` merged chapter MP3s
- `output/titles/` merged title section MP3s
- `output/book/` merged full book MP3s
- `output/projects/` saved project JSON files
- `output/temp/` temp files (silence clips, concat lists)

## Documentation

- `docs/USER_GUIDE.md` - end-user instructions and text formatting guidance
- `docs/TROUBLESHOOTING.md` - common issues and fixes
- `docs/API_REFERENCE.md` - backend endpoints and payloads
- `docs/DEVELOPER_GUIDE.md` - architecture and development notes

## Notes

- The UI stores the ElevenLabs key and manuscript draft in your browser localStorage.
- Cost estimates are approximate and based on the app's built-in pricing multiplier.
- This project is a local server. Do not expose it to the public internet without adding authentication and input hardening.
