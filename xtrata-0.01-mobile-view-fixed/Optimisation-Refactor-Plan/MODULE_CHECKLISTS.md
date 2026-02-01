# Module Refactor Checklists (Extraction Boundaries + Naming Proposals)

Legend
- Boundary: code block or responsibility to extract.
- Proposal: suggested file and exported name.
- Notes: guardrails or special cautions.

---

## src/screens/MintScreen.tsx (2266 lines)
Priority: Very High

Boundaries to Extract
1) File preparation + validation
- Boundary: file selection, byte loading, mime validation, size checks, duplicate checks, dependency checks.
- Proposal: src/hooks/useMintFilePreparation.ts (useMintFilePreparation)
- Notes: Preserve duplicate check timing and status messages.

2) Fee schedule + fee rate fetch
- Boundary: fee rate fetch, fee estimate, fee status/labels.
- Proposal: src/hooks/useMintFees.ts (useMintFees)
- Notes: Preserve fee defaults and error messaging text.

3) Resume flow
- Boundary: resume state lookup, validation, resume batch logic, resume UI text.
- Proposal: src/hooks/useMintResume.ts (useMintResume)
- Notes: Preserve resume blocking logic and log messages.

4) Delegate clone flow
- Boundary: delegate target id parsing, delegate meta load, delegate file generation.
- Proposal: src/hooks/useMintDelegate.ts (useMintDelegate)
- Notes: Ensure token #0 works; avoid truthy bigint checks.

5) Mint transaction sequence
- Boundary: init/begin, batch upload, seal transaction flow, log output, retry logic.
- Proposal: src/hooks/useMintTransactions.ts (useMintTransactions)
- Notes: Keep step order fixed; keep tx delays and state transitions identical.

6) UI sections
- Boundary: large render blocks (delegate panel, metadata panel, log panel, status banners, preview panel, steps panel).
- Proposal: src/components/mint/MintDelegatePanel.tsx, MintMetadataPanel.tsx, MintStepsPanel.tsx, MintStatusPanel.tsx, MintLogPanel.tsx, MintPreviewPanel.tsx
- Notes: Preserve CSS classnames and layout; avoid layout shifts.

---

## src/screens/CollectionMintScreen.tsx (835 lines)
Priority: Medium-High

Boundaries to Extract
1) File scanning + preparation
- Boundary: directory import, sort, validation, chunking.
- Proposal: src/hooks/useCollectionMintPreparation.ts (useCollectionMintPreparation)
- Notes: Keep max limits and validation messages.

2) Batch upload sequencing
- Boundary: upload loop, per-item status, tx delay handling.
- Proposal: src/hooks/useCollectionMintTransactions.ts (useCollectionMintTransactions)
- Notes: Preserve batch size limits and tx delay behavior.

3) UI sections
- Boundary: list rendering, status banners, progress meter.
- Proposal: src/components/mint-collection/CollectionMintList.tsx, CollectionMintProgress.tsx, CollectionMintStatusPanel.tsx
- Notes: Preserve layout density; no new scroll containers.

---

## src/screens/ViewerScreen.tsx (1619 lines)
Priority: High

Boundaries to Extract
1) Pagination + last page logic
- Boundary: lastTokenQuery, collectionMaxPage, activePageIndex, page index management.
- Proposal: src/hooks/useViewerPagination.ts (useViewerPagination)
- Notes: Preserve last page initial load behavior and max-page guards.

2) Selection + auto-select
- Boundary: selectedTokenId logic, autoSelectRef, mobile panel switch.
- Proposal: src/hooks/useViewerSelection.ts (useViewerSelection)
- Notes: Preserve last-token auto-select and wallet-mode behavior.

3) Prefetch sequencing
- Boundary: prefetch loop, prefetchTokenSummaries, delays, scope refs.
- Proposal: src/hooks/useViewerPrefetch.ts (useViewerPrefetch)
- Notes: Keep concurrency and delays; do not alter query keys.

4) Refresh + focus behavior
- Boundary: focusKey refresh loop, refresh interval, deadline.
- Proposal: src/hooks/useViewerRefresh.ts (useViewerRefresh)
- Notes: Preserve timing and refetch behavior.

5) Market activity + listing badge logic
- Boundary: market activity query, buildActiveListingIndex, isTokenListed.
- Proposal: src/hooks/useMarketListings.ts (useMarketListings)
- Notes: Keep staleTime and enabled conditions.

6) TokenDetails panel
- Boundary: TokenDetails component with transfer + advanced sections.
- Proposal: src/components/viewer/TokenDetailsPanel.tsx
- Notes: Preserve transfer flow and diagnostic tools.

---

## src/components/TokenContentPreview.tsx (2097 lines)
Priority: High

Boundaries to Extract
1) Stream preview pipeline
- Boundary: MediaSource setup, buffer strategy, lazy load, stream status updates.
- Proposal: src/hooks/useStreamPreview.ts (useStreamPreview)
- Notes: Preserve stream thresholds, batch sizes, and cache writes.

2) Preview caching
- Boundary: preview cache load/save, temp cache logic.
- Proposal: src/hooks/usePreviewCache.ts (usePreviewCache)
- Notes: Preserve cache keys and TTLs; no store changes.

3) Token URI preview
- Boundary: token URI preview gating, fetch, and fallback logic.
- Proposal: src/hooks/useTokenUriPreview.ts (useTokenUriPreview)
- Notes: Preserve allowTokenUriPreview rules.

4) Media resolution + UI selection
- Boundary: decide which preview source to render and render selection.
- Proposal: src/components/viewer/PreviewMedia.tsx, src/hooks/usePreviewSource.ts
- Notes: Preserve which source wins (svg -> tokenUri -> on-chain, etc.).

5) Meta/diagnostic UI
- Boundary: metadata panel, hash display, copy actions.
- Proposal: src/components/viewer/PreviewMetaPanel.tsx, PreviewActions.tsx
- Notes: Preserve layout and classnames.

---

## src/components/TokenCardMedia.tsx (808 lines)
Priority: Medium-High

Boundaries to Extract
1) Thumbnail load/save
- Boundary: loadInscriptionThumbnailFromCache, generate thumbnail, save, error handling.
- Proposal: src/hooks/useTokenThumbnail.ts (useTokenThumbnail)
- Notes: Preserve thumbnail cache keys and badThumbnailKeys handling.

2) On-chain preview bytes for cards
- Boundary: fetchOnChainContent + mime resolution logic.
- Proposal: src/hooks/useTokenCardContent.ts (useTokenCardContent)
- Notes: Keep MAX_THUMBNAIL_BYTES guard.

3) Token URI fallback logic
- Boundary: fetchTokenImageFromUri, direct token uri handling.
- Proposal: src/hooks/useTokenCardFallback.ts (useTokenCardFallback)
- Notes: Preserve ordering of preview source selection.

4) Render resolution
- Boundary: image/pdf/html/text render choices.
- Proposal: src/components/viewer/TokenCardMediaView.tsx
- Notes: Preserve classnames and object-fit behavior.

---

## src/screens/MarketScreen.tsx (1421 lines)
Priority: Medium-High

Boundaries to Extract
1) Market queries
- Boundary: statusQuery, activeListingsQuery, activityQuery, listingQuery, tokenLookupQuery.
- Proposal: src/hooks/useMarketQueries.ts (useMarketQueries)
- Notes: Preserve staleTime, refetchInterval, and enabled rules.

2) Active listings + activity views
- Boundary: lists and rendering blocks.
- Proposal: src/components/market/ActiveListings.tsx, MarketActivityFeed.tsx
- Notes: Preserve layout and limits.

3) Forms: list/buy/cancel
- Boundary: form inputs and validation.
- Proposal: src/components/market/MarketListingForm.tsx, MarketBuyForm.tsx, MarketCancelForm.tsx
- Notes: Preserve validation messages and rate-limit behavior.

---

## src/screens/MyWalletScreen.tsx (legacy / optional)
Priority: Medium

Boundaries to Extract
- If kept, extract similar viewer logic:
  - useWalletTokenSummaries
  - useWalletListingIndex
- Proposal: align with ViewerScreen wallet mode to avoid duplication.
- Notes: Prefer deprecating this screen in favor of ViewerScreen wallet mode.

---

## src/App.tsx (744 lines) + src/PublicApp.tsx (410 lines)
Priority: Medium

Boundaries to Extract
1) App shell layout + header
- Proposal: src/components/app/AppShell.tsx
- Notes: Preserve anchors, collapse behavior, and layout widths.

2) Wallet controls + session wiring
- Proposal: src/components/app/WalletSessionPanel.tsx + src/hooks/useWalletSession.ts
- Notes: Preserve session persistence and mismatch guards.

3) Shared state hooks
- Proposal: src/hooks/useContractSelection.ts, useSectionCollapse.ts
- Notes: Preserve default collapse states.

---

## src/lib/viewer/content.ts (873 lines)
Priority: Medium-High

Boundaries to Extract
1) Token URI utilities
- Proposal: src/lib/viewer/token-uri.ts
- Notes: Preserve cache size limits and fetch timeouts.

2) Chunk fetching + batch logic
- Proposal: src/lib/viewer/chunk-fetch.ts
- Notes: Preserve retry behavior and cost-balance handling.

3) Mime resolution + sniffing
- Proposal: src/lib/viewer/mime.ts
- Notes: Preserve sniff rules and normalization.

---

## src/lib/viewer/cache.ts (630 lines)
Priority: Medium

Boundaries to Extract
1) IDB helpers
- Proposal: src/lib/idb/db.ts (openDB, transaction helpers)
- Notes: Keep store names and version unchanged.

2) Cache accessors
- Proposal: src/lib/viewer/cache-inscriptions.ts, cache-previews.ts, cache-thumbnails.ts
- Notes: Preserve key formats and log semantics.

---

## src/lib/contract/client.ts (547 lines)
Priority: Medium

Boundaries to Extract
1) Read-only call group
- Proposal: src/lib/contract/read-only-client.ts
- Notes: Keep callReadOnlyWithRetry and fallback behavior unchanged.

2) Tx builder group
- Proposal: src/lib/contract/tx-builders.ts
- Notes: Preserve function name strings and args order.

---

## src/lib/market/indexer.ts (261 lines)
Priority: Low-Medium

Boundaries to Extract
- Event parsing vs fetching
- Proposal: src/lib/market/indexer-fetch.ts, indexer-parse.ts
- Notes: Preserve event ordering and caching behavior.

---

## src/lib/wallet/adapter.ts (202 lines)
Priority: Low-Medium

Boundaries to Extract
- Session interaction vs wallet calls
- Proposal: src/lib/wallet/adapter-session.ts, adapter-calls.ts
- Notes: Preserve session persistence and error handling.

---

## src/lib/protocol/parsers.ts (206 lines)
Priority: Low-Medium

Boundaries to Extract
- Meta parsing vs upload parsing
- Proposal: src/lib/protocol/parsers-meta.ts, parsers-upload.ts
- Notes: Preserve error messages and expectations.

---

## Optional Consolidation Targets
- src/screens/MyWalletScreen.tsx -> prefer ViewerScreen wallet mode.
- src/components/TokenCardMedia.tsx + TokenContentPreview.tsx -> share resolution helpers.
- src/lib/market/cache.ts + src/lib/viewer/cache.ts -> shared IDB helper utilities.

