# Protocol Design

## Core objects

- `profile-manifest`: current public identity view for a person or team
- `artifact-reference`: link to work objects with role and context metadata
- `contribution-claim`: declared contribution with evidence and optional verifier references
- `endorsement-object`: peer, client, institutional, or automated attestation
- `learning-node`: course, apprenticeship, challenge, or milestone completion

## Potential protocol rules

- claims should attach to artifacts or outcomes, not only free-form descriptions
- endorsements should identify their scope and confidence, not imply blanket trust
- privacy controls should allow selective disclosure of some graph branches
- negative or disputed history needs a careful model that avoids permanent abuse

## Bitcoin / Stacks / Xtrata fit

- Xtrata-like artifact references can tie identity to real work outputs
- Stacks contracts can manage attestations, profile registries, and permissioned views
- indexers can build search and discovery layers without owning the underlying identity graph
