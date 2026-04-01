# Modular Harness

This folder is the start of the browser-session harness described for the non-API workflow.

Current modules:

- `src/governance/loadGovernanceState.js`
  Load and normalize the existing governance files such as `twitter-mode.md`, `twitter-diversity-rules.md`, `posted-threads-log.json`, `follow_run_log.txt`, `pending-improvements.md`, and `followed_accounts_log.txt`
- `src/policy/sharedRulesEngine.js`
  Evaluate cooldowns, search-noise exclusions, duplicate-thread rules, followed-account dedupe, and conservative bot filters
- `src/x/collectSearchCandidates.js`
  Normalize raw candidate inputs and write filtered `thread-candidates.json` / `follow-candidates.json` files for downstream analysis
- `src/x/openVerifiedXTab.js`
  Reuse or open a read-only X tab in the already verified persona window
- `src/x/scrapeXSearchResults.js`
  Open or reuse an X search tab, then scrape raw thread candidates without taking platform-visible actions
- `src/x/scrapeXFollowers.js`
  Open or reuse an X followers tab, then scrape raw follow candidates without taking platform-visible actions
- `src/analysis/analyzeCandidateBatch.js`
  Send thread or follow candidates through the ChatGPT JSON workflow for conservative, report-only scoring and reasoning
- `src/reporting/buildOpportunityReport.js`
  Merge governance state, normalized candidates, and GPT analysis into a deterministic opportunity report
- `src/drafting/draftReplyCandidates.js`
  Select the safest thread opportunities from the report and produce structured, report-only reply drafts through ChatGPT JSON
- `src/x/replyComposer.js`
  Open a verified X reply composer, fill a draft, and read the composer state back without posting
- `src/browser/chromeAppleScriptAdapter.js`
  Google Chrome adapter for macOS using AppleScript
- `src/browser/profileRegistry.js`
  Resolve named browser personas like `xtrata` into Chrome profile directories
- `src/browser/ensureChromePersonaWindow.js`
  Reuse or open the Chrome window for a verified persona based on the expected X handle
- `src/session/ensureXSession.js`
  Open or reuse `x.com`, then confirm the logged-in X handle
- `src/session/ensureChatGPTSession.js`
  Open or reuse `chatgpt.com`, then confirm a logged-in ChatGPT session
- `src/chatgpt/sendPromptAndReadReply.js`
  Submit a prompt through the ChatGPT web UI and wait for the next assistant reply
- `src/chatgpt/sendPromptForJson.js`
  Submit a prompt through the ChatGPT web UI and parse the reply as validated JSON
- `src/cli/load-governance-state.js`
  Manual CLI entrypoint for governance loading and normalization
- `src/cli/evaluate-shared-rules.js`
  Manual CLI entrypoint for rule evaluation against candidate JSON files
- `src/cli/collect-search-candidates.js`
  Manual CLI entrypoint for conservative candidate normalization and write-out
- `src/cli/scrape-x-search.js`
  Manual CLI entrypoint for read-only X search scraping
- `src/cli/scrape-x-followers.js`
  Manual CLI entrypoint for read-only X follower scraping
- `src/cli/analyze-candidate-batch.js`
  Manual CLI entrypoint for report-only ChatGPT candidate analysis
- `src/cli/build-opportunity-report.js`
  Manual CLI entrypoint for building the combined opportunity report
- `src/cli/draft-reply-candidates.js`
  Manual CLI entrypoint for report-only reply draft generation
- `src/cli/prepare-reply-composer.js`
  Manual CLI entrypoint for opening a reply composer, filling a draft, and reading back the composer state without posting
- `src/cli/ensure-x-session.js`
  Manual CLI entrypoint for the X session module
- `src/cli/ensure-chrome-persona-window.js`
  Manual CLI entrypoint for the persona/profile helper
- `src/cli/ensure-chatgpt-session.js`
  Manual CLI entrypoint for the ChatGPT session module
- `src/cli/chatgpt-prompt.js`
  Manual CLI entrypoint for prompt send/reply read
- `src/cli/chatgpt-json.js`
  Manual CLI entrypoint for structured JSON replies

Persona setup:

- edit `config/browser-personas.json`
- set `profileName` to the visible Chrome profile name for that persona, or set `profileDirectory` directly
- the default `xtrata` entry expects X handle `@xtratalayers`
- read `PROJECT_CONTEXT.md` for broader architecture, safety, and roadmap context
- future assistants should also read `../AGENTS.md` before changing harness code

The tests for these modules live under `modular-harness/test/`.

Manual runs:

```bash
npm run harness:persona-window -- --persona=xtrata
npm run harness:governance
npm run harness:rules -- --threads-file=/abs/path/threads.json --follows-file=/abs/path/follows.json
npm run harness:collect-candidates -- --threads-file=/abs/path/raw-threads.json --follows-file=/abs/path/raw-follows.json
npm run harness:x-search -- --persona=xtrata --query="Bitcoin L2" --write-file=/tmp/raw-threads.json
npm run harness:x-followers -- --persona=xtrata --source=@NOXtoshi --write-file=/tmp/raw-follows.json
npm run harness:analyze-candidates -- --persona=xtrata --type=thread --input-file=/tmp/xtrata-candidates/thread-candidates.json --write-file=/tmp/thread-analysis.json
npm run harness:opportunity-report -- --threads-file=/tmp/xtrata-candidates/thread-candidates.json --follows-file=/tmp/xtrata-candidates/follow-candidates.json --thread-analysis-file=/tmp/thread-analysis.json --write-file=/tmp/opportunity-report.json
npm run harness:draft-replies -- --persona=xtrata --opportunity-report-file=/tmp/opportunity-report.json --write-file=/tmp/reply-drafts.json
npm run harness:reply-composer -- --persona=xtrata --draft-file=/tmp/reply-drafts.json --draft-index=0 --write-file=/tmp/reply-composer-state.json
npm run harness:x-session -- --handle=@YourExpectedHandle
npm run harness:chatgpt-session
npm run harness:chatgpt-prompt -- --prompt="Give me a two sentence summary of Bitcoin today"
npm run harness:chatgpt-json -- --prompt="Return JSON with ok=true and source='chatgpt'" --type=object --require-keys=ok,source
```

Recommended persona-aware flow:

```bash
npm run harness:x-session -- --persona=xtrata --handle=@xtratalayers
npm run harness:chatgpt-session -- --persona=xtrata
npm run harness:chatgpt-prompt -- --persona=xtrata --prompt="Reply with exactly: HARNESS_OK"
```

Optional stricter ChatGPT account check:

```bash
npm run harness:x-session -- --persona=xtrata --handle=@xtratalayers
npm run harness:chatgpt-session -- --persona=xtrata --account=you@example.com
npm run harness:chatgpt-prompt -- --persona=xtrata --account=you@example.com --prompt="Draft a short reply"
npm run harness:chatgpt-json -- --persona=xtrata --account=you@example.com --prompt="Return JSON with status and score" --type=object --require-keys=status,score
```

Recommended harness build sequence:

1. `governance`
   Normalize repo state and extract the machine-readable inputs from the markdown/json control files.
2. `policy`
   Apply cooldown, dedupe, bot-filter, and search-diversity checks before any provider or platform step.
3. `read-only X scraping`
   Reuse the verified persona window, then scrape search results or follower lists into raw candidate JSON.
4. `report-only GPT analysis`
   Use validated JSON prompts to score candidates conservatively and produce structured opportunity data.
5. `provider/session`
   Reuse the verified persona window, then talk to ChatGPT or Gemini through dedicated tabs.
6. `draft support`
   Generate structured opportunities and report-only reply drafts before touching any X composer.
7. `read-only composer support`
   Open an X reply composer, fill a draft, and read state back without posting.
8. `execution`
   Only add explicit X actions once approval gates, quotas, and audit logging exist.

Current limit of the new candidate collector:

- it normalizes and filters supplied candidate JSON
- the new read-only scrapers return raw search/follower candidates, but they have not been live-validated yet against your current X DOM
- browser-facing collection, reply drafting, and composer-fill support are still intentionally non-posting and should stay that way until quotas, tripwires, and approval gates are stronger
