# Campaign Automation Plan (Custom App)

This document captures the automation strategy for a custom multi-platform
campaign tool for Xtrata. It covers platform scope, workflows, approvals,
architecture, and configurable variables.

## Scope (current platforms)
- X / Twitter
- YouTube
- Instagram
- Reddit
- Telegram
- Discord

Optional later additions (if worthwhile):
- Farcaster, LinkedIn, TikTok, Medium/Mirror, Threads

## Goals
- Automate outbound scheduling and cross-posting.
- Centralize assets and copy variants.
- Provide AI-assisted reply drafts with human approval.
- Track campaign metrics across platforms.

## Non-goals (to stay compliant)
- No auto-follow/unfollow.
- No auto-replies without approval.
- No spammy engagement automation.

---

## Platform requirements and constraints

### X / Twitter
- API access requires a paid tier for posting and metrics.
- Rate limits apply per app and per user.
- Best for short posts + media + threads.

### YouTube
- YouTube Data API for uploads and scheduling.
- OAuth required. Refresh tokens must be stored securely.
- Shorts and long-form supported.

### Instagram
- Instagram Graph API requires:
  - Instagram Business or Creator account
  - Connected Facebook Page
- Media upload is a two-step process (container + publish).

### Reddit
- OAuth app, per-subreddit rules and rate limits.
- Subreddits may require manual approval for promotions.

### Telegram
- Bot API via token, can post to channels and groups.
- No official rate limit issues at our current scale.

### Discord
- Bot or webhook posting for announcements.
- Rate limits apply to bots and webhooks.

---

## Core workflow

1) Draft creation
- Write master copy + platform-specific variants.
- Attach media assets or links.

2) Approval
- Posts go into an approval queue before scheduling.

3) Scheduling
- Each platform gets its own schedule window and cadence.

4) Publish
- App publishes via platform API or webhook.

5) Monitor
- App collects metrics and logs.

6) Reply workflow (assisted)
- Inbound replies/mentions pulled into a queue.
- AI drafts responses.
- Human approves before posting.

---

## Configurable variables (per platform)

- Post frequency (min/max per day)
- Time windows (local time)
- Default hashtags / tags
- Allowed media types and size limits
- Default CTA links
- Thread length limits (X)
- Caption length limits (IG)
- Auto-crop templates (square, landscape, vertical)

---

## Feature set (MVP)

1) Post queue
- Draft -> approved -> scheduled -> published

2) Asset manager
- Auto-resize and format conversion per platform

3) Platform adapters
- OAuth handling and posting logic

4) Reply inbox
- Pull mentions + comments
- Draft AI responses, approve before posting

5) Metrics dashboard
- Basic reach, engagement, CTR, video watch stats

---

## Architecture overview

- Frontend: React dashboard (queue, approvals, calendar)
- Backend: Node/Express or Next.js API routes
- DB: Postgres (drafts, assets, schedules, replies)
- Storage: S3-compatible for media assets
- AI: OpenAI or local LLM for reply drafting
- Jobs: Queue worker for scheduled posts (BullMQ/Redis)

---

## Data model (minimum)

- accounts
  - platform, auth_token, refresh_token, status
- posts
  - master_copy, platform_copy, status, scheduled_at
- assets
  - type, platform_variants, storage_url
- replies
  - platform, message, draft_response, status
- metrics
  - platform, impressions, clicks, engagement

---

## Compliance and safety

- Rate limit enforcement per platform.
- Human approval required for all replies.
- Respect subreddit rules and platform policies.
- Maintain an audit log of all outbound posts.

---

## Implementation phases

Phase 1: Core scheduling + publishing
- Drafts, approvals, scheduler, X + Discord + Telegram

Phase 2: Media + video uploads
- YouTube and Instagram integration
- Asset resize pipeline

Phase 3: Reply inbox + AI drafts
- Mention ingestion, drafting, approvals

Phase 4: Metrics + reporting
- Unified dashboard and weekly reports

---

## No-API mode

If APIs are not available, use the browser-based workflow in:
`Launch-Campaign/08-no-api-automation.md`.
