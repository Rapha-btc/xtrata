# Code Review

Scope reviewed: `Narrate_AI_05-26-v2.2/index.html` and the repository contents around it.

## Findings

### [P1] Book and event-log controls are wired to functions that do not exist

Evidence:

- `bookAnalyse()` is referenced by the Analyse button at `index.html:1409`
- `bookGenerate()` is referenced by the Generate button at `index.html:1435`
- `bookCancel()` is referenced at `index.html:1448`
- `bookDownloadZip()` and `bookDownloadCombined()` are referenced at `index.html:1455-1457`
- `renderLog()` and `clearLog()` are referenced at `index.html:1468-1476`
- there are no matching function definitions in the script block

Impact:

- the Book / Script Analyser is not a working feature
- the Event Log controls throw runtime errors when used
- the UI currently advertises capabilities that the codebase does not implement

Recommendation:

- either implement the missing functions end to end or hide these sections until they exist
- do not ship dormant controls in the default UI

### [P1] Saved cloned voice values are injected into inline handlers without escaping apostrophes

Evidence:

- `renderSavedVoices()` writes action buttons via `innerHTML` at `index.html:2976-2992`
- those buttons embed values into inline `onclick` handlers at `index.html:2986-2989`
- `escHtml()` escapes `&`, `<`, `>`, and `"` but not `'` at `index.html:2995-2996`

Impact:

- a cloned voice name such as `O'Brien` can break the generated handler
- user-controlled names become part of executable inline JavaScript
- this is both a reliability issue and an injection surface

Recommendation:

- stop generating inline handlers
- create DOM nodes and attach listeners with `addEventListener`
- if string interpolation must remain, escape apostrophes and treat IDs and labels separately

### [P1] The repository does not include the backend required for any real synthesis flow

Evidence:

- the frontend calls `/synthesize` at `index.html:1838`, `index.html:2197`, and `index.html:2521`
- it calls `/clone-voice` at `index.html:2920`
- it calls `/list-voices` at `index.html:2956`
- it calls `/delete-voice` at `index.html:3042`
- the repository contents only include the single frontend HTML file plus reference Markdown material

Impact:

- the project is not runnable end to end from this repository alone
- every core feature beyond static rendering depends on an external service that is undocumented in-code
- debugging and onboarding are harder because the deployment shape is implicit

Recommendation:

- add the missing server code, or add a mock API layer and explicit setup instructions
- keep the frontend contract stable and documented

### [P2] Cloned-voice pricing and quota accounting are incomplete and can produce incorrect UI numbers

Evidence:

- `PRICING` only defines flash and instruct-flash at `index.html:1622-1625`
- `freeUsed` only tracks those same two models at `index.html:1630`
- cloned voices switch the UI to `qwen3-tts-vc-2026-01-22` at `index.html:3010-3018`
- the single-generation cost fallback multiplies by the full pricing object instead of `.rate` at `index.html:1880`
- the estimator falls back to flash pricing for unknown models via `PRICING[model] || PRICING["qwen3-tts-flash"]` at `index.html:1647`

Impact:

- cloned-voice jobs may show flash pricing even though the UI labels them differently
- cost fallback can become `NaN` if response headers are missing
- quota tracking is not authoritative for cloned-voice usage

Recommendation:

- add an explicit pricing entry for `qwen3-tts-vc-2026-01-22`
- centralize pricing lookup in a helper that always returns `{ rate, label }`
- stop deriving billed cost from inconsistent local fallbacks when the backend can provide canonical numbers

### [P3] Resetting usage history does not reset the derived quota tracker until a full page reload

Evidence:

- `resetUsage()` clears `usageHistory` and local storage at `index.html:1975-1979`
- it does not call `syncFreeUsed()` afterward, even though quota is derived from history in `index.html:1632-1643`

Impact:

- the usage table resets immediately
- the free-quota bar and net-cost estimate can remain stale in the same session

Recommendation:

- recompute `freeUsed` after reset
- refresh the estimator and any derived usage panels after state resets

## Residual quality gaps

- No automated tests or linting are present in the repository.
- The app relies on public CDNs for `lamejs` and `JSZip` with no integrity pinning or local fallback.
- The code is organized as a single monolithic HTML file, which raises the cost of safe change over time.
