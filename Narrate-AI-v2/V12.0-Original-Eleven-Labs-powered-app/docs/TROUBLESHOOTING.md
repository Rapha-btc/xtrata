# Troubleshooting

## Server does not start

- Make sure Node.js is installed and available on PATH.
- Run `node src/backend/server.js` from the project root.
- If port 3000 is in use, stop the other process or change `PORT` in `src/backend/server.js`.

## FFmpeg not found

Symptoms:
- Merge errors in the UI
- Server logs show "FFmpeg exited" or spawn errors

Fix:
- Install FFmpeg and ensure `ffmpeg` is on PATH.
- On macOS with Homebrew: `brew install ffmpeg`

## ElevenLabs connection fails

- Verify the API key is correct.
- Check your account usage and rate limits.
- Try again after a short delay if you see 429 or 5xx errors.

## No chapters detected

- Ensure chapter headings are on their own line.
- Use headings like "Chapter 1" or "# Chapter 1".
- Supported languages include English, German, Spanish, French, Italian, Portuguese, Dutch, Polish, Russian, Turkish, Finnish, Hungarian, Czech, Greek, Indonesian.

## Audio plays for some segments but not others

- Check that all segments have generated audio (status "done").
- Use the "Regenerate" button on the specific segment or chapter.
- If using standard browser voices, be aware quality and availability vary by OS.

## Generation stops early

- Check the session budget limit in the UI.
- Look at the server console for errors.
- Try smaller chunk sizes if the text is very large.

## Projects do not appear

- Saved projects live under `output/projects/`.
- If you deleted the JSON file, the UI may still recover a "ghost" project from existing audio chunks.

## Cost estimate looks wrong

- Estimates are approximate and based on a fixed multiplier in the UI.
- Cached segments are free and should not incur cost.

## Stuck or stale UI state

- Refresh the page to reload state.
- Clear localStorage keys `ab_api_el` and `ab_manuscript` to reset stored API key and draft text.
