# No-API Automation Strategy (Browser-Based)

This plan assumes **no platform APIs**. We rely on browser-based workflows
with your existing logged-in sessions. The goal is **assistive automation**
that increases speed without violating platform rules.

## Important notes
- Pure browser automation (full auto-posting) is brittle and can violate
  platform policies. Use human confirmation for every post.
- We can automate drafting, asset prep, scheduling, and copy flow.
- We avoid auto-replies and auto-engagement.

---

## Core approach (recommended)

### 1) Local Campaign Console
A local web app that manages:
- Drafts and per-platform variants
- Assets and required crops
- Scheduling calendar
- Post runner (step-by-step posting)

### 2) Post Runner (guided posting)
For each post:
- Button: **Copy copy to clipboard**
- Button: **Open platform compose page**
- Shows the exact asset to upload
- Shows post text and tags
- Requires **human confirm** before clicking "Post"

This keeps us compliant while saving 70-80% of effort.

---

## What can still be automated safely

### Copy + asset workflow
- Pre-generate platform variants (length, hashtags)
- Auto-resize/crop assets into platform folders
- Attach the correct asset to each post step

### Compose links (when supported)
- X: intent tweet URL (prefills text)
- Reddit: /submit with title + text params
- Telegram: share link (prefills text)

Platforms with limited/blocked prefill:
- Instagram (no official web prefill)
- Discord (no official prefill)
- YouTube (upload must be manual)

---

## Optional micro-automation (semi-automated)

We can add **OS-level helpers** that:
- Bring the browser tab to front
- Paste the copied text
- Highlight where to click

Examples:
- macOS Shortcuts or AppleScript
- Keyboard Maestro (hotkeys for paste + next)

**Still requires human confirmation**.

---

## Platform-specific guidance

### X / Twitter
- Use intent URLs to prefill text.
- Upload media manually.
- Thread support: step-by-step runner for each tweet.

### Instagram
- Manual upload + paste from clipboard.
- Provide exact caption + hashtags.

### YouTube
- Manual upload.
- Provide title, description, tags, and thumbnail in runner.

### Reddit
- Use submit URLs when possible.
- Always check subreddit rules.

### Discord
- Manual paste into announcement channel.
- Optionally use webhook only if allowed later.

### Telegram
- Manual paste into channel.
- Share link can prefill text when used.

---

## Compliance safeguards
- No auto-posting without confirmation.
- Throttle pace (min 60-90 seconds between posts).
- Human review for every reply draft.

---

## Proposed build phases (no API)

**Phase 1: Draft + asset console**
- Drafts, scheduling, asset prep folders

**Phase 2: Post Runner**
- Step-by-step post flow with copy + open buttons

**Phase 3: Assisted replies**
- Pull in replies manually + AI draft responses
- Approval-only workflow

---

## Next decisions

1) Which platforms in MVP (suggest: X, Discord, Telegram)?
2) Do you want macOS hotkey helpers or just a web console?
3) Confirm if we will ever use APIs later (optional upgrade path).
