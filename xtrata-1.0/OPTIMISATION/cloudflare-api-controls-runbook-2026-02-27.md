# Cloudflare API Controls Runbook (February 27, 2026)

Purpose: reduce abusive or low-value API traffic and improve upstream quota resilience for `xtrata.xyz`.

## Constraints to keep explicit

1. Most high-cost Stacks read paths use Hiro `call-read` endpoints, which are `POST` requests.
2. Cloudflare dashboard cache rules do not reliably cache arbitrary `POST` traffic by themselves.
3. Therefore, API efficiency must combine:
   - function-level cache controls in `functions/lib/hiro-proxy.ts`, and
   - Cloudflare traffic governance (bots/rate limits/challenges).

## Immediate control set (`P0`)

1. AI crawler policy
   - Decide and document one mode: `block` or `allow`.
   - Default recommendation during quota pressure: block AI training crawlers.

2. Rate limiting for proxy endpoints
   - Apply WAF rate limit to `/hiro/*`.
   - Start with conservative threshold and tune from logs.
   - Example baseline policy:
     - Condition: path starts with `/hiro/`
     - Threshold: `>= 60` requests per `60s` per IP
     - Action: managed challenge or temporary block (`10m`)

3. Bot score/challenge
   - For high-risk bot scores, challenge on `/hiro/*` before allowing origin access.

4. Environment parity gate (preview vs main)
   - Ensure `HIRO_API_KEYS`/`HIRO_API_KEY_*` are set identically for required environments.
   - Verify with a pre-release checklist item; do not rely on manual memory.

## Function-level cache controls (`P1`)

These are code changes (not dashboard-only changes):

1. Add short-TTL edge caching for safe read-only result classes in the Hiro proxy.
2. Maintain strict allowlist and TTL map per endpoint/function.
3. Cache only successful responses (`200`), and avoid caching mutation routes.
4. Include request signature inputs in cache key (network + endpoint + method + relevant body hash).

Suggested first TTL profile:

- hot read-only status endpoints: `5-15s`
- semi-static metadata endpoints: `30-120s`
- error responses: do not cache long-lived failures

## Validation checklist

Before enabling broadly:

1. Confirm viewer/preview correctness remains unchanged under normal load.
2. Simulate upstream `429` and verify:
   - no sticky missing metadata state in viewer,
   - request volume remains bounded,
   - recoverability after cooldown.
3. Confirm Cloudflare analytics show lower request growth slope on `/hiro/*`.

After rollout:

1. Review 24h metrics:
   - request count,
   - cache hit trend,
   - `429` count trend.
2. Review 72h metrics and adjust thresholds/TTLs.

## Rollback plan

If user-facing regressions appear:

1. Disable new proxy cache branch via feature flag/env guard.
2. Revert WAF threshold to less aggressive challenge mode.
3. Keep crawler block policy enabled while stabilization occurs.
4. Log incident window and add postmortem notes to optimisation baseline.
