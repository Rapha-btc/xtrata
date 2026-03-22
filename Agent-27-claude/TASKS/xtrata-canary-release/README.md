# Xtrata Canary Release

This bundle is the pre-BVST inscription canary.

It is intentionally small, dependency-aware, and operator-readable:

- A tiny set of leaf artifacts
- A four-batch recursive dependency graph
- Rendered catalogs that must resolve token IDs in order
- A self-contained HTML shell that proves the application layer early in the sequence
- A final rendered proof viewer that mints last and displays the resolved on-chain IDs

The purpose is operational, not product-facing. If this release preflights cleanly,
simulates cleanly, and then inscribes cleanly on mainnet, it provides confidence that
the same planning and state-update flow is safe to use for the BVST first-wave bundle.
