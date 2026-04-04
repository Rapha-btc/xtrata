# Xtrata Twitter Promotion

This repository currently contains two parallel systems:

- the existing run-scoped API pipeline under `src/`
- the newer browser-session harness under `modular-harness/`

The API pipeline is still present and tested. The browser-session harness is the newer direction for the non-API workflow.

## Read This First

If you are working on the browser-session harness, read these files before changing code:

- `modular-harness/README.md`
- `modular-harness/PROJECT_CONTEXT.md`
- `modular-harness/SAFETY_CONTROLS.md`
- `AGENTS.md`

## Requirements

- Node.js 22.5 or newer
- `OPENAI_API_KEY` only if you are using the API pipeline for live scoring or drafting
- Google Chrome on macOS for the browser-session harness
- Logged-in browser sessions for X and ChatGPT if you are using the harness

## Repo Layout

- `src/`
  Existing API-based scoring/drafting pipeline
- `modular-harness/`
  Browser-session harness for persona-aware Chrome automation, X session checks, ChatGPT session checks, prompt submission, and JSON parsing
- `output/runs/`
  Run-scoped pipeline artifacts
- `state/`
  SQLite state used by the existing pipeline

## Tests

Run the full test suite with:

```bash
npm test
```

The suite currently covers both the API pipeline and the modular harness.

## API Pipeline

The API pipeline is the canonical entrypoint behind:

- `npm start`
- `npm run`
- `npm run dry-run`

Run it normally:

```bash
npm start
```

Run it in read-only mode:

```bash
npm run dry-run
```

Stage commands:

```bash
npm run collect
npm run prefilter
npm run score
npm run draft
npm run execute
```

Stage dry-runs are supported with `--dry-run`.

### Run-Scoped Files

Each run lives under `output/runs/<run-id>/`.

Files produced or consumed by the pipeline:

- `collection-request.json`: browser or operator collection instructions
- `collection-results.json`: raw collected posts/accounts for that run
- `raw-posts.json`: normalized posts
- `raw-accounts.json`: normalized accounts
- `filtered-posts.json`: rules-first post shortlist
- `filtered-accounts.json`: rules-first account shortlist
- `scored-posts.json`: score output
- `top-posts.json`: reply candidates
- `drafts.json`: drafted replies
- `approved-actions.json`: human-approved actions
- `execution-request.json`: action bundle for execution
- `execution-results.json`: what execution actually did
- `manifest.json`: run summary

### Dry-Run Behavior

`--dry-run` is read-only:

- no run directory is created
- no JSON artifacts are written
- no SQLite rows are inserted or updated
- malformed JSON still fails fast

Dry-run can still read existing config, existing run artifacts, and existing SQLite state to produce a summary.

### Manual Fixture

There is a deterministic sample run at `output/runs/manual-score-demo/`.

Useful smoke checks:

```bash
node src/cli/run-score.js --run-id=manual-score-demo --dry-run
node src/cli/run-draft.js --run-id=manual-score-demo --dry-run
```

## Browser-Session Harness

The harness lives under `modular-harness/` and is the newer non-API path.

Current harness capabilities include:

- governance loading and normalization from the existing markdown/json control files
- shared-rule enforcement for cooldowns, exclusions, duplicate-thread checks, followed-account dedupe, and conservative bot filtering
- conservative candidate normalization and write-out for `thread-candidates.json` and `follow-candidates.json`
- read-only X search result scraping inside the verified persona window
- deeper X search scraping that scrolls until the feed is exhausted or 100 raw thread candidates are loaded
- read-only X follower-list scraping inside the verified persona window
- report-only ChatGPT analysis of thread or follow candidate batches
- batched ChatGPT thread analysis in 25-candidate chunks with one final synthesis pass before reporting
- deterministic opportunity-report building from governance state, candidates, and GPT analysis output
- report-only ChatGPT reply drafting for the safest thread opportunities from the opportunity report
- read-only X reply-composer preparation that fills draft text and reads the composer state back without posting
- operator-supervised X manual-reply queue that waits for a human click, records verified sends, and advances without clicking Reply itself
- read-only reconciliation of manually sent replies that were not confirmed on-page in time
- Chrome persona/profile resolution
- persona window verification through the expected X handle
- X session verification
- ChatGPT session verification
- ChatGPT prompt submission and reply scraping
- ChatGPT JSON-only output parsing and validation

Current harness commands:

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
npm run harness:manual-reply-queue -- --persona=xtrata --draft-file=/tmp/reply-drafts.json --write-file=/tmp/manual-reply-queue.json
npm run harness:reconcile-replies -- --persona=xtrata --draft-file=/tmp/reply-drafts.json --queue-file=/tmp/manual-reply-queue.json --write-file=/tmp/reply-reconciliation.json
npm run harness:x-session -- --persona=xtrata --handle=@xtratalayers
npm run harness:chatgpt-session -- --persona=xtrata
npm run harness:chatgpt-prompt -- --persona=xtrata --prompt="Reply with exactly: HARNESS_OK"
npm run harness:chatgpt-json -- --persona=xtrata --prompt="Return JSON with ok=true and source='chatgpt'" --type=object --require-keys=ok,source
```

Current reply-flow defaults:

- `harness:x-search` now scrolls for up to 100 raw thread results before writing the search artifact
- `harness:analyze-candidates` now reviews up to 100 thread candidates per run by default
- `harness:analyze-candidates` analyzes those candidates in 25-candidate GPT batches, then runs one final synthesis pass before writing the analysis artifact
- `harness:draft-replies` drafts up to 8 high-quality reply candidates by default
- `harness:manual-reply-queue` prepares up to 8 ready drafts for operator-supervised sending by default
- these are upper bounds, not quotas; same-thread dedupe now checks both sent-thread history and operator-declined thread history before drafting

The current recommended build order for the harness is:

1. governance and policy modules
2. read-only X scraping and candidate collection
3. report-only GPT analysis and opportunity reporting
4. provider/session modules
5. report-only draft generation
6. read-only X composer preparation
7. operator-supervised manual send observation
8. approval-gated automated platform-visible execution

For architecture, roadmap, and safety constraints, use:

- `modular-harness/README.md`
- `modular-harness/PROJECT_CONTEXT.md`
- `modular-harness/SAFETY_CONTROLS.md`
- `AGENTS.md`

## Full Harness Command

From the repo root, this runs the full browser-harness thread-reply flow in sequence:

```bash
npm run harness:x-session -- --persona=xtrata --handle=@xtratalayers && \
npm run harness:chatgpt-session -- --persona=xtrata && \

npm run harness:x-search -- --persona=xtrata --query="L2 Ordinals" --write-file=/tmp/raw-threads.json && \
npm run harness:collect-candidates -- --threads-file=/tmp/raw-threads.json --output-dir=/tmp/xtrata-candidates && \
npm run harness:analyze-candidates -- --persona=xtrata --type=thread --input-file=/tmp/xtrata-candidates/thread-candidates.json --write-file=/tmp/thread-analysis.json && \
npm run harness:opportunity-report -- --threads-file=/tmp/xtrata-candidates/thread-candidates.json --thread-analysis-file=/tmp/thread-analysis.json --write-file=/tmp/opportunity-report.json && \
npm run harness:draft-replies -- --persona=xtrata --opportunity-report-file=/tmp/opportunity-report.json --write-file=/tmp/reply-drafts.json && \
npm run harness:manual-reply-queue -- --persona=xtrata --draft-file=/tmp/reply-drafts.json --write-file=/tmp/manual-reply-queue.json


# More Search Terms

npm run harness:x-search -- --persona=xtrata --query='Ordinals OR inscriptions OR "Bitcoin NFT" -filter:retweets
  lang:en' --write-file=/tmp/raw-threads-ordinals.json
  npm run harness:x-search -- --persona=xtrata --query='"onchain art" OR "on-chain art" OR "generative art" Bitcoin
  -filter:retweets lang:en' --write-file=/tmp/raw-threads-onchain-art.json
  npm run harness:x-search -- --persona=xtrata --query='"data permanence" OR "permanent data" Bitcoin OR Stacks
  -filter:retweets lang:en' --write-file=/tmp/raw-threads-permanence.json
  npm run harness:x-search -- --persona=xtrata --query='"Stacks builders" OR "Stacks dev" OR Clarity -filter:retweets
  lang:en' --write-file=/tmp/raw-threads-stacks-builders.json
  npm run harness:x-search -- --persona=xtrata --query='sBTC OR "Stacks DeFi" OR "Bitcoin DeFi" -filter:retweets
  lang:en' --write-file=/tmp/raw-threads-sbtc-defi.json
  npm run harness:x-search -- --persona=xtrata --query='IPFS OR "link rot" OR "decentralized storage" Bitcoin OR Stacks
  -filter:retweets lang:en' --write-file=/tmp/raw-threads-storage.json
  npm run harness:x-search -- --persona=xtrata --query='"Bitcoin-native apps" OR "Bitcoin builders" OR "build on
  Bitcoin" -filter:retweets lang:en' --write-file=/tmp/raw-threads-bitcoin-builders.json
  npm run harness:x-search -- --persona=xtrata --query='"proof of provenance" OR provenance Bitcoin OR Stacks
  -filter:retweets lang:en' --write-file=/tmp/raw-threads-provenance.json
```



The last step does not click `Reply` for you. It prepares each draft, waits for your manual click in Chrome, logs verified sends, and then advances to the next draft. If you close the reply dialog or tab without sending, the queue now records that as an operator-declined draft and moves on to the next one.

By default, that flow now reviews up to 20 candidate threads in order to find up to 8 high-quality drafts. It still rejects threads that hit posted-thread dedupe or the existing cooldown/exclusion rules before analysis and drafting.



THREADS=/tmp/xtrata-candidates/thread-candidates.json
  ANALYSIS=/tmp/thread-analysis.json
  REPORT=/tmp/opportunity-report.json
  DRAFTS=/tmp/reply-drafts.json
  QUEUE=/tmp/manual-reply-queue.json

  npm run harness:cleanup-tabs -- --persona=xtrata && \
  npm run harness:chatgpt-session -- --persona=xtrata && \
  npm run harness:analyze-candidates -- --persona=xtrata --type=thread --input-file="$THREADS" --write-file="$ANALYSIS" && \
  npm run harness:opportunity-report -- --threads-file="$THREADS" --thread-analysis-file="$ANALYSIS" --write-
  file="$REPORT" && \
  npm run harness:draft-replies -- --persona=xtrata --opportunity-report-file="$REPORT" --write-file="$DRAFTS" && \
  npm run harness:manual-reply-queue -- --persona=xtrata --draft-file="$DRAFTS" --write-file="$QUEUE"
