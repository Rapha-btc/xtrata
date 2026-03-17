# Architecture

## Proposed ledger-native architecture

```mermaid
graph TD
  A["Component objects"] --> B["Work manifest"]
  C["Transform rules"] --> B
  D["Royalty policy"] --> B
  B --> E["Indexer / DAG resolver"]
  E --> F["Playback, render, and rights apps"]
```

## Data graph model

- `component -> work manifest`: a work references samples, layers, clips, or code modules by immutable ID
- `transform rule -> work manifest`: each edge can capture trim, timing, ordering, effects, or parameter changes
- `work manifest -> royalty policy`: payout logic is bound to the composition graph
- `work manifest -> descendant work manifest`: derivatives extend lineage instead of flattening it

## System layers

- artifact layer: chunks, media files, and manifests inscribed or content-addressed
- coordination layer: contracts for attribution, license flags, and split routing
- indexing layer: graph traversal, search, cached reconstruction, and descendant discovery
