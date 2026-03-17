# Protocol Design

## Core objects

- `artifact-node`: base object type shared across cultural domains
- `relationship-edge`: typed relation such as derives-from, cites, interprets, funds, or translates
- `collection-manifest`: curated subset or institutional view over artifact nodes
- `policy-object`: rights, stewardship, funding, or access control metadata
- `ontology-map`: schema bridge between domain-specific vocabularies

## Potential protocol rules

- relationship edges must be typed and sourceable, not inferred silently by one indexer
- domain-specific schemas should map into a shared base model without erasing differences
- collections should preserve curatorial context instead of pretending to be neutral
- policy objects should support both public-domain and restricted stewardship patterns

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-like objects can anchor canonical manifests for durable cultural references
- Stacks contracts can manage stewardship, grants, licensing, and collection governance
- federated indexers can expose different lenses over the same base graph without fragmenting IDs
