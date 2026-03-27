# Runtime Notes

## 2026-03-27

### JMS10 runtime regressions

- Shared runtime assets such as `System/shared/bvst_unified_bg.wasm` must resolve through the full declared dependency graph, not only direct shell dependencies.
- Inline BVST shell modules can start twice if bootstrap replay fires before the original module reports activity. The runtime now marks inline module starts and delays fallback replay to avoid duplicate JMS10 boot.
- The runtime launcher inline script must never contain a literal `</script>` inside generated JavaScript strings. That breaks the launcher page itself and renders raw source into the document instead of launching the synth.

### Verification

- `npm run test:app -- src/lib/viewer/__tests__/recursive.test.ts src/lib/viewer/__tests__/runtime-smoke.test.ts functions/lib/__tests__/runtime-modules-route.test.ts functions/lib/__tests__/runtime-workspace-route.test.ts functions/lib/__tests__/runtime-content-route.test.ts`
- `npm run test:app -- src/lib/viewer/__tests__/runtime-launcher-html.test.ts`
