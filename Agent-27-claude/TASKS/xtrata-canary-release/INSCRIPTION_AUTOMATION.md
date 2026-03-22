# Canary Automation

This bundle is the pre-production recursive canary for Xtrata release operations.

Goals:

1. Prove that a multi-batch dependency graph is ordered correctly.
2. Prove that rendered catalogs become ready only after dependency token IDs exist.
3. Prove that the operator can record token IDs back into runtime state without drift.
4. Prove that a human-facing shell can still be treated as a normal leaf in the plan.
5. Prove that a final rendered HTML proof viewer can mint last with real resolved IDs embedded in its bytes.

Expected order:

1. `10-foundation.batch.json`
2. `20-application.batch.json`
3. `30-catalogs.batch.json`
4. `40-proof-viewer.batch.json`

Operator note:

- The shell HTML is intentionally self-contained so the early application artifact can be opened on its own.
- The recursive pressure is carried by the catalogs, not by external URLs or hosted assets.
- The final proof viewer is rendered after the root catalog resolves, so it can visibly show the real token IDs and txids for the release graph.
- Record every token ID using the generated `apply-inscription-result` command before minting the next dependency-bound artifact.
