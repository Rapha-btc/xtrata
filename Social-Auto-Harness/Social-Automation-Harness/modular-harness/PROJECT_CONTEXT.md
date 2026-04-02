# Modular Harness Context

## Purpose

The `modular-harness/` folder is the new browser-session automation layer for this project.

It exists alongside the legacy/OpenAI API pipeline in the repository, but it follows a different operating model:

- use the operator's already logged-in browser sessions
- reuse or open the correct Chrome profile for a named persona
- interact with platform UIs through the standard web interface
- keep every capability modular, testable, and easy to reason about

The current target persona is `xtrata`, which maps to a Chrome profile and an expected X handle.

The safety and quality-control policy for future harness work is documented in `modular-harness/SAFETY_CONTROLS.md`.

This harness is being built to support careful, operator-supervised workflows. It is not intended to bypass platform controls, hide automation, or maximize volume.

## Current State

The harness currently supports:

- governance loading and normalization from the repo's existing markdown/json control files
- shared rule evaluation for cooldowns, exclusions, duplicate-thread checks, followed-account dedupe, and conservative bot filtering
- conservative candidate normalization and write-out for `thread-candidates.json` and `follow-candidates.json`
- read-only X search scraping for raw thread candidates
- read-only X follower scraping for raw follow candidates
- report-only ChatGPT analysis for thread and follow candidate batches
- deterministic opportunity-report building from governance state and analysis outputs
- report-only ChatGPT reply drafting for the safest thread opportunities
- read-only X reply-composer preparation that fills a draft and reads the composer state back without posting
- Chrome adapter for macOS using AppleScript
- persona registry and Chrome profile resolution
- persona window verification using the expected X handle
- X session verification
- ChatGPT session verification
- ChatGPT prompt submission and assistant reply scraping
- ChatGPT JSON-only reply workflow with validation

These capabilities are implemented in:

- `src/governance/loadGovernanceState.js`
- `src/policy/sharedRulesEngine.js`
- `src/x/collectSearchCandidates.js`
- `src/x/openVerifiedXTab.js`
- `src/x/scrapeXSearchResults.js`
- `src/x/scrapeXFollowers.js`
- `src/analysis/analyzeCandidateBatch.js`
- `src/reporting/buildOpportunityReport.js`
- `src/drafting/draftReplyCandidates.js`
- `src/x/replyComposer.js`
- `src/browser/chromeAppleScriptAdapter.js`
- `src/browser/profileRegistry.js`
- `src/browser/ensureChromePersonaWindow.js`
- `src/session/ensureXSession.js`
- `src/session/ensureChatGPTSession.js`
- `src/chatgpt/sendPromptAndReadReply.js`
- `src/chatgpt/sendPromptForJson.js`

The harness also has focused CLI smoke commands under `src/cli/` and unit tests under `test/`.

## What Is Proven

The harness has already proven the following end-to-end behaviors on a live machine:

- opening or reusing Google Chrome
- resolving and using the `xtrata` Chrome persona
- verifying the active X session by expected handle
- opening ChatGPT in the verified persona window
- submitting prompts through the ChatGPT UI
- scraping assistant replies
- extracting and validating JSON responses from ChatGPT

The new governance and policy modules are proven by unit tests against representative fixture files, not yet by a full unattended social run.
The new X scraping modules are also test-covered with fake adapters, but they have not yet been live-validated against the current X DOM on your machine.
The new analysis/report modules are test-covered and intentionally read-only, but they still depend on the current ChatGPT web UI staying compatible with the existing prompt/JSON path.
The new reply drafting module is also test-covered and intentionally non-posting; it only produces structured draft artifacts.
The new reply-composer module is test-covered and still intentionally non-posting; it can open a composer and fill text, but it does not submit.

## Known Limits

The harness is still early-stage and has important limits:

- macOS + Chrome only
- AppleScript and DOM selectors are inherently brittle
- UI changes on X or ChatGPT may break selectors
- ChatGPT account identity is only weakly observable unless the page exposes a real account hint
- the current candidate collector normalizes either supplied candidate JSON or the new read-only X scraping output
- no Gemini modules yet
- no provider abstraction yet
- no X outbound execution modules yet
- no X composer-fill or submit modules yet
- no X submit/post modules yet
- no durable scheduler, queue, action-budget module, or telemetry layer yet
- no canonical structured interaction ledger yet
- no account-pressure or search-widening modules yet

The harness should be treated as an incremental operator tool, not a fully autonomous system.

## Architecture Direction

The intended architecture is:

1. Browser adapter layer
   Handles Chrome-specific window, tab, and script execution concerns.

2. Persona/profile guard layer
   Ensures the correct Chrome profile/window is active before service modules run.

3. Session guard layer
   Confirms X, ChatGPT, Gemini, or other services are loaded and logged in.

4. Governance and policy layer
   Loads repo state, enforces shared rules, and blocks unsafe or duplicate work before provider or execution steps run.

5. Provider interaction layer
   Submits prompts, reads replies, and normalizes structured outputs.

6. Drafting layer
   Turns validated opportunities into structured, reviewable draft artifacts before any X-side action exists.

7. Composer preparation layer
   Opens X composers, fills drafts, and reads state back without posting.

8. Execution layer
   Opens X composers, fills drafts, reads draft state, and only later performs explicit operator-approved actions.

9. Audit layer
   Records what happened, preserves artifacts, and stops unsafe or noisy behavior.

## Expected Future Expansions

The next likely expansions are:

- `loadActionBundle` to replace the old extension-instructions/orchestrator check in a structured way
- stronger governance parsing for daily activity logs and standalone angle history
- action-budget, deduplication, and tripwire modules that sit beside `sharedRulesEngine`
- a canonical interaction ledger for all platform-visible actions and skips
- account-pressure and oversubscription controls for repeated author targeting
- search-widening controls so exhausted candidate pools expand instead of forcing low-quality actions
- richer candidate batching and chunking once search volumes grow beyond a single prompt
- stronger draft validation, variety checking, and duplicate-phrase detection
- `ensureGeminiSession`
- Gemini prompt/reply and JSON modules
- a provider interface so ChatGPT and Gemini can be called through one shared abstraction
- stronger structured-output validation for multi-step tasks
- X composer helpers such as:
  - submit reply only after explicit approval
  - post standalone tweet only after explicit approval
  - operator approval gate
- durable state and telemetry for browser automation runs
- quota/rate-limit controls and action deduplication
- DOM fixture capture or selector diagnostics to make browser regressions easier to debug

## Safety Principles

Safety is part of the product design, not an afterthought.

The harness should follow these rules:

- Manual login only.
  The operator logs into X, ChatGPT, Gemini, or other services manually in Chrome. The harness does not automate account creation, password entry, MFA, CAPTCHA solving, or session theft.

- No stealth or evasion work.
  Do not add anti-detection logic, CAPTCHA bypasses, traffic masking, stealth browser tricks, or behavior intended to hide automation from platforms.

- Prefer read-only and verification-first flows.
  Governance checks, session checks, prompt submission, and structured parsing should come before any outward-facing X action.

- Human approval before outward-facing X actions.
  Posting, replying, liking, following, retweeting, or any comparable platform-visible action should remain gated behind explicit user intent and later explicit approval mechanisms.

- One verified persona window per workflow.
  Persona-aware flows should prefer a single verified Chrome window for the persona and open additional service tabs in that same window whenever possible.

- Conservative retries and bounded loops.
  Retries should stay finite, waits should be bounded, and failure should stop the flow rather than spin indefinitely.

- Stop on unexpected UI or platform warnings.
  If selectors fail, the page shape changes materially, warnings appear, or there are signs of rate limiting or access restrictions, the harness should fail safe and return control to the operator.

- Avoid spammy or repetitive behavior.
  Future execution modules should enforce quotas, action spacing, per-run caps, deduplication, and content variety constraints.

- Record interaction history in structured form.
  Future execution and skip decisions should be traceable through a single interaction ledger rather than only through free-form markdown logs.

- Widen search rather than over-target accounts.
  If safe candidate volume is low, the harness should broaden discovery inputs instead of repeatedly touching the same small account pool.

- Structured outputs before automation.
  Use JSON-validated provider outputs when possible so downstream code consumes validated data instead of brittle free-form text.

- Drafts before execution.
  New writing features should produce reviewable draft artifacts first. Do not combine generation and posting into one step.

- Composer fill before submit.
  X-side modules should prove they can open and populate a composer safely before any submit/click-post behavior is added.

## Development Process

Development should stay modular, incremental, and test-first.

Required process for new work:

1. Start by understanding the target layer.
   Decide whether the change belongs in:
   - browser adapter
   - persona guard
   - session guard
   - provider interaction
   - execution
   - policy/audit

2. Build one narrow module at a time.
   Avoid large coupled jumps across multiple layers unless the change is trivial and tightly scoped.

3. Add or update tests for every behavior change.
   New helpers need direct unit tests.
   Changed behavior needs regression coverage.

4. Prefer fake adapters in tests.
   Browser modules should be exercised with small deterministic test doubles before live validation.

5. Add a CLI smoke command when a module becomes independently useful.
   A small CLI makes live verification easier and keeps debugging local.

6. Run tests before calling work complete.
   At minimum run the relevant tests. For shared behavior changes, run `npm test`.

7. Update docs whenever behavior or architecture changes.
   The context docs must stay aligned with reality.
   If the change affects interaction history, saturation, or execution safety, update `SAFETY_CONTROLS.md` too.

## Context Checklist For Future Assistants

Before editing the harness, future assistants should:

1. Read `README.md`.
2. Read `modular-harness/README.md`.
3. Read this file: `modular-harness/PROJECT_CONTEXT.md`.
4. Read `modular-harness/SAFETY_CONTROLS.md`.
5. Read `AGENTS.md`.
6. Read the specific module to be changed and its test file(s).
7. Confirm whether the task is read-only, session-level, provider-level, or execution-level.
8. Identify any user-visible or platform-visible side effects before coding.
9. Plan the smallest safe change that solves the requested problem.

## Immediate Guidance

If future assistants are unsure what to build next, the preferred order is:

1. strengthen governance and policy modules and tests
2. live-validate and tighten the new read-only X search/follower scrapers
3. strengthen the new report-only GPT analysis, reporting, drafting, and composer-prep layer
4. add Gemini parity
5. add provider abstraction
6. add operator-approved X execution helpers
7. add richer policy/audit controls before any attempt at larger-scale automation

The harness should become safer and more observable as it becomes more capable.
