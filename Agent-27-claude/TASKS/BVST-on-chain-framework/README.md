# On-Chain Modules

This folder stages the BVST recursive foundation and the first standalone-ready instrument wave into one deployable working set. It is the execution companion to the planning docs in [`../on-chain-planning/README.md`](../on-chain-planning/README.md), especially:

- [`../on-chain-planning/02-module-strata.md`](../on-chain-planning/02-module-strata.md)
- [`../on-chain-planning/03-recursive-dependency-graph.md`](../on-chain-planning/03-recursive-dependency-graph.md)
- [`../on-chain-planning/04-xtrata-inscription-workflow.md`](../on-chain-planning/04-xtrata-inscription-workflow.md)
- [`../on-chain-planning/05-roadmap.md`](../on-chain-planning/05-roadmap.md)

## What Is Included

- `workspace/`: runnable staged copies of the shared runtime plus the first-wave instrument shells, manifests, and patches
- `catalogs/`: generated foundation, family, release, and root catalog JSON files
- `batches/`: ready-to-use inscription plans ordered for dependency-safe Xtrata publishing
- `verification/`: hashes, chunk counts, dependency graph, and local readiness summaries
- `configs/`: token-map and Xtrata network templates
- `scripts/`: rebuild and verification tooling for this bundle

## First-Wave Instrument Scope

The initial on-chain set is intentionally conservative:

- `UniversalSynth`, `UniversalEngine`, `JMS10`
- `RetroKeys`, `BlueMarvinOne`, `BlueMarvinTwo`, `NeonPoly`

These give one strong recursive family around `UniversalSynth` plus a small set of dedicated standalone synths that are useful as canaries and early catalog entries. `BamMono`, `TechBass`, and `CelestialPad` are intentionally deferred until their standalone behavior is hardened.

## Commands

From the repo root:

```bash
node on-chain-modules/scripts/build-bundle.mjs
node on-chain-modules/scripts/verify-bundle.mjs
node on-chain-modules/scripts/serve-workspace.mjs --port 8123
```

To smoke-test the staged standalone plugins locally, serve `on-chain-modules/workspace/` with any static server and open a plugin page under `workspace/Plugins/Instruments/<PluginName>/gui.html`.

## Deployment Notes

- The generated module and catalog files are ready for local release preparation and dependency linking.
- Use [`INSCRIPTION_AUTOMATION.md`](./INSCRIPTION_AUTOMATION.md) as the runbook for an agent that will mint leaves, update token maps, render dependent catalogs, and then inscribe those dependents.
- Fill `configs/xtrata-network.template.json` and `configs/token-map.template.json` during inscription.
- The current rack host is not bundled as a release target here because it still depends on local catalog/server APIs; this bundle targets recursive module publishing and standalone BVST deployment first.
