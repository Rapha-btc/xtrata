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
- `src/manage/CollectionManagerApp.tsx` composes the collapse-aware panels (`CollectionListPanel`, `OwnerOversightPanel`, `DeployWizardPanel`, `CollectionSettingsPanel`, `AssetStagingPanel`, `PublishOpsPanel`, and `DiagnosticsPanel`).
- `functions/collections/*` responds to the `CollectionList`/`CollectionRecord` endpoints, deploy/readiness checks, asset manifest uploads, reservation CRUD, publish action, owner oversight snapshots, and R2 upload URLs using the `DB`/`COLLECTION_ASSETS` bindings (legacy fallbacks: `ASSETS`, `R2`).
- `functions/lib/collections.ts` implements slug normalization and storage-limit helpers; `functions/lib/__tests__/collections.test.ts` guards them via Vitest.
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
- `functions/bns/[[path]].ts` proxies BNS lookups (configure base via env).
- `src/lib/wallet/session.ts` and `src/lib/wallet/storage.ts` persist wallet sessions.
- `src/lib/wallet/adapter.ts` centralizes wallet request calls and types.

## Protocol, chunking, and viewer data

- `src/lib/protocol/types.ts` defines protocol types for inscriptions.
- `src/lib/protocol/clarity.ts` maps protocol values to clarity values.
- `src/lib/protocol/parsers.ts` parses contract read-only responses into app types.
- `src/lib/chunking/hash.ts` hashes and slices files for chunked minting.
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

- `docs/sdk/README.md` defines SDK mission, package boundaries, and implementation posture.
- `docs/sdk/test-gates.md` defines required tests and release-quality gates.
- `docs/sdk/changelog.md` tracks completed delivery iterations.
- `docs/sdk/compatibility-matrix.md` tracks protocol/template version support and SDK readiness status.
  - Active collection-mint SDK target: `xtrata-collection-mint-v1.2` (`v1.0`/`v1.1` archived for new SDK work).
  - SDK implementation status: fully implemented and release-automated.
- `docs/sdk/quickstart-first-30-minutes.md` is the beginner onboarding path.
- `docs/sdk/quickstart-simple-mode.md` is the default onboarding path for low-friction SDK integration.
- `docs/sdk/quickstart-workflows.md` provides high-level write transaction plans for mint and market flows.
- `docs/sdk/troubleshooting.md` and `docs/sdk/migration-guide.md` capture integration operations and upgrades.
- `docs/sdk/changelog.md` and `docs/sdk/release-notes-template.md` support release operations.
- `docs/sdk/archive/` stores completed planning/history docs.
- `examples/xtrata-example-marketplace` and `examples/xtrata-example-campaign-engine` are starter integration shells.

## Tests and fixtures

- `src/lib/**/__tests__/*.test.ts` covers unit tests for protocol, viewer, network, contract, and wallet utilities.
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
  - Local dev: set `HIRO_API_KEY` in `.env.local` (used by Vite proxy `/hiro/*`).
  - Pages Functions: set `HIRO_API_KEY` in the Pages runtime env (used by `/functions/hiro`).
  - Optional build flag: `VITE_HIRO_API_KEY` only indicates key presence in the UI.
  - Pages note: set variables for both **Production** and **Preview** environments
    (the `*.pages.dev` URL uses Preview) to avoid 429s on preview builds.
- **BNS base override**
  - Default BNS hub is `https://api.bns.xyz`. If Cloudflare 525 occurs, set
    `VITE_BNS_API_MAINNET=https://api.mainnet.hiro.so` (client) and/or
    `BNS_API_BASE=https://api.mainnet.hiro.so` (Pages Functions `/bns` proxy).
  - Local dev can use `VITE_BNS_API_MAINNET` to keep `/bns` proxy pointed at Hiro.

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
