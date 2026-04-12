# Narrate Lead Engine

This is a standalone sibling app for finding Narrate AI prospects with the same browser-first, non-API style already used elsewhere in the repo.

It is built around six stages:

1. discovery
2. qualification
3. enrichment
4. outreach drafting
5. review queue preparation
6. learning stats per query/source

What this app does:

- generates high-intent audiobook pain queries from reusable query families
- searches the public web through Google search result pages in Chrome, not through Google APIs
- optionally searches X through the existing verified-browser harness
- optionally uses ChatGPT web search through the ChatGPT UI, not the OpenAI API
- scores candidates for pain, fit, buyer intent, freshness, reachability, and risk
- enriches stronger leads with public-contact context
- drafts outreach that leads with pain relief rather than generic AI hype
- writes every run to local JSON artifacts and a local SQLite database
- serves a lightweight dashboard for reviewing leads
- enforces safety budgets so the process fails before it overwhelms the machine

## Requirements

- Node.js 22.5 or newer
- Google Chrome on macOS
- a logged-in ChatGPT browser session if you want enrichment and draft generation
- a verified X browser session only if you enable the optional `x-search` source

If `node` is not on your shell `PATH`, run it directly with your local binary, for example `/opt/homebrew/bin/node`.

## Quick Start

Run the example job:

```bash
cd narrate-lead-engine
/opt/homebrew/bin/node src/cli/run-job.js --job-file=jobs/example-indie-authors.json
```

Run the low-risk smoke job first if you want to validate the guardrails before doing a fuller run:

```bash
cd narrate-lead-engine
/opt/homebrew/bin/node src/cli/run-job.js --job-file=jobs/safe-smoke-test.json
```

Start the dashboard:

```bash
cd narrate-lead-engine
/opt/homebrew/bin/node src/server.js
```

Then open `http://localhost:4318`.

## Example Job

The example job lives at [jobs/example-indie-authors.json](/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/jobs/example-indie-authors.json).

Key knobs:

- `persona`: Chrome persona name for ChatGPT and optional X work
- `account`: optional ChatGPT account hint
- `queryFamilies`: which pain/intent clusters to rotate
- `sources`: which non-API collectors to use
- `maxTotalQueries`: hard cap on discovery breadth for a single run
- `maxCollectedItems`: hard cap on total collected raw items
- `maxEnrichmentTasks`: hard cap on ChatGPT enrichment calls
- `maxDraftTasks`: hard cap on ChatGPT drafting calls
- `queryPauseMs` / `stagePauseMs`: throttles between browser actions
- `maxHeapUsedMb`: process memory tripwire
- `chatgptWaitBudgetMs` / `chatgptPollMs`: how long the runner will wait for slow ChatGPT web-search replies
- `enrichAboveScore`: score threshold for enrichment
- `draftAboveScore`: score threshold for outreach drafting

## Output

Each run writes under:

- [output/runs](/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/output/runs)

Artifacts per run:

- `job.json`
- `query-plan.json`
- `collection.json`
- `source-items.json`
- `leads.json`
- `outreach.json`
- `manifest.json`
- `error.json` on failed runs
- `progress.log`

SQLite state lives at:

- [state/narrate-leads.db](/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/state/narrate-leads.db)

## Notes

- Direct Google scraping is no longer the default in the sample jobs. Google may present unusual-traffic challenge pages, and this app now stops immediately when that happens rather than trying to work around it.
- Use `gpt-web-search` as the default browser-first discovery path when you want a safer no-API workflow.
- Google scraping is still available as an opt-in source type, but it is read-only and challenge-sensitive.
- Enrichment and outreach use the existing ChatGPT web UI JSON flow from the repo’s modular harness. No OpenAI API key is required.
- This app is designed for high-signal low-volume prospecting first. It does not auto-send anything.
- If a run hits a safety budget, the app now writes a failure manifest and error artifact, then exits.
