# Rollout Checklist

## Pre-Work

1. Read `docs/app-reference.md`.
2. Read all docs in this folder.
3. Capture baseline UX timings and logs.

## Build Order

1. Implement cache budget/eviction primitives.
2. Implement preloader queue service.
3. Integrate with Viewer screen controls.
4. Add optional adaptive batch optimization.
5. Add tests and update docs.

## Feature Flag Strategy

1. Ship with mode default `off` or `current-page` behind config toggle.
2. Enable `current-page` first.
3. Evaluate logs/metrics.
4. Optionally enable `current-plus-recent` after validation.

## Acceptance Gates

1. No increased error rate in read-only calls.
2. No significant layout regressions.
3. Page revisit latency improves materially.
4. IDB usage remains within configured bounds.

## Post-Deploy Observability

Track:

1. preload jobs completed/skipped/cancelled,
2. cache hit rate,
3. eviction counts,
4. read-only backoff occurrences,
5. median time-to-preview on recent-page revisit.
