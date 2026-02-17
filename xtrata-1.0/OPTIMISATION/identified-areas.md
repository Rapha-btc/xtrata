# Identified Optimisation Areas

This register captures concrete opportunities to streamline and improve the codebase.

## A1. Bundle and load performance

Symptoms:

- Main entry bundle exceeds 500 kB warning threshold.
- Heavy screens are included in initial client bundle path.

Opportunities:

- Add route/module-level lazy imports for heavy screens and secondary panels.
- Split public docs/content blocks into load-on-demand modules.
- Tune Rollup `manualChunks` for predictable boundaries.

Primary targets:

- `src/App.tsx`
- `src/PublicApp.tsx`
- `src/screens/*.tsx` (large modules)
- `vite.config.ts`

## A2. Monolithic UI decomposition

Symptoms:

- Several UI modules exceed 1500-3000 lines.
- Mixed responsibilities: state orchestration, API calls, rendering, formatting.

Opportunities:

- Extract feature hooks (`useX`) for stateful logic.
- Extract presentational subcomponents for repeated UI blocks.
- Standardise panel-level composition pattern across public/manage/admin.

Primary targets:

- `src/screens/ViewerScreen.tsx`
- `src/screens/MintScreen.tsx`
- `src/screens/CollectionMintScreen.tsx`
- `src/manage/components/*.tsx` (largest panels)

## A3. Shared type and API logic reuse

Symptoms:

- Collection record and metadata parsing patterns are repeated across manage panels.
- Similar fetch/parse/error handling patterns are reimplemented.

Opportunities:

- Create shared manage API layer and shared model types.
- Centralise metadata parsing helpers for `collection`, `collectionPage`, `deploy`.
- Reduce per-panel duplicate fetch code.

Primary targets:

- `src/manage/components/CollectionListPanel.tsx`
- `src/manage/components/PublishOpsPanel.tsx`
- `src/manage/components/OwnerOversightPanel.tsx`
- `src/manage/components/SdkToolkitPanel.tsx`
- `src/manage/lib/api-errors.ts`

## A4. CSS and design token streamlining

Symptoms:

- `src/styles/app.css` is very large and mixes global/public/manage/admin concerns.
- Risk of style coupling and harder regression control.

Opportunities:

- Split CSS into scoped files by domain (public/manage/viewer/mint/admin/shared).
- Extract common utility classes and token groups.
- Keep visual output identical while reducing coupling.

Primary targets:

- `src/styles/app.css`
- `src/main.tsx` (style imports)

## A5. Viewer and data path efficiency

Symptoms:

- Viewer path has complex content resolution, cache behavior, and retry paths.
- Potential repeated transforms between grid and preview.

Opportunities:

- Consolidate content-resolution pipeline into clearly staged helpers.
- Tighten cache-key and hydration paths to avoid duplicate work.
- Add instrumentation around expensive operations.

Primary targets:

- `src/lib/viewer/content.ts`
- `src/lib/viewer/cache.ts`
- `src/lib/viewer/queries.ts`
- `src/components/TokenContentPreview.tsx`
- `src/components/TokenCardMedia.tsx`

## A6. SDK and app convergence

Symptoms:

- Some protocol/client logic exists in both app-side libs and SDK packages.
- Risk of drift and duplicate fixes.

Opportunities:

- Define explicit shared boundaries between app and SDK wrappers.
- Prefer SDK-facing reusable logic for new protocol behaviors.
- Remove app-only duplicates where safe.

Primary targets:

- `src/lib/contract/client.ts`
- `src/lib/mint/post-conditions.ts`
- `packages/xtrata-sdk/src/*`

## A7. Test and quality throughput

Symptoms:

- Typecheck noise currently reduces signal for incremental optimisation validation.
- Large refactors need better scoped confidence checks.

Opportunities:

- Add focused smoke tests around extracted shared hooks/helpers.
- Keep per-workstream test checklist and success criteria.
- Improve fast feedback commands for refactor phases.

Primary targets:

- `src/lib/**/__tests__`
- `src/manage/lib/**/__tests__`
- `packages/xtrata-sdk/src/__tests__`
- CI command scripts in `package.json`
