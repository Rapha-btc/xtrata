# OpenAI-Only Migration Plan

## Goal

Replace the current Claude-centered Twitter orchestrator with a cheaper, rules-first, OpenAI-only pipeline that keeps the same core outcomes:

- find relevant X/Twitter posts and accounts
- shortlist engagement opportunities
- draft a small number of replies
- maintain logs and cooldowns
- support manual approval before posting

The target system should reduce model usage by making code handle collection, filtering, state, and reporting. The model should only score already-filtered posts and optionally draft the final 1 to 3 replies.

---

## Current State Summary

The current app is a single-script orchestrator in [orchestrator.js](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/orchestrator.js) with these responsibilities mixed together:

- governance file loading
- runtime state management
- market fetches
- thread scoring
- follow scoring
- reply drafting
- standalone tweet drafting
- report writing
- extension instruction generation
- log mutation

The main cost and maintenance problems are:

1. The system still uses models for low-value tasks.
   - follow scoring
   - report writing
   - routine tweet drafting

2. Runtime state is spread across markdown and log files.
   - `twitter-diversity-rules.md`
   - `twitter-mode.md`
   - `posted-threads-log.json`
   - `followed_accounts_log.txt`
   - `follow_run_log.txt`
   - `pending-improvements.md`

3. Collection and execution are tightly coupled through one extension instruction bundle.

4. The orchestrator assumes a base directory outside the repo unless `XTRATA_BASE_DIR` is set, which makes local execution brittle.

5. The schedule is too frequent for the value of the work being done.

---

## Target Architecture

### Principles

- Rules first, model second
- Structured state, not markdown state
- Batch scoring only
- Draft only the top few items
- Manual approval by default
- Collection separate from execution

### High-Level Flow

1. Collect raw candidates
2. Pre-filter in code
3. Score filtered posts with a cheap OpenAI model
4. Draft replies only for top-ranked items
5. Build digest in code
6. Approve manually
7. Execute only approved actions

### Recommended Runtime

- Scheduler: local cron or launchd first
- Language: Node.js
- Storage: SQLite
- Model provider: OpenAI only
- Posting mode: manual approval first

Do not move to GitHub Actions until collection and posting no longer depend on the local browser extension.

---

## Target Folder Structure

```text
Xtrata Twitter Promotion/
  src/
    cli/
      run-collect.js
      run-prefilter.js
      run-score.js
      run-draft.js
      run-digest.js
      run-execute-approved.js
      run-all.js
    lib/
      db.js
      paths.js
      config.js
      mode.js
      filters.js
      normalization.js
      scoring.js
      drafting.js
      digest.js
      extension-bridge.js
      state-store.js
  config/
    mode.json
    accounts.json
    keywords.json
    sources.json
    filters.json
    tone.json
  prompts/
    score-posts.txt
    draft-replies.txt
  state/
    twitter.db
  output/
    runs/
      2026-03-31T08-00-00Z/
        raw-posts.json
        raw-accounts.json
        filtered-posts.json
        scored-posts.json
        top-posts.json
        drafts.json
        digest.md
        approved-actions.json
        execution-results.json
  reports/
    daily/
  archive/
    legacy/
      tweet-activity-*.md
      follow_run_log.txt
      posted-threads-log.json
      followed_accounts_log.txt
```

---

## Target Responsibilities By Module

### `src/cli/run-collect.js`

Purpose:

- trigger the extension collection step only
- normalize raw post/account payloads
- write run-scoped raw files

Inputs:

- `config/accounts.json`
- `config/keywords.json`
- `config/sources.json`
- browser extension output

Outputs:

- `output/runs/<run-id>/raw-posts.json`
- `output/runs/<run-id>/raw-accounts.json`

Notes:

- no model calls
- no reply generation
- no execution actions

### `src/cli/run-prefilter.js`

Purpose:

- remove junk before any model call

Inputs:

- raw posts/accounts
- mode config
- database state
- filter config

Outputs:

- `filtered-posts.json`
- `filtered-accounts.json`

Rules to implement in code:

- maximum post age 24h
- English only if language is available
- no reposts unless priority account
- no duplicate authors in same run
- skip authors replied to within cooldown window
- skip accounts followed recently
- minimum text length
- minimum relevance threshold by account stats
- spam and giveaway rejection
- hard cap on filtered batch size

### `src/cli/run-score.js`

Purpose:

- batch-score filtered posts with a cheap OpenAI model

Inputs:

- `filtered-posts.json`
- compact mode context
- topic rules

Outputs:

- `scored-posts.json`
- `top-posts.json`

Model contract:

- JSON only
- batched scoring
- no prose
- no explanations

### `src/cli/run-draft.js`

Purpose:

- draft replies only for the top N posts

Inputs:

- `top-posts.json`
- `config/tone.json`
- minimal Xtrata context

Outputs:

- `drafts.json`

Rules:

- default top 3
- max 220 chars
- natural tone
- no hashtags unless necessary
- no emojis unless natural
- no forced pitch

### `src/cli/run-digest.js`

Purpose:

- build digest in code, not with a model

Inputs:

- scored posts
- drafts
- follow suggestions
- execution results from prior run

Outputs:

- `digest.md`
- optional `digest.json`

Digest contents:

- best opportunities
- drafts
- optional likes
- optional quote-post idea
- run metrics
- errors

### `src/cli/run-execute-approved.js`

Purpose:

- send approved actions only to the browser extension

Inputs:

- `approved-actions.json`

Outputs:

- `execution-results.json`
- DB updates

Rules:

- no auto-post unless explicitly enabled
- no collection logic in this stage
- no model calls

### `src/cli/run-all.js`

Purpose:

- orchestrate stages in sequence

Default sequence:

1. collect
2. prefilter
3. score
4. draft
5. digest

Execution should be separate and manual.

---

## Config Migration

### Replace `twitter-mode.md` with `config/mode.json`

Current file:

- [twitter-mode.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/twitter-mode.md)

Target shape:

```json
{
  "mode": "promotional-specific",
  "promo_subject": "DYLE0415",
  "promo_end_date": "2026-04-06",
  "reply_target": 3,
  "like_target": 35,
  "follow_target": 15,
  "standalone_tweet_enabled": false,
  "manual_approval_required": true
}
```

Notes:

- move all runtime switches into JSON
- remove prose-heavy mode descriptions from runtime inputs
- keep a human-facing guide in README if needed

### Replace `twitter-diversity-rules.md` with structured config

Current file:

- [twitter-diversity-rules.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/twitter-diversity-rules.md)

Split into:

- `config/filters.json`
- `config/keywords.json`
- `config/sources.json`
- DB tables for cooldowns, retweets, follows, and prior replies

Suggested `filters.json`:

```json
{
  "reply_cooldown_days": 14,
  "follow_cooldown_days": 7,
  "max_post_age_hours": 24,
  "min_post_length": 40,
  "max_posts_for_scoring": 30,
  "max_posts_per_author_per_run": 1,
  "skip_reposts": true,
  "allow_priority_account_reposts": true,
  "noise_handles": [
    "thesbtc",
    "econjaredb"
  ],
  "bot_handle_patterns": [
    "^[A-Z][a-z]+[A-Z][a-z]+\\.(org|net|app|io)$"
  ]
}
```

Suggested `keywords.json`:

```json
{
  "priority_keywords": [
    "onchain art",
    "bitcoin art",
    "stacks nft",
    "ordinals",
    "metadata",
    "ipfs",
    "link rot",
    "digital permanence",
    "fully onchain",
    "creator royalties",
    "minting on stacks"
  ]
}
```

Suggested `sources.json`:

```json
{
  "priority_accounts": [
    "NOXtoshi",
    "prrfbeauty",
    "RabbitCartel",
    "hirosystems",
    "ArkadikoFinance",
    "ZestProtocol",
    "aibtcdev"
  ],
  "follow_sources": [
    {
      "handle": "NOXtoshi",
      "category": "nft-artist",
      "quality": "high",
      "enabled": true
    }
  ]
}
```

### Add `config/tone.json`

```json
{
  "voice": [
    "smart",
    "friendly",
    "credible",
    "not pushy"
  ],
  "avoid": [
    "fake excitement",
    "cliches",
    "generic praise",
    "forced mention of xtrata"
  ],
  "reply_max_chars": 220,
  "hashtags": "avoid",
  "emojis": "avoid"
}
```

---

## State Migration

### Replace flat files with SQLite

Target database: `state/twitter.db`

Tables:

#### `runs`

- `id`
- `started_at`
- `finished_at`
- `mode`
- `status`
- `posts_collected`
- `posts_filtered`
- `posts_scored`
- `drafts_created`
- `likes_executed`
- `follows_executed`
- `replies_executed`
- `errors_json`

#### `posts`

- `post_id`
- `url`
- `author_handle`
- `text`
- `posted_at`
- `like_count`
- `reply_count`
- `repost_count`
- `source_type`
- `source_value`
- `first_seen_at`
- `last_seen_at`

#### `post_scores`

- `id`
- `run_id`
- `post_id`
- `relevance`
- `engagement_opportunity`
- `reply_confidence`
- `category`
- `suggested_angle`
- `action`
- `model`
- `scored_at`

#### `reply_drafts`

- `id`
- `run_id`
- `post_id`
- `reply_text`
- `quote_post_text`
- `draft_model`
- `status`
- `created_at`

#### `engagement_history`

- `id`
- `author_handle`
- `post_id`
- `action_type`
- `action_value`
- `executed_at`

Use this table for:

- prior replies
- likes
- follows
- retweets
- quote-posts

#### `followed_accounts`

- `handle`
- `first_followed_at`
- `last_seen_at`
- `source_handle`
- `source_strategy`

#### `source_quality`

- `handle`
- `category`
- `quality`
- `last_browsed_at`
- `notes`
- `enabled`

### Legacy file mapping

- [posted-threads-log.json](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/posted-threads-log.json) -> `engagement_history`
- [followed_accounts_log.txt](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/followed_accounts_log.txt) -> `followed_accounts`
- [follow_run_log.txt](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/follow_run_log.txt) -> `runs`
- [tweet-activity-2026-03-27.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/tweet-activity-2026-03-27.md) and similar -> archive only
- [pending-improvements.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/pending-improvements.md) -> manual notes, not runtime state

---

## Model Strategy

### Remove Claude entirely

Delete:

- `@anthropic-ai/sdk` dependency
- Anthropic client setup
- `callClaude`
- all Sonnet/Haiku routing

Replace with:

- OpenAI SDK
- one scoring prompt
- one drafting prompt

### OpenAI tasks only

#### Scoring

Use a cheap model for:

- relevance score
- engagement opportunity
- reply confidence
- category
- suggested angle
- action

Input per post:

- `post_id`
- `author`
- `text`
- `timestamp`
- stats
- match reason

Output per post:

```json
{
  "post_id": "",
  "relevance": 0,
  "engagement_opportunity": 0,
  "reply_confidence": 0,
  "category": "",
  "suggested_angle": "",
  "action": "ignore"
}
```

#### Drafting

Use the same small model or one higher-quality OpenAI model for:

- one reply option per top post
- optional quote-post phrasing

Output:

```json
{
  "post_id": "",
  "reply": "",
  "quote_post": ""
}
```

### Remove model usage from these tasks

- follow scoring
- report writing
- mode parsing
- strategy rotation parsing
- cooldown management
- pending improvements
- standalone tweet scheduling logic

Standalone tweets should become either:

- manual only
- template-driven
- or generated on demand rather than every scheduled run

---

## Execution Strategy

### Phase 1

Keep the existing extension, but narrow its job.

Extension responsibilities:

- collect candidate posts
- collect candidate accounts
- execute approved actions
- write execution results

Extension should no longer decide:

- what to collect next based on long prose instructions
- which drafts to write
- which candidates are best

### New extension file contracts

#### `collection-request.json`

Purpose:

- tell the extension what to browse and collect

Example:

```json
{
  "run_id": "2026-03-31T08-00-00Z",
  "post_searches": [
    "#Stacks -filter:retweets",
    "\"bitcoin art\" -filter:retweets",
    "\"digital permanence\" -filter:retweets"
  ],
  "follow_sources": [
    "NOXtoshi",
    "prrfbeauty",
    "RabbitCartel"
  ],
  "max_posts_total": 100,
  "max_accounts_total": 60
}
```

#### `collection-results.json`

Purpose:

- raw collected posts/accounts only

#### `approved-actions.json`

Purpose:

- approved likes, follows, replies, quote-posts

#### `execution-results.json`

Purpose:

- what the extension actually did

This replaces the current one-file mixed action bundle in [orchestrator.js](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/orchestrator.js).

---

## CLI and Package Script Migration

### Current scripts

Current [package.json](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/package.json):

- `start`
- `test`

### Target scripts

```json
{
  "scripts": {
    "collect": "node src/cli/run-collect.js",
    "prefilter": "node src/cli/run-prefilter.js",
    "score": "node src/cli/run-score.js",
    "draft": "node src/cli/run-draft.js",
    "digest": "node src/cli/run-digest.js",
    "execute": "node src/cli/run-execute-approved.js",
    "run": "node src/cli/run-all.js",
    "dry-run": "node src/cli/run-all.js --dry-run",
    "migrate:legacy": "node src/cli/migrate-legacy-data.js",
    "db:init": "node src/cli/init-db.js"
  }
}
```

### Path handling fix

Make the repo root the default base path.

Do not keep the current behavior where runtime defaults to:

- `~/Documents/Claude/Xtrata Twitter Promotion`

The new code should resolve paths relative to the current project root unless an override is explicitly set.

---

## Phased Migration Sequence

### Phase 0: Freeze and Baseline

Goal:

- preserve the current system before changes

Tasks:

1. Create a git branch for migration.
2. Archive current logs and daily reports.
3. Record baseline metrics from the last 7 days.
4. Stop auto-mutation of markdown governance files.

Deliverables:

- archived legacy data
- baseline metrics note

Success criteria:

- current behavior reproducible
- rollback path clear

### Phase 1: Introduce New Structure Without Behavioral Change

Goal:

- create the new directories and basic modules

Tasks:

1. Add `src/`, `config/`, `state/`, `output/`, `reports/`, `archive/`.
2. Add `paths.js` and `config.js`.
3. Add DB init script and schema.
4. Add a run-id generator and run output directory creation.

Deliverables:

- scaffolded project structure
- initialized SQLite DB

Success criteria:

- `npm run db:init` succeeds
- `npm run dry-run` creates a run folder without model calls

### Phase 2: Migrate Config Out of Markdown

Goal:

- make runtime config structured

Tasks:

1. Create `mode.json`, `filters.json`, `keywords.json`, `sources.json`, `tone.json`.
2. Write a one-time parser to convert existing markdown values into JSON.
3. Stop reading `twitter-mode.md` and `twitter-diversity-rules.md` at runtime.

Deliverables:

- JSON config files
- legacy markdown parser script for migration only

Success criteria:

- runtime no longer depends on markdown governance files

### Phase 3: Migrate Runtime State Into SQLite

Goal:

- stop using flat files as state

Tasks:

1. Create migration script for:
   - posted threads
   - followed accounts
   - follow run history
2. Import historical data into DB tables.
3. Keep legacy files read-only in `archive/legacy/`.

Deliverables:

- `migrate-legacy-data.js`
- populated DB

Success criteria:

- cooldowns and dedupe rules work from DB only

### Phase 4: Split Collection From Orchestration

Goal:

- isolate browser collection

Tasks:

1. Replace `extension-instructions.json` with:
   - `collection-request.json`
   - `approved-actions.json`
2. Update extension bridge code.
3. Add raw normalization.

Deliverables:

- separate collection and execution contracts

Success criteria:

- collection can run without any execution actions
- execution can run without collection

### Phase 5: Build Rules-First Prefilter

Goal:

- cut model usage hard

Tasks:

1. Implement post filtering in code.
2. Implement account filtering in code.
3. Add hard caps before scoring.

Deliverables:

- `run-prefilter.js`
- filtered output artifacts

Success criteria:

- model never sees raw collected data
- filtered post batch size is predictable

### Phase 6: Replace Anthropic With OpenAI

Goal:

- remove Claude completely

Tasks:

1. Remove `@anthropic-ai/sdk`.
2. Add OpenAI SDK.
3. Replace scoring call with OpenAI JSON output.
4. Replace drafting call with OpenAI JSON output.
5. Delete report-writing model call.
6. Delete follow-scoring model call.
7. Disable scheduled standalone tweet drafting by default.

Deliverables:

- OpenAI-only scoring and drafting modules

Success criteria:

- no Anthropic dependency remains
- no Claude environment variable required

### Phase 7: Build Digest In Code

Goal:

- stop spending tokens on reports

Tasks:

1. Add markdown digest renderer.
2. Add daily report generator from DB and run artifacts.
3. Replace AI-written activity log.

Deliverables:

- deterministic digest output

Success criteria:

- same useful report outcome, zero model tokens

### Phase 8: Manual Approval Workflow

Goal:

- make posting deliberate and cheap

Tasks:

1. Add `approved-actions.json` schema.
2. Add helper script to mark draft replies approved.
3. Ensure `run-all` ends at digest generation.

Deliverables:

- approval queue

Success criteria:

- scheduled runs do not auto-post by default

### Phase 9: Cutover

Goal:

- switch production runs to the new pipeline

Tasks:

1. Disable `orchestrator.js` scheduled entrypoint.
2. Schedule `npm run run` twice daily.
3. Use `npm run execute` only after approval.
4. Monitor first 7 days closely.

Deliverables:

- new production schedule

Success criteria:

- stable twice-daily operation
- materially lower model usage

### Phase 10: Cleanup

Goal:

- remove dead code and confusion

Tasks:

1. Delete unused legacy orchestration code.
2. Move old docs into `archive/legacy/`.
3. Rewrite README for the new workflow.

Deliverables:

- simplified repo

Success criteria:

- no ambiguity about active runtime path

---

## File-by-File Refactor Map

### Keep temporarily, then replace

- [orchestrator.js](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/orchestrator.js)
- [README.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/README.md)
- [twitter-mode.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/twitter-mode.md)
- [twitter-diversity-rules.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/twitter-diversity-rules.md)

### Convert to DB/archive

- [posted-threads-log.json](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/posted-threads-log.json)
- [followed_accounts_log.txt](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/followed_accounts_log.txt)
- [follow_run_log.txt](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/follow_run_log.txt)
- [tweet-activity-2026-03-27.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/tweet-activity-2026-03-27.md)
- [tweet-activity-2026-03-28.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/tweet-activity-2026-03-28.md)
- [tweet-activity-2026-03-29.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/tweet-activity-2026-03-29.md)
- [tweet-activity-2026-03-30.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/tweet-activity-2026-03-30.md)

### Retire from runtime

- [pending-improvements.md](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/pending-improvements.md)

### Remove provider-specific setup

- [package.json](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/package.json)
- [package-lock.json](/Users/melophonic/Documents/GitHub/xtrata/AAA-Collection/twitter-auto/Xtrata%20Twitter%20Promotion/package-lock.json)

---

## Acceptance Criteria

The migration is complete when all of the following are true:

1. Scheduled runs do not require Claude or Anthropic.
2. The model is only used for scoring filtered posts and drafting top replies.
3. Follow decisions are rule-based.
4. Reports are generated in code.
5. Runtime state lives in SQLite, not markdown logs.
6. Collection and execution are separate.
7. Default schedule is 2 runs per day.
8. Default behavior is manual approval before posting.
9. The repo runs from its own root without `XTRATA_BASE_DIR`.
10. Legacy files are archived and no longer mutated during runs.

---

## Suggested Delivery Order For Actual Implementation

If implementation begins immediately, build in this order:

1. Project scaffolding and path handling
2. SQLite schema and legacy import
3. Structured JSON config
4. Collection and execution file contract split
5. Rules-first prefilter
6. OpenAI scoring
7. OpenAI drafting
8. Code-built digest
9. Approval workflow
10. Legacy cleanup

This order minimizes risk because it stabilizes paths, config, and state before replacing model logic.

---

## Immediate Next Step

Start with Phase 1 and Phase 2 together:

- scaffold the new directory layout
- add path handling relative to repo root
- create JSON config files from the current markdown

That gives the migration a stable foundation before touching the extension bridge or model provider.
