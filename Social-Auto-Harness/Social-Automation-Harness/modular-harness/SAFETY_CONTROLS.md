# Safety And Quality Controls

## Purpose

This document defines the safety rules that should govern all future social automation work in `modular-harness/`.

The goal is not just to prevent obvious spam. The goal is to make the harness selective, traceable, and quality-controlled so it does not drift into:

- repeated replies to the same people
- multiple interactions inside the same thread
- over-targeting a small set of accounts
- low-quality posting done only to hit quotas
- narrow searches that force repetitive behavior

If the harness cannot find enough high-quality opportunities within the current constraints, it should widen discovery or return a report. It should not lower standards to stay busy.

## Required Reading

Before changing policy, drafting, composer, or execution behavior, read:

1. `README.md`
2. `modular-harness/README.md`
3. `modular-harness/PROJECT_CONTEXT.md`
4. `modular-harness/SAFETY_CONTROLS.md`
5. `AGENTS.md`

## Safety Goals

The harness should optimize for:

- quality over volume
- breadth over repetition
- traceability over convenience
- conservative defaults over aggressive execution
- search expansion over spam escalation

Session caps should be treated as ceilings, not quotas. If only a few threads clear the current quality bar, the harness should draft only those few.

## Existing Control Files

The repository already contains several useful history files:

- `posted-threads-log.json`
  Current record of threads already replied to. This remains a hard dedupe source.
- `followed_accounts_log.txt`
  Existing record of followed accounts.
- `follow_run_log.txt`
  Historical run summaries and source rotation context.
- `tweet-activity-YYYY-MM-DD.md`
  Human-readable activity log.
- `twitter-diversity-rules.md`
  Cooldown and rotation guidance.
- `pending-improvements.md`
  Operational fixes and follow-up tasks.

These files are still important, but they do not provide one structured ledger for every platform-visible interaction.

## Interaction Ledger

The manual reply queue now writes a structured interaction ledger for prepared and sent outcomes.
Future execution-capable harness work should treat the same file as the source of truth.

Recommended file:

- `modular-harness/state/interaction-ledger.jsonl`

Recommended companion files:

- `modular-harness/state/account-pressure.json`
- `modular-harness/state/search-expansion-log.jsonl`
- `modular-harness/state/reply-review.jsonl`

Templates live in:

- `modular-harness/templates/interaction-ledger.example.jsonl`
- `modular-harness/templates/account-pressure.example.json`

The current queue only writes the interaction ledger. The companion files still remain recommended dependencies for richer execution controls.

## Interaction Ledger Requirements

Every platform-visible action or attempted action should eventually produce a ledger entry.

That includes:

- reply posted
- reply prepared but not submitted
- standalone tweet posted
- like performed
- follow performed
- retweet/repost performed
- explicit skip due to cooldown, duplication, low quality, or saturation
- execution failure after a platform-visible attempt

Each entry should contain at least:

- `timestamp`
- `persona`
- `platform`
- `actionType`
- `status`
- `targetHandle`
- `threadUrl`
- `postUrl`
- `sourceQuery`
- `sourceRunId`
- `analysisId` or `draftId` when available
- `qualityRating`
- `riskFlags`
- `reason`
- `operatorApproved`

Why this matters:

- dedupe rules can be enforced from one place
- saturation can be measured consistently
- future assistants can understand prior behavior without reading multiple free-form logs
- review and rollback become possible

Current manual-send rule:

- never record a reply as sent unless the operator clicked Reply and the harness observed the sent reply on-page
- if the operator closes the prepared reply dialog or tab without sending, record it as an operator-declined skip and move on without marking the thread as replied
- if the composer closes or times out without a verified on-page reply, do not mark the thread as replied
- if the operator closes the entire tab before on-page verification, treat the outcome as unconfirmed rather than as an explicit decline
- if an unconfirmed send needs recovery, use the read-only reconciliation flow to verify the exact sent reply on-page before backfilling local history
- future candidate collection should still treat operator-declined thread URLs as already reviewed so the same thread does not keep resurfacing
- the execution queue should re-check posted-thread and interaction-ledger dedupe before opening each draft so stale draft files cannot reopen already-reviewed threads

## Hard Stop Rules

These should be treated as non-negotiable defaults.

- Never reply twice in the same thread unless the operator explicitly requests it.
- Never interact with the same account multiple times in the same run.
- Never follow the same account twice.
- Never reply to an account that is already inside the active cooldown window.
- Never reply when the same account has already received repeated recent actions that make the interaction look forced or repetitive.
- Never post only to satisfy a quota target.
- Never compensate for weak candidate quality by adding more volume.

If any of these rules would be broken, the harness should skip and record the reason.

## Account Saturation Controls

An account becomes oversubscribed when the harness has already spent too much recent attention on it relative to the quality of the opportunity.

Recommended default model:

- `green`
  No recent reply history and low recent interaction density. Normal consideration allowed.
- `yellow`
  Recent interaction exists. Additional action is restricted and requires stronger quality signals.
- `red`
  Recent reply exists, same-thread interaction exists, or interaction density is too high. Automatic engagement is blocked.

Recommended automatic pressure signals:

- reply in the same thread at any time
- any reply to the same account within the last 14 days
- 2 or more platform-visible interactions with the same account within the last 30 days
- reply plus follow on the same account within a short window
- multiple low-quality candidate appearances from the same account across recent runs

Recommended response by pressure state:

- `green`
  candidate can be considered normally
- `yellow`
  do not reply unless analysis is high-quality and clearly contextual
- `red`
  block reply and follow automatically; widen search instead

## Search Widening Rules

If the harness cannot find enough safe candidates, it should widen search space rather than lower standards.

Widening order should generally be:

1. adjacent but relevant search phrases
2. different communities within the same topic cluster
3. different source graphs
4. different content formats
5. defer action and produce a report

Examples for this project:

- move from broad `Bitcoin L2` chatter to `Stacks builders`, `Bitcoin art`, `onchain art`, `inscriptions`, `Ordinals`, `generative art`, or collector-adjacent discussions
- rotate from one follower graph to another rather than revisiting the same source repeatedly
- prefer fresh authors over repeatedly touching the same small candidate pool

The harness should not:

- keep hammering one narrow search because it once produced a usable reply
- reuse the same reply pattern across multiple similar threads
- keep targeting the same visible ecosystem personalities because they are easy to find

Read-only search scaling is acceptable only if quality gates stay intact:

- it is reasonable to load a deeper search feed, for example up to 100 raw results, before analysis
- larger feeds should still be analyzed conservatively in chunks and re-ranked in one final synthesis step
- more search depth should improve selectivity, not justify more posting by itself

## Quality Gates Before Posting

Before a reply can move from draft to execution, it should pass all of these checks:

- topical fit is clear
- reply is specific to the source post
- reply does not sound like a template
- reply does not repeat a recently used phrasing pattern
- reply does not open with brand mention
- reply does not include unnecessary hashtags
- reply is under the character limit
- reply does not escalate hype, price talk, or generic engagement bait
- account pressure state is not `red`
- same-thread dedupe check passes
- author cooldown check passes
- ledger lookup shows no conflicting recent action

If any quality gate fails, the correct outcome is `skip`, not forced rewriting until something merely passable exists.

## Selective Posting Rules

Selective posting means the harness should actively prefer no action over low-quality action.

Recommended default posture:

- reply only when the thread quality is high enough to justify real attention
- keep likes and follows secondary to relevance, not as filler actions
- skip generic ecosystem slogans, copy-paste promo chatter, and low-substance posts
- avoid debate traps and hostile threads unless the explicit goal is research, not engagement
- if only one high-quality reply exists in a run, that is a good run

## Required Logging Behavior

Once outward-facing execution exists, every actual action should update:

- the structured interaction ledger
- the legacy human-readable logs where still required
- the relevant dedupe files such as `posted-threads-log.json`

If an action is blocked for safety reasons, that should also be logged in structured form.
If a manual send is not confirmed on-page, keep the ledger entry as prepared/unconfirmed and do not update `posted-threads-log.json`.

Skipped actions are useful because they show:

- the harness respected constraints
- a candidate pool is exhausted
- a search family may need widening
- an account is oversubscribed

## Required Process For Future Assistants

Before adding or changing platform-visible behavior:

1. identify which history files are currently authoritative
2. identify whether a structured ledger entry exists for the action
3. identify how same-thread and same-account dedupe will be enforced
4. identify how account pressure will be calculated
5. identify how searches widen when the candidate pool is exhausted
6. identify how low-quality drafts are blocked rather than posted
7. add tests for these controls before adding the new execution behavior

If these answers are missing, the safe answer is to stop at report-only or draft-only behavior.

## Recommended Next Modules

The next safety-oriented modules should be:

- `interactionLedger`
  append and query structured historical interaction records
- `accountPressure`
  derive `green/yellow/red` status per handle from the ledger
- `searchWideningPlanner`
  recommend broadened search families when safe candidate volume is too low
- `replyQualityReview`
  reject drafts that are repetitive, low-signal, or too close to recent wording
- `executionGate`
  central block/allow decision before any post, reply, like, follow, or repost

These should exist before any serious attempt to scale execution behavior.
