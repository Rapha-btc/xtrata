# API Efficiency Baseline (February 27, 2026)

Source snapshot: Cloudflare zone overview (`xtrata.xyz`, 30-day window).

Derived ratio: ~281 requests per unique visitor (`478,450 / 1,700`).

Note: low cache percentage is expected to stay low when most expensive upstream calls are `POST` read-only endpoints unless function-level cache is added.

## Observed traffic profile

- Unique visitors: `1.7k`
- Total requests: `478.45k`
- Percent cached: `2.69%`
- Total data served: `3 GB`
- Data cached: `75 MB`

## Risk interpretation

1. Request-to-visitor ratio is high, indicating heavy endpoint churn, crawler traffic, or both.
2. Cache ratio is very low, so most requests reach origin/functions and then upstream APIs.
3. Upstream quota risk is currently greater than Cloudflare bandwidth cost risk.

## Existing controls already in code

1. Network base routing prefers same-origin `/hiro/{network}` in production with non-Hiro fallback.
   - `src/lib/network/config.ts`
2. Hiro proxy rotates keys on `401/403/429` and applies short cooldown to failed keys.
   - `functions/lib/hiro-proxy.ts`
   - `functions/lib/hiro-keys.ts`
3. Read-only client has bounded retries, concurrency limits, and backoff window logic.
   - `src/lib/contract/read-only.ts`
   - `src/lib/contract/client.ts`
4. Multi-tab guard reduces duplicate heavy polling from multiple open tabs.
   - `src/lib/utils/tab-guard.ts`
5. Viewer has cache-first paths via IndexedDB for summaries/content/thumbnail data.
   - `src/lib/viewer/cache.ts`
   - `src/lib/viewer/queries.ts`

## Gaps identified from baseline

1. No explicit edge-cache strategy for hot read-only POST paths through `/hiro`.
2. Token summary cache currently stores partial/degraded reads for up to `1 hour`.
3. Endpoint-level API budget visibility is limited.
4. Bot and WAF controls are not yet codified in optimisation docs/runbooks.

## Baseline update rule

For each API-efficiency phase completion, append:

1. Date and tasks completed.
2. Updated Cloudflare request/cache metrics.
3. Updated upstream `429` incidence notes.
4. Regression notes (if any).

## Baseline updates

### 2026-02-27 (initial implementation pass)

1. Implemented short-lived degraded summary cache behavior (`OPT-701`).
2. Added metadata retry affordance in preview UI for transient missing metadata.
3. Started allowlisted short-TTL proxy caching for hot `POST call-read` functions (`OPT-702`).
4. Awaiting post-deploy analytics to measure request-per-visitor and cache-ratio deltas.
