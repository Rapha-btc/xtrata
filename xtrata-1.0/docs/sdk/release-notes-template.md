# SDK Release Notes Template

Use this template for each SDK release.

## Release metadata

- Release version: `<x.y.z>`
- Release date: `<YYYY-MM-DD>`
- Release owner: `<name>`
- Scope: `@xtrata/sdk`, `@xtrata/reconstruction`, or both

## Summary

One paragraph explaining what changed and why it matters for integrators.

## Highlights

1. `<major improvement 1>`
2. `<major improvement 2>`
3. `<major improvement 3>`

## Added

- `<new API/module/test/docs item>`

## Changed

- `<behavior change>`

## Fixed

- `<bug fix>`

## Deprecated

- `<deprecated path, if any>`

## Breaking changes

- `<none>` or detailed list with migration guidance.

## Migration guidance

- Link to `docs/sdk/migration-guide.md` and include release-specific steps.

## Validation evidence

Commands run:

```bash
npm run sdk:release:dry-run
```

Artifacts:

- `.artifacts/sdk/xtrata-sdk.publish.dry-run.txt`
- `.artifacts/sdk/xtrata-reconstruction.publish.dry-run.txt`
- `.artifacts/sdk/*.tgz`

## References

- Changelog: `docs/sdk/changelog.md`
- Historical implementation tracker: `docs/sdk/archive/implementation-plan.md`
- Compatibility matrix: `docs/sdk/compatibility-matrix.md`
