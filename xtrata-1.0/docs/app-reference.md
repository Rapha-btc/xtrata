# App Reference Map

Purpose: one-stop map of where code lives and which files to touch for common updates.

## Strategic focus (Protocol Team mode)

- Keep the first-party app and marketplace live and reliable, but treat them as reference implementations.
- Prioritize protocol-layer stability, SDK tooling, and third-party builder experience.
- Default new reusable logic to SDK-oriented modules (or SDK-ready helpers) before app-specific UI logic.
- Add "Built using Xtrata Protocol" positioning in product copy where appropriate, while preserving existing UX.
- Preserve backwards compatibility for core mint/view flows while extracting reusable primitives.

## SDK-first decision filter (read before implementation)

1) Is this feature useful to external builders (marketplaces, games, launchpads, creator tools)?
2) If yes, define the reusable interface first (types, function contracts, errors), then wire first-party UI.
3) Put protocol-facing behavior behind testable helpers; avoid burying contract logic inside screen components.
4) Keep first-party modules as examples of SDK usage, not the only way to access protocol capabilities.

## SDK operating mode (third-party build ready)

- SDK implementation is complete and release-automated. Operate in maintenance/release mode using:
  - `docs/sdk/README.md` (current start points and release commands)
  - `docs/sdk/test-gates.md` (required tests and release quality gates)
  - `docs/sdk/changelog.md` (tracked delivery history)
- Historical planning docs are archived in `docs/sdk/archive/`.
- Maintenance loop for SDK increments:
  1. Implement changes in `packages/xtrata-sdk` and/or `packages/xtrata-reconstruction`.
  2. Add or update tests in the same change set.
  3. Update quickstarts, compatibility notes, and troubleshooting when behavior changes.
  4. Run `npm run sdk:release:dry-run`.
  5. Regenerate and commit `docs/sdk/changelog.md`.
- Minimum quality bar for merged SDK work:
  - Unit coverage for new public helpers.
  - Integration or smoke test coverage for affected workflows.
  - Example usage that can run in a clean environment.
  - Documentation updates for developer onboarding and migration impact.

## Top-level layout and navigation

- `src/App.tsx` owns the main layout, section order, anchor buttons, collapse state, deploy panel, and high-level app state wiring.
- `src/styles/app.css` owns layout tokens, widths, grid sizing, square preview frames, and global layout rules.
- `src/main.tsx` boots the app and wires providers (React Query) and global CSS.
- `src/lib/theme/preferences.ts` owns theme mode catalog/persistence and document-level theme application.

## Screens and shared UI

- `src/screens/MintScreen.tsx` owns mint UI, file selection, cost/fee display, mint flow steps, and mint preview.
- `src/screens/CollectionMintScreen.tsx` owns batch mint UI (multi-file upload + batch seal) into the core contract.
- `src/screens/CollectionMintAdminScreen.tsx` owns collection-mint admin UI (per-collection settings + core allowlist).
- `src/screens/PreinscribedCollectionAdminScreen.tsx` owns pre-inscribed escrow sale admin UI (sale settings, allowlist, and inventory operations).
- `src/screens/PreinscribedCollectionSaleScreen.tsx` owns the pre-inscribed sale buyer UI in admin app context (sale status, token availability checks, and buy flow).
- `src/screens/CampaignConsoleScreen.tsx` owns the campaign console (drafts, assets, AI copy, post runner).
- `src/screens/ViewerScreen.tsx` owns the collection viewer grid, selection logic, and detailed preview panel.
- `src/screens/MyWalletScreen.tsx` owns the wallet grid, pagination, selection, and wallet preview panel.
- `src/components/TokenCardMedia.tsx` renders grid cell media (image/audio/video/html/text) and handles per-token loading.
- `src/components/TokenContentPreview.tsx` renders the large preview, resolves content, and exposes preview actions.

## Artist manager portal

- `src/config/manage.ts` defines `MANAGE_PATH`, parses `VITE_ARTIST_ALLOWLIST`, and exposes helpers for the gate; the same allowlist drives the `/manage` entry point.
- `src/manage/ArtistManagerGate.tsx` handles wallet connect/disconnect, theme selection, and allowlist validation before rendering `CollectionManagerApp`.
- `src/manage/ManageWalletContext.tsx` reuses the shared wallet adapter/session store to isolate the manage portal session from the public app.
- `src/manage/CollectionManagerApp.tsx` composes the collapse-aware panels (`SdkToolkitPanel`, `CollectionListPanel`, `OwnerOversightPanel`, `DeployWizardPanel`, `CollectionSettingsPanel`, `AssetStagingPanel`, `PublishOpsPanel`, and `DiagnosticsPanel`).
- `src/manage/components/SdkToolkitPanel.tsx` provides quick-start guidance, context-aware SDK snippets, and allowlist boundary notes for third-party builders.
- `functions/collections/*` responds to the `CollectionList`/`CollectionRecord` endpoints, deploy/readiness checks, asset manifest uploads, reservation CRUD, publish action, owner oversight snapshots, and R2 upload URLs using the `DB`/`COLLECTION_ASSETS` bindings (legacy fallbacks: `ASSETS`, `R2`).
- `functions/collections/[collectionId]/fee-guidance.ts` serves backend mining-fee guidance (begin/upload/seal estimates) based on the largest staged asset chunk profile.
- `functions/lib/collections.ts` implements slug normalization and storage-limit helpers; `functions/lib/__tests__/collections.test.ts` guards them via Vitest.
- `functions/lib/fee-guidance.ts` owns chunk-based mining-fee assumptions and estimate generation for collection guidance responses.
- `functions/lib/collection-deploy.ts` validates whether a draft has a confirmed on-chain deploy transaction before upload/publish operations.
- `functions/collections/health.ts` provides the `/collections/health` check used by the diagnostics panel to confirm D1 connectivity and table counts.

## Contracts, network, and wallet plumbing

- `src/data/contract-registry.json` stores the named contract list used by the selector.
- `src/lib/contract/registry.ts` loads the registry, normalizes entries, and exposes selection helpers.
- `src/lib/contract/config.ts` defines contract config types and helpers like `getContractId`.
- `src/lib/contract/client.ts` builds contract call options and read-only callers.
- `src/lib/contract/read-only.ts` wraps read-only calls with retry behavior.
- `src/lib/contract/selection.ts` manages contract selection logic for UI defaults.
- `src/lib/utils/tab-guard.ts` manages multi-tab activity so only one tab performs heavy reads.
- `src/lib/network/config.ts` defines network defaults and endpoints.
- `src/lib/network/stacks.ts` builds Stacks network objects.
- `src/lib/network/guard.ts` and `src/lib/network/rate-limit.ts` protect against aggressive polling.
- `functions/hiro/[network]/[[path]].ts` proxies Hiro API calls and injects API keys when present.
- `functions/explorer/[[path]].ts` proxies Explorer HTML pages used by BNS name/address scraping.
- `functions/arcade/attest-score.ts` signs `xtrata-arcade-scores-v1.1` submit attestations (nonce + expiry + RSV signature) for on-chain high-score verification.
- `src/lib/wallet/session.ts` and `src/lib/wallet/storage.ts` persist wallet sessions.
- `src/lib/wallet/adapter.ts` centralizes wallet request calls and types.

## Protocol, chunking, and viewer data

- `src/lib/protocol/types.ts` defines protocol types for inscriptions.
- `src/lib/protocol/clarity.ts` maps protocol values to clarity values.
- `src/lib/protocol/parsers.ts` parses contract read-only responses into app types.
- `src/lib/chunking/hash.ts` hashes and slices files for chunked minting.
- `src/lib/collection-mint/mining-fee-guidance.ts` defines shared types/formatting for backend mining-fee guidance rendered in manage/public collection pages.
- `src/lib/mint/dependencies.ts` parses and validates recursive parent IDs for minting.
- `src/lib/viewer/queries.ts` builds React Query calls for viewer data.
- `src/lib/viewer/content.ts` resolves content bytes, batch reads, and media handling.
- `src/lib/viewer/cache.ts` owns the IndexedDB cache and keying.
- `src/lib/viewer/model.ts` shapes viewer data records for grids and previews.
- `src/lib/viewer/ownership.ts` maps wallet ownership data for the wallet grid.
- `src/lib/viewer/recursive.ts` resolves recursive dependencies when viewing.
- `src/lib/viewer/relationships.ts` fetches parent IDs and scans for child relationships.
- `src/lib/viewer/types.ts` defines viewer models.
- `src/lib/market/actions.ts` centralizes market list/cancel validation helpers.
- `src/lib/market/listing-resolution.ts` resolves page-scoped listing data when activity indexes are incomplete.

## SDK and ecosystem docs

- `src/PublicApp.tsx` docs module includes the `sdk-tooling` topic, which follows the same summary-first and expandable-detail pattern as other docs sections.
- `src/PublicApp.tsx` docs module includes the `ai-agent-training` topic and external AI docs links for package index + track-specific guides (`aibtc` and generic).
- `XTRATA_AGENT_SKILL.md` is the self-contained agent training reference for autonomous xtrata inscription workflows (contract API, fees, workflows, and aibtc integration).
- `docs/ai-skills/README.md` is the AI training package index and onboarding entry point.
- `docs/ai-skills/aibtc-agent-training.md` is the track-specific guide for aibtc MCP agents.
- `docs/ai-skills/generic-agent-training.md` is the track-specific guide for non-aibtc AI agents and frameworks.
- `docs/sdk/README.md` defines SDK mission, package boundaries, and implementation posture.
- `docs/sdk/test-gates.md` defines required tests and release-quality gates.
- `docs/sdk/changelog.md` tracks completed delivery iterations.
- `docs/sdk/compatibility-matrix.md` tracks protocol/template version support and SDK readiness status.
  - Active collection-mint SDK target: `xtrata-collection-mint-v1.3` (`v1.0`/`v1.1` archived for new SDK work).
  - SDK implementation status: fully implemented and release-automated.
- `docs/sdk/quickstart-first-30-minutes.md` is the beginner onboarding path.
- `docs/sdk/quickstart-simple-mode.md` is the default onboarding path for low-friction SDK integration.
- `docs/sdk/quickstart-workflows.md` provides high-level write transaction plans for mint and market flows.
- `docs/sdk/troubleshooting.md` and `docs/sdk/migration-guide.md` capture integration operations and upgrades.
- `docs/sdk/changelog.md` and `docs/sdk/release-notes-template.md` support release operations.
- `docs/sdk/archive/` stores completed planning/history docs.
- `examples/xtrata-example-marketplace` and `examples/xtrata-example-campaign-engine` are starter integration shells.
- `docs/LEGAL/README.md` is the legal-signature implementation index for one-time wallet consent gates (public mint + collection deploy).
- `docs/LEGAL/signature-message-spec.md` defines the canonical signed message and required anti-replay/domain-binding fields.
- `docs/LEGAL/implementation-plan.md` maps the planned Pages Functions/API + frontend gate integration points.
- `docs/LEGAL/data-model-and-retention.md` defines D1 schema and audit retention rules for signature records.
- `docs/LEGAL/rollout-and-test-plan.md` defines phased rollout and verification gates before enforcement.

## Optimisation planning docs

- `OPTIMISATION/README.md` defines optimisation program goals, scope, and baseline commands.
- `OPTIMISATION/baseline-2026-02-17.md` tracks current performance/code-size baseline snapshots.
- `OPTIMISATION/identified-areas.md` lists grouped optimisation opportunities and primary targets.
- `OPTIMISATION/triage-plan.md` defines phased execution priorities and acceptance criteria.

## Tests and fixtures

- `src/lib/**/__tests__/*.test.ts` covers unit tests for protocol, viewer, network, contract, and wallet utilities.
- `src/lib/collection-mint/__tests__/mining-fee-guidance.test.ts` validates collection mining-fee guidance label formatting.
- `src/lib/skills/__tests__/xtrata-agent-skill.test.ts` validates the embedded AI training package (`XTRATA_AGENT_SKILL.md` + companion scripts) for required coverage and syntax checks.
- `functions/lib/__tests__/fee-guidance.test.ts` and `functions/lib/__tests__/collection-fee-guidance-route.test.ts` cover backend mining-fee estimate math and route payload behavior.
- `packages/xtrata-sdk/src/__tests__/*.test.ts` covers SDK public helper/unit behavior.
- `packages/xtrata-reconstruction/src/__tests__/*.test.ts` covers deterministic reconstruction helpers.
- `scripts/contract-variants.mjs` syncs and verifies SIP-009 trait variants for clarinet/testnet/mainnet.
- SDK smoke scripts live in `scripts/sdk/`:
  - `pack-smoke.sh` (tarball install/import validation).
  - `examples-tarball-smoke.sh` (example apps validated against packed SDK artifacts).
  - `docs-validate.mjs` (SDK docs link + command reference validation).
  - `version-check.mjs` (publish-ready version checks for SDK packages).
  - `changelog-generate.mjs` (generates `docs/sdk/changelog.md` from iteration history).
  - `release-dry-run.sh` (end-to-end release rehearsal + dry-run publish outputs).
- Xtrata AI skill companion scripts live in `scripts/`:
  - `xtrata-mint-example.js` (complete begin/upload/seal flow reference).
  - `xtrata-transfer-example.js` (ownership-checked transfer flow reference).
  - `xtrata-query-example.js` (metadata/content/read-only query reference).
- SDK CI/release workflows:
  - `.github/workflows/ci.yml` (Node 20/22 SDK gates).
  - `.github/workflows/sdk-release.yml` (release rehearsal + artifact upload).

## Update types (simple -> complex)

1) Text copy, labels, and button titles.
Files: `src/App.tsx`, `src/screens/MintScreen.tsx`, `src/screens/ViewerScreen.tsx`, `src/screens/MyWalletScreen.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: prefer in-place edits; keep strings short for tight layouts.

2) Layout spacing, widths, and overall page density.
Files: `src/styles/app.css`, `src/App.tsx`.
Notes: use CSS variables and layout classes; avoid per-component inline styles.

3) Grid layout, square sizing, and preview sizing for viewer or wallet.
Files: `src/styles/app.css`, `src/screens/ViewerScreen.tsx`, `src/screens/MyWalletScreen.tsx`, `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: keep the square frame constraints in CSS and only control selection in screens.

4) Add or reorder modules/sections in the UI.
Files: `src/App.tsx`, `src/styles/app.css`.
Notes: add anchors and collapse wiring if a new module is added.

5) Contract list changes or new default contract.
Files: `src/data/contract-registry.json`, `src/lib/contract/registry.ts`, `src/lib/contract/selection.ts`.
Notes: keep contract id formatting consistent with `getContractId`.

5a) Contract read-only additions (protocol helpers or diagnostics).
Files: `docs/contract-inventory.md`, `src/lib/contract/client.ts`, `src/lib/protocol/parsers.ts`.
Notes: add helpers as read-only calls, ensure parsers and docs are updated.

6) Deploy flow UI and deploy logic updates.
Files: `src/App.tsx`, `src/lib/contract/client.ts`, `src/lib/network/stacks.ts`, `src/lib/wallet/adapter.ts`.
Notes: deploy UI lives in App; transaction building lives in contract client.

7) Wallet connect, disconnect, and session persistence changes.
Files: `src/lib/wallet/session.ts`, `src/lib/wallet/storage.ts`, `src/lib/wallet/adapter.ts`, `src/App.tsx`.
Notes: session persistence is separated from UI state and should stay that way.

8) Mint flow changes (file validation, hashing, fee logic, transaction steps).
Files: `src/screens/MintScreen.tsx`, `src/lib/chunking/hash.ts`, `src/lib/protocol/clarity.ts`, `src/lib/contract/client.ts`, `src/lib/wallet/adapter.ts`.
Notes: keep the three-step mint flow in MintScreen and avoid hiding errors.

9) Viewer data fetching, caching, and content decoding.
Files: `src/lib/viewer/queries.ts`, `src/lib/viewer/content.ts`, `src/lib/viewer/cache.ts`, `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`.
Notes: cache key changes must update both cache and queries.

10) Protocol parsing or contract read-only response changes.
Files: `src/lib/protocol/parsers.ts`, `src/lib/protocol/types.ts`, `src/lib/contract/read-only.ts`.
Notes: add or update tests in `src/lib/protocol/__tests__/`.

11) Network changes or new endpoint configuration.
Files: `src/lib/network/config.ts`, `src/lib/network/stacks.ts`, `src/lib/network/types.ts`.
Notes: ensure tests or guards in `src/lib/network/__tests__/` still pass.

## API keys and env notes (local + Pages)

- **Hiro API key**
  - Local dev: set `HIRO_API_KEYS` (comma/newline list) in `.env.local`; fallback supports `HIRO_API_KEY`.
  - Pages Functions: set runtime env keys for `/functions/hiro`:
    - preferred: `HIRO_API_KEYS` list
    - optional numbered fallback: `HIRO_API_KEY_1`, `HIRO_API_KEY_2`, ...
    - legacy single key: `HIRO_API_KEY`
  - On `401/403/429`, the proxy tries the next configured Hiro key automatically.
  - Optional build flag: `VITE_HIRO_API_KEY` only indicates key presence in the UI.
  - Pages note: set variables for both **Production** and **Preview** environments
    (the `*.pages.dev` URL uses Preview) to avoid 429s on preview builds.
- **Explorer HTML proxy for BNS labels**
  - Address-label BNS names are scraped from Explorer HTML via `/functions/explorer`.
  - Optional overrides: `VITE_STACKS_EXPLORER_BASE`, `VITE_STACKS_EXPLORER_BASE_MAINNET`, `VITE_STACKS_EXPLORER_BASE_TESTNET`.
  - Pages Functions runtime override: `STACKS_EXPLORER_BASE`.
- **Arcade score attestation (`xtrata-arcade-scores-v1.1`)**
  - Pages Functions signer key: `ARCADE_SCORE_ATTESTATION_PRIVATE_KEY` (required for `/arcade/attest-score`).
  - Optional expiry window in blocks: `ARCADE_SCORE_ATTESTATION_EXPIRY_BLOCKS` (default `30`, max `500`).
  - Optional Hiro API bases: `ARCADE_HIRO_API_BASE_MAINNET`, `ARCADE_HIRO_API_BASE_TESTNET`, `ARCADE_HIRO_API_BASE_DEVNET`.

12) New media types or preview behavior.
Files: `src/components/TokenCardMedia.tsx`, `src/components/TokenContentPreview.tsx`, `src/lib/viewer/content.ts`.
Notes: keep rendering logic consistent between grid and preview.

13) SDK surface additions (types, client wrappers, reusable flows).
Files: `docs/sdk/*.md`, `packages/xtrata-sdk/**`, `src/lib/contract/**`, `src/lib/protocol/**`.
Notes: define stable interfaces and error models before UI adoption.

14) Reconstruction library work (deterministic assembly and verification).
Files: `packages/xtrata-reconstruction/**`, `src/lib/viewer/content.ts`, `src/lib/chunking/hash.ts`, `docs/sdk/compatibility-matrix.md`.
Notes: keep outputs deterministic and independently verifiable.

15) Third-party starter integrations and examples.
Files: `examples/**`, `docs/sdk/README.md`, `docs/sdk/quickstart-first-30-minutes.md`.
Notes: examples must prove end-to-end integration with minimal custom code.

16) SDK hardening and release readiness.
Files: `docs/sdk/test-gates.md`, `docs/sdk/changelog.md`, `docs/sdk/release-notes-template.md`, `packages/xtrata-sdk/**`, `packages/xtrata-reconstruction/**`, `examples/**`, `.github/workflows/ci.yml`, `.github/workflows/sdk-release.yml`.
Notes: every phase must add tests and pass defined release gates before progressing.
