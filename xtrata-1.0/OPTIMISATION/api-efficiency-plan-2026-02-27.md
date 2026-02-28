# API Efficiency Plan (February 27, 2026)

Purpose: reduce avoidable API spend, increase cache shield effectiveness, and prevent user-facing data degradation when upstream quotas/rate limits are hit.

## Current measures in place

These protections are already implemented and should be preserved:

1. API base strategy: production clients call same-origin `/hiro/{network}` first, then fallback to non-Hiro stacks API.
   - `src/lib/network/config.ts`
2. Hiro key failover: proxy rotates across configured keys on `401/403/429`.
   - `functions/lib/hiro-keys.ts`
   - `functions/lib/hiro-proxy.ts`
   - Constraint: rotation helps with per-key spikes, but does not solve shared monthly quota exhaustion when all keys are depleted.
3. Read-only retry and backoff controls: bounded retry, concurrency cap, and cooldown window.
   - `src/lib/contract/read-only.ts`
   - `src/lib/contract/client.ts`
4. Multi-tab coordination: only one tab remains active for heavy read paths.
   - `src/lib/utils/tab-guard.ts`
5. Cache-first viewer paths:
   - IndexedDB token summaries/content/thumbnail caches.
   - React Query staleness windows for high-read data.
   - `src/lib/viewer/cache.ts`
   - `src/lib/viewer/queries.ts`

## Additional measures required

### Priority 0: stop sticky metadata/preview degradation

1. Do not persist degraded token summaries as long-lived cache entries.
   - Current issue: failed read-only paths can store partial/null metadata for up to 1 hour.
   - Change:
     - detect degraded reads in `fetchTokenSummary` and avoid long TTL persistence.
     - optionally persist a short-lived negative cache (`30-60s`) to prevent retry storms.
   - Files:
     - `src/lib/viewer/queries.ts`
     - `src/lib/viewer/cache.ts`
     - `src/lib/viewer/__tests__/*`

2. Add explicit user-visible retry affordance when metadata is temporarily unavailable.
   - Files:
     - `src/components/TokenContentPreview.tsx`
     - `src/screens/ViewerScreen.tsx`

### Priority 1: reduce upstream read volume at the edge

1. Add cacheable read-only proxy mode for selected hot endpoints (function-level, because Cloudflare cache rules alone do not cache most `POST` call-read traffic).
   - Scope:
     - safe allowlist only (for example: `get-last-token-id`, `get-inscription-meta`, `get-owner`, `get-token-uri`).
     - short TTLs (`5-30s`) with stale-while-revalidate behavior.
   - Files:
     - `functions/lib/hiro-proxy.ts`
     - new tests under `functions/lib/__tests__/`

2. Add aggregated live-collection status endpoint.
   - Replace client fan-out (`N collections * multiple read-only calls`) with one snapshot request.
   - Files:
     - new `functions/collections/public-status.ts` (or equivalent)
     - `src/PublicApp.tsx`

3. Add request budget instrumentation.
   - Log and expose top hot endpoints, status mix (`2xx/4xx/429`), and fallback usage.
   - Files:
     - `functions/lib/hiro-proxy.ts`
     - diagnostics surfaces in app/manage as needed

### Priority 1: traffic governance and crawler control

1. Cloudflare cache rules for API responses that are safe to cache.
2. WAF rate-limit rules for abusive request patterns.
3. AI crawler policy decision (explicitly block or allow with rationale).
4. Preview and production env parity check for key/API vars before release.
5. Follow `OPTIMISATION/cloudflare-api-controls-runbook-2026-02-27.md` for rollout and rollback sequence.

## Delivery phases

1. Phase A (`1-2 days`)
   - Implement degraded-summary caching fix + tests.
   - Add viewer retry action for transient metadata failures.
2. Phase B (`2-4 days`)
   - Implement proxy-side endpoint allowlist caching and observability counters.
3. Phase C (`2-4 days`)
   - Implement aggregated live-status endpoint and migrate public page.
4. Phase D (`1 day`)
   - Apply Cloudflare rules and ship runbook updates.

## Success metrics

Track against baseline in `OPTIMISATION/api-efficiency-baseline-2026-02-27.md`:

1. Cloudflare cache ratio: move from `2.69%` toward `>=25%` short term.
2. Requests per visitor: reduce materially from current baseline.
3. Upstream 429 incidents: downward trend after rollout.
4. Viewer metadata availability:
   - no long-lived missing metadata state caused by transient failures.
   - preview recovery without hard reload.

## Rollout gates

1. `npm run build` passes.
2. Updated tests for new cache/error behavior pass.
3. Manual verification:
   - Viewer token metadata recovers after simulated transient API failures.
   - Live collections section does not fan out into uncontrolled per-card polling.
4. Post-deploy:
   - monitor 24h and 72h request/cache deltas before expanding TTLs.

## Implementation status (February 27, 2026)

1. `OPT-701` implemented:
   - Degraded token summary reads now persist with a short cache window (`45s`) instead of long-lived default TTL.
   - Preview now provides explicit metadata retry action when metadata is unavailable.
2. `OPT-702` started:
   - Proxy includes allowlisted short-TTL caching for selected `POST call-read` functions.
   - Cache key includes method + URL + request-body fingerprint to avoid cross-request contamination.
3. Verification completed for this increment:
   - `vitest` targeted suites for viewer queries and Hiro proxy.
   - `npm run build` pass.
