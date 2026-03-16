# CLAUDE.md

This is the root of the Xtrata monorepo — a recursive inscription data layer for Bitcoin L2 (Stacks).

## Repo Map

```
xtrata/
  xtrata-1.0/          Main application (SPA + Cloudflare Pages Functions + SDK + contracts)
  Agent-27-claude/      Agent 27 workspace (dashboard runtime, inscription skills, drafts)
  Agent-27/             Parallel agent workspace
  AAA-Collection/       Collection management hub and AIBTC agent workspace
  Archive/              Legacy versions (read-only reference)
  docs/                 Root-level docs
  backups/              Manual backups
  Twitter-Growth/       Growth campaign assets
```

The primary codebase lives in `xtrata-1.0/`. Most development work happens there.

## Quick Start

```bash
cd xtrata-1.0
npm install
npm run dev          # Vite dev server with Hiro API proxy
npm run build        # Production build
npm test             # Full test suite (contracts + app + clarinet)
```

## Branch Strategy

- `main` — stable, deployable
- Feature/work branches off main
- Current active branch: check `git branch --show-current`

## Key Documentation

- `xtrata-1.0/AGENTS.md` — development rules, UI constraints, fee reference
- `xtrata-1.0/docs/app-reference.md` — complete code map and update guide
- `xtrata-1.0/XTRATA_AGENT_SKILL.md` — canonical AI agent inscription skill
- `xtrata-1.0/OPTIMISATION/` — performance baseline, triage plan, and progress log
- `xtrata-1.0/TODO.md` — product roadmap and open items
- `Agent-27-claude/CLAUDE.md` — agent workspace operational rules
- `Agent-27-claude/AGENTs.md` — agent identity and inscription protocol

## Production Contract

`SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0`

---

# xtrata-1.0 Development Guide

Everything below applies to the `xtrata-1.0/` directory.

## Stack

- **Frontend:** Vite 5 + React 18 + TypeScript 5.4
- **State:** TanStack React Query 5
- **Blockchain:** @stacks/transactions 6.11, @stacks/connect 7.8, @stacks/network 6.11
- **Crypto:** @noble/hashes 1.4
- **Edge:** Cloudflare Pages Functions (Wrangler 4.65)
- **Contracts:** Clarity (Clarinet test environment)
- **Tests:** Vitest

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (auto-generates arcade manifest) |
| `npm run build` | Production build |
| `npm test` | Full suite: contracts:sync + contracts:verify + app tests + clarinet |
| `npm run test:app` | Vitest app unit tests |
| `npm run test:clarinet` | Clarity contract tests |
| `npm run test:contracts` | Sync + verify contract trait variants |
| `npm run sdk:build` | Build SDK + reconstruction packages |
| `npm run sdk:test` | SDK unit tests |
| `npm run sdk:release:dry-run` | Full release rehearsal |
| `npm run lint` | ESLint (zero warnings) |
| `npm run format` | Prettier |

## Architecture

### Source Layout

```
src/
  App.tsx                    Main app layout, navigation, deploy panel (1,766 lines)
  PublicApp.tsx               Public-facing app with docs modules (2,787 lines)
  main.tsx                   Entry point, React Query provider, CSS imports
  CollectionMintLivePage.tsx  Live collection mint page (3,087 lines)
  DoraHacksDemoPage.tsx       Hackathon demo page

  screens/
    ViewerScreen.tsx           Collection viewer grid + preview (4,172 lines)
    MintScreen.tsx             Single-file mint flow (3,394 lines)
    CollectionMintScreen.tsx   Batch mint into core contract (2,324 lines)
    CollectionMintAdminScreen  Collection mint admin (2,549 lines)
    MarketScreen.tsx           Multi-currency market browser
    CommerceScreen.tsx         USDCx commerce UI
    VaultScreen.tsx            sBTC vault UI
    MyWalletScreen.tsx         Wallet grid + preview
    CampaignConsoleScreen.tsx  Campaign drafts + AI copy + post runner

  components/
    TokenContentPreview.tsx    Large preview, content resolution (2,299 lines)
    TokenCardMedia.tsx         Grid cell media rendering

  lib/
    chunking/                 Hash calculation, chunk slicing
    contract/                 Registry, client, read-only, post-conditions
    protocol/                 Types, Clarity mapping, parsers
    viewer/                   Queries, content, cache (IndexedDB), recursive bridge
    mint/                     Post-conditions, dependencies
    commerce/                 USDCx registry, client, parsers
    vault/                    sBTC registry, client, parsers
    market/                   Listing actions, settlement, resolution
    collection-mint/          Mining fee guidance
    wallet/                   Session, storage, adapter
    network/                  Config, Stacks builder, rate limiting, guards
    cache/                    Cache utilities
    theme/                    Theme preferences
    utils/                    Amounts, tab guard
    admin/                    Admin utilities
    bns/                      BNS name utilities

  manage/
    ArtistManagerGate.tsx      Wallet gate + theme selection
    CollectionManagerApp.tsx   Panel composition
    ManageWalletContext.tsx     Isolated manage session
    components/
      DeployWizardPanel.tsx    Contract deploy wizard (2,835 lines)
      CollectionSettingsPanel  Collection config (2,813 lines)
      AssetStagingPanel.tsx    Asset upload/staging (1,865 lines)
      PublishOpsPanel.tsx      Publish operations (1,782 lines)
      OwnerOversightPanel.tsx  Owner tools (1,704 lines)
      CollectionListPanel.tsx  Collection browser
      SdkToolkitPanel.tsx      SDK quick-start panel
      DiagnosticsPanel.tsx     Health/diagnostics

  styles/
    app.css                   Global styles (7,727 lines — single file)

  config/
    manage.ts                 Manage path + artist allowlist
  data/
    contract-registry.json    Core contract list
    market-registry.json      Market contracts (STX/USDCx/sBTC)
    commerce-registry.json    Commerce contracts
    vault-registry.json       Vault contracts
```

### Edge Functions

```
functions/
  hiro/[network]/[[path]].ts   Hiro API reverse proxy with key rotation
  explorer/[[path]].ts          Explorer HTML proxy for BNS labels
  arcade/attest-score.ts        Arcade score attestation signer
  collections/                  Collection CRUD, deploy, publish, fee guidance
  lib/
    hiro-proxy.ts              Proxy logic with caching + key rotation (403 lines)
    collections.ts             Slug normalization, storage limits
    collection-deploy.ts       Deploy validation (450 lines)
    fee-guidance.ts            Chunk-based mining fee estimates
    x402-access.ts             x402 payment access control
```

### Packages

```
packages/
  xtrata-sdk/                  Main SDK for third-party builders
  xtrata-reconstruction/       Deterministic content reconstruction
```

### Contracts

```
contracts/
  clarinet/                    Clarity contract tests (Vitest)
  live/                        Production contract sources (24 dirs)
  other/                       Alternative implementations (23 dirs)
```

## Development Rules

These rules are authoritative. If `AGENTS.md` conflicts with anything below, `AGENTS.md` wins for UI/UX constraints.

### Before Any Change

1. Read `docs/app-reference.md` for the code map.
2. Read relevant test files before modifying library code.

### Code Principles

- **SDK-first:** if logic is useful to external builders, define the reusable interface first, then wire UI.
- **Protocol in helpers, not screens:** never bury contract logic inside screen components.
- **Cache-first viewer:** prefer IndexedDB cache + React Query; avoid refetching cached content.
- **Stable mint flow:** preserve init -> batch/chunk -> seal order and fee defaults.
- **Square grids:** 4x4, square cells, square preview frame at all responsive sizes.
- **No horizontal shifts:** collapsing/expanding panels must not shift layout.
- **Bounded network:** guard against aggressive polling; keep retries bounded.
- **Wallet session persistence:** session logic in `lib/wallet/`, not in UI components.

### Testing

- Unit tests live in `src/lib/**/__tests__/`.
- Update or add tests for any protocol, parsing, or network behavior change.
- SDK changes require unit + smoke coverage before merge.
- Contract changes require `npm run test:contracts` pass.

### Contract Management

- Use `npm run contracts:sync` to keep clarinet/testnet/mainnet SIP-009 trait blocks aligned.
- Use `npm run contracts:verify` to validate trait alignment.

### Environment Variables

- `HIRO_API_KEY` / `HIRO_API_KEYS` — Hiro API key(s) for rate limit avoidance
- `VITE_HIRO_API_KEY` — build flag indicating key presence in UI
- `VITE_STACKS_API_TESTNET` / `VITE_STACKS_API_MAINNET` — endpoint overrides
- `VITE_BNS_API_MAINNET` — BNS API base override
- `VITE_LOG_LEVEL`, `VITE_LOG_TAGS`, `VITE_LOG_ENABLED` — debug logging

### Build Configuration

Vite uses manual chunks for vendor splitting:
- `react` (react, react-dom)
- `tanstack` (@tanstack/react-query)
- `stacks` (@stacks/connect, @stacks/network, @stacks/transactions)
- `crypto` (@noble/hashes)

No route-based code splitting is currently configured. See Optimisation Plan below.

---

# Optimisation Plan

## Current State (as of 2026-03-15)

### Completed

- **OPT-701** (2026-02-27): Degraded token summaries use short-lived cache windows instead of 1-hour sticky state. Tests added.
- **OPT-702** (2026-02-27, partial): Short-TTL edge cache for hot POST call-read functions in hiro-proxy. Coverage added.

### Size Baseline

| File | Lines | Category |
|------|-------|----------|
| `src/styles/app.css` | 7,727 | CSS (monolithic) |
| `src/screens/ViewerScreen.tsx` | 4,172 | Screen |
| `src/screens/MintScreen.tsx` | 3,394 | Screen |
| `src/CollectionMintLivePage.tsx` | 3,087 | Page |
| `src/manage/components/DeployWizardPanel.tsx` | 2,835 | Manage |
| `src/manage/components/CollectionSettingsPanel.tsx` | 2,813 | Manage |
| `src/PublicApp.tsx` | 2,787 | App |
| `src/screens/CollectionMintAdminScreen.tsx` | 2,549 | Screen |
| `src/screens/CollectionMintScreen.tsx` | 2,324 | Screen |
| `src/components/TokenContentPreview.tsx` | 2,299 | Component |

14 duplicate CSS selectors detected in `app.css`.

### Known Issues

- All screens are statically imported — no lazy loading, no Suspense boundaries
- Vite only splits vendor chunks, not route/feature chunks
- `app.css` is a single 7,727-line file mixing all domains
- Public live collections trigger N x 7 read-only API calls per refresh cycle
- Manage panels duplicate wallet interaction patterns (showContractCall/Deploy)
- API fan-out creates quota pressure on Hiro upstream

## Execution Plan

Priority labels:
- **P0** — quick wins: high impact, low-medium effort, low risk
- **P1** — structural: high impact, medium-high effort, medium risk
- **P2** — deeper enhancements: medium impact or high complexity

### Phase 1 (P0): Immediate Wins

#### OPT-101: Lazy-load heavy screens

**Impact:** 40-60 KB gzipped off initial bundle. Fastest single win.

**Files:**
- `src/App.tsx`
- `src/PublicApp.tsx`

**Work:**
1. Wrap heavy screens with `React.lazy()`:
   - `ViewerScreen` (4,172 lines)
   - `MintScreen` (3,394 lines)
   - `CollectionMintScreen` (2,324 lines)
   - `CollectionMintAdminScreen` (2,549 lines)
   - `MarketScreen`, `CommerceScreen`, `VaultScreen`
   - `CampaignConsoleScreen`
2. Add `<Suspense>` boundaries with lightweight loading fallbacks.
3. Keep `MyWalletScreen` eager if it's the default landing view.

**Acceptance:**
- `npm run build` passes
- Entry chunk size reduced vs baseline
- No flash of unstyled content on navigation

**Effort:** ~1 hour

#### OPT-104: CSS duplicate cleanup

**Impact:** 200-300 lines removed, fewer cascade ambiguities.

**Files:**
- `src/styles/app.css`

**Work:**
1. Identify and merge the 14 known duplicate selectors.
2. Remove stale/commented blocks.
3. Visual regression check on key pages (public, manage, viewer, mint).

**Acceptance:**
- No visual regression
- Duplicate selector count drops to zero

**Effort:** ~1 hour

#### OPT-102: Shared manage collection model

**Impact:** DRY 3+ panels, reduce ~300-500 lines of duplicate types/parsers.

**Files:**
- `src/manage/lib/` (new shared types + parser helpers)
- `CollectionListPanel.tsx`, `PublishOpsPanel.tsx`, `OwnerOversightPanel.tsx`

**Work:**
1. Extract shared `CollectionRecord` type and metadata parsing helpers.
2. Move duplicate `fetch/parse/error` patterns into shared module.
3. Update panels to use shared imports.

**Acceptance:**
- Duplicate collection type declarations removed
- Manage behavior unchanged

**Effort:** ~2 hours

#### OPT-103: Shared manage collection-fetch hook

**Impact:** Consolidate fetch patterns across manage panels.

**Files:**
- `src/manage/lib/` (new `useCollectionFetch` hook)
- `src/manage/components/*.tsx`

**Work:**
1. Extract common fetch + error handling into a shared React hook.
2. Reuse in CollectionListPanel, PublishOpsPanel, OwnerOversightPanel.

**Acceptance:**
- Hook reused by at least 3 panels
- Error handling remains equivalent

**Effort:** ~2 hours

### Phase 2 (P0/P1): API Efficiency

#### OPT-704: Replace per-card live status fan-out

**Impact:** Biggest operational win. Eliminates N x 7 API calls per page load on public collections.

**Files:**
- `functions/collections/` (new summary endpoint)
- `src/PublicApp.tsx`

**Work:**
1. Create a single aggregated endpoint that returns mint-state for all visible collection items.
2. Replace client-side fan-out with single fetch.
3. Add short-TTL edge caching on the summary endpoint.

**Acceptance:**
- Public live collections no longer trigger N x 7 read-only calls per refresh
- Equivalent mint-state information displayed
- API request volume per visitor drops materially

**Effort:** ~4-6 hours

#### OPT-702: Complete edge caching (continued)

**Impact:** Improve Cloudflare cache ratio from low-single-digit baseline.

**Files:**
- `functions/lib/hiro-proxy.ts`

**Work:**
1. Extend short-TTL cache to safe read-only GET endpoints (not just POST call-read).
2. Add cache bypass for mutation routes.
3. Validate with Cloudflare analytics.

**Acceptance:**
- Cache hit ratio increases measurably
- No stale data for mutable state

**Effort:** ~2 hours

### Phase 3 (P1): Structural Decomposition

#### OPT-201: Break ViewerScreen into hooks + subcomponents

**Files:** `src/screens/ViewerScreen.tsx` (4,172 lines)

**Work:**
1. Extract grid state management into `useViewerGrid` hook.
2. Extract preview panel into `ViewerPreviewPanel` subcomponent.
3. Extract selection/navigation logic into `useViewerSelection` hook.
4. Main screen becomes composition of hooks + subcomponents.

**Acceptance:**
- ViewerScreen.tsx drops below 1,500 lines
- No UX regression
- New hooks include focused tests

**Effort:** ~4-6 hours

#### OPT-202: Break MintScreen into staged hooks

**Files:** `src/screens/MintScreen.tsx` (3,394 lines)

**Work:**
1. Extract file validation into `useMintFileValidation`.
2. Extract fee calculation into `useMintFeeEstimate`.
3. Extract transaction flow into `useMintTransactionFlow`.
4. Extract preview section into subcomponent.

**Acceptance:**
- MintScreen.tsx drops below 1,200 lines
- Three-step flow preserved

**Effort:** ~4 hours

#### OPT-203: Break CollectionMintScreen

**Files:** `src/screens/CollectionMintScreen.tsx` (2,324 lines)

**Work:**
1. Extract batch upload state into hook.
2. Extract seal flow into hook.
3. Extract progress UI into subcomponents.

**Effort:** ~3 hours

#### OPT-204: Refactor manage panels

**Files:** `DeployWizardPanel.tsx` (2,835), `CollectionSettingsPanel.tsx` (2,813), `OwnerOversightPanel.tsx` (1,704)

**Work:**
1. Extract shared wallet interaction hook (`useWalletContractCall`).
2. Break each panel into section subcomponents.
3. Reuse shared manage hooks from Phase 1.

**Effort:** ~6-8 hours

### Phase 4 (P1): CSS Domain Splitting

#### OPT-301: Split app.css into scoped files

**Files:** `src/styles/app.css` (7,727 lines) -> split into:
- `styles/base.css` — reset, tokens, typography
- `styles/public.css` — public app + docs modules
- `styles/manage.css` — manage portal
- `styles/viewer.css` — viewer + preview
- `styles/mint.css` — mint flows
- `styles/admin.css` — admin panels
- `styles/shared.css` — shared utilities

**Work:**
1. Categorize all selectors by domain.
2. Split into files, update imports in `main.tsx`.
3. Visual regression check.

**Acceptance:**
- No visual regression
- Each scoped file is independently navigable
- Prepares for future route-scoped CSS loading

**Effort:** ~4-6 hours

### Phase 5 (P1): Data Path Efficiency

#### OPT-401: Consolidate viewer content resolution

**Files:** `src/lib/viewer/content.ts` (1,372 lines)

**Work:**
1. Split MIME detection into standalone utility.
2. Split streaming/buffer logic from fetch orchestration.
3. Clarify the staged pipeline: fetch -> detect -> cache -> render.

**Effort:** ~3 hours

#### OPT-402: Tighten cache keying

**Files:** `src/lib/viewer/cache.ts`, `src/lib/viewer/queries.ts`

**Work:**
1. Ensure preview reuses grid-resolved content (no re-fetch).
2. Remove any duplicate transforms between grid and preview paths.

**Effort:** ~2 hours

### Phase 6 (P2): SDK / App Convergence

#### OPT-501-503: Reduce duplicate protocol logic

**Files:** `src/lib/contract/client.ts`, `packages/xtrata-sdk/src/*`

**Work:**
1. Map overlap between app contract helpers and SDK modules.
2. Move shared logic behind SDK-friendly interfaces.
3. Update app to consume SDK wrappers where safe.

**Effort:** ~8-12 hours

### Phase 7 (P1): Vite Build Optimization

#### NEW: Route-based chunk splitting

**Files:** `vite.config.ts`

**Work:**
1. After lazy loading is in place (OPT-101), Vite will automatically create route chunks.
2. Tune `manualChunks` to prevent fragmentation.
3. Consider CSS code splitting per lazy boundary.

**Acceptance:**
- No chunk exceeds 200 KB gzipped
- Shared vendor chunks loaded once

**Effort:** ~1-2 hours (after OPT-101)

---

## Recommended Execution Order

This sequence delivers the fastest visible gains with lowest risk:

```
1. OPT-101  Lazy-load screens          (~1h,  P0, biggest bundle win)
2. OPT-104  CSS duplicate cleanup       (~1h,  P0, quick cleanup)
3. OPT-102  Shared manage model         (~2h,  P0, DRY foundation)
4. OPT-103  Shared manage fetch hook    (~2h,  P0, DRY panels)
5. OPT-704  API fan-out aggregation     (~4-6h, P0, biggest operational win)
6. OPT-702  Complete edge caching       (~2h,  P0, API quota relief)
7. OPT-201  ViewerScreen decomposition  (~4-6h, P1, maintainability)
8. OPT-301  CSS domain splitting        (~4-6h, P1, maintainability)
9. OPT-202  MintScreen decomposition    (~4h,  P1, maintainability)
10. OPT-204 Manage panel refactor       (~6-8h, P1, maintainability)
```

Total estimated effort for P0 items (1-6): ~12-14 hours
Total estimated effort for full plan: ~50-60 hours

## Xtrata Fee Reference

Two cost components per inscription:

**Fixed (per inscription, any size):**
- `begin-or-get`: ~0.1 STX
- `seal-recursive`: ~0.2 STX
- **Total fixed: ~0.3 STX**

**Variable (scales with data):**
- `add-chunk-batch`: ~0.5 STX per 440KB batch (mining fees)
- 16KB file = 1 batch, ~0.04 STX mining
- 4MB file = ~10 batches, ~5.0 STX mining

**Rules:** Never extrapolate per-MB cost from small samples. Fixed costs dominate at small sizes and amortize at scale. Use `get-fee-unit` for current protocol fees.

---

## Files to Avoid Loading Unless Explicitly Needed

- `node_modules/`
- `dist/`
- `coverage/`
- `Archive/`
- `backups/`
- `recursive-apps/21-arcade/` (28MB of game assets)
- `contracts/live/` and `contracts/other/` (58MB of contract sources)
- Lockfiles
