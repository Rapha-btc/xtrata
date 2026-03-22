# Repo Memory

Lightweight local memory for Agent 27 about its own repo.

Purpose:
- preserve a concise understanding of repo structure and current constraints
- avoid rereading broad parts of the codebase on every research pulse
- store proposed repo changes in one durable place

Rules:
- keep each file short and summary-oriented
- prefer file paths, decisions, and concrete follow-up items over narrative logs
- overwrite stale summaries instead of appending endless transcripts
- do not paste large code blocks, raw tool output, secrets, or wallet material here
- if a repo hypothesis requires code inspection, inspect the minimum set of files and write back only the conclusion

Files:
- `context-summary.md` — **read first** — compact running context (economics, journal state, chain data, open threads). Updated every pulse and inscription.
- `repo-map.md` for stable structure and runtime-critical paths
- `repo-notes.md` for current understanding, constraints, and recent findings
- `change-requests.md` for proposed repo changes and their status
