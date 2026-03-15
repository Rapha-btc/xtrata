# Ledger-Native Systems

This folder is a research lab for application architectures where the primary object is not just a file or token, but a ledger-linked graph of artifacts, dependencies, contribution history, and programmable economics.

Inspired by the Audionals model, the working thesis is:

`object = artifact + ownership + dependency graph + contribution history + programmable economics`

## Why this area exists

- explore product categories that become more useful when lineage is first-class
- map where Bitcoin, Stacks, and Xtrata-like recursive inscriptions fit together
- separate protocol and graph research from first-party app implementation
- leave clean conceptual scaffolding for future prototypes

## Shared architecture pattern

Most concepts in this folder assume five layers:

1. Canonical artifact layer: immutable media, manifests, rules, or texts anchored on-chain.
2. Graph layer: references between objects, versions, forks, and derivatives.
3. Rights layer: royalties, governance, licensing, access control, or reputation rules.
4. Indexing layer: off-chain graph materialization, search, caching, and traversal.
5. Experience layer: apps that reconstruct, remix, govern, or inspect the graph.

## Concept Index

- [creative-dna-remix-genome](./creative-dna-remix-genome/) - creative works as reusable component graphs with automatic upstream attribution.
- [autonomous-ai-artist-memory-chains](./autonomous-ai-artist-memory-chains/) - AI creative agents with prompts, datasets, models, and outputs tracked as lineage.
- [fully-onchain-game-engines](./fully-onchain-game-engines/) - games assembled from on-chain rules, assets, maps, and engine modules.
- [executable-knowledge-objects](./executable-knowledge-objects/) - papers and research artifacts linked to datasets, code, experiments, and reviews.
- [evolutionary-dao-governance](./evolutionary-dao-governance/) - DAO constitutions that branch, fork, and evolve as dependency graphs.
- [self-assembling-remixable-films](./self-assembling-remixable-films/) - films expressed as timeline graphs of scenes, edits, effects, and score layers.
- [skill-graphs-instead-of-cvs](./skill-graphs-instead-of-cvs/) - people represented by verifiable contribution graphs instead of static resumes.
- [living-legal-systems](./living-legal-systems/) - statutes, precedent, amendments, and commentary modeled as linked legal graphs.
- [physical-objects-with-life-histories](./physical-objects-with-life-histories/) - real-world objects with lifecycle ledgers for manufacture, repair, ownership, and use.
- [civilization-scale-cultural-graph](./civilization-scale-cultural-graph/) - a global cultural graph linking media, ideas, institutions, and derivative works.

## Cross-cutting research questions

- What should be fully on-chain versus only content-addressed and referenced?
- How should dependency edges encode attribution, permissions, and revenue splits?
- Which index views need to be deterministic enough to reconstruct from chain data alone?
- How should mutable social signals coexist with immutable provenance records?
- Where do Xtrata-style recursive objects outperform simpler NFT or storage-only models?

## Working conventions

- each concept folder is documentation-first and intentionally scaffolded for future prototyping
- diagrams stay simple and focus on object relationships, not final implementation detail
- Bitcoin is treated as the durable artifact anchor; Stacks is treated as the programmable coordination layer
- Xtrata-like systems are treated as a useful reference model for chunked storage, recursive references, and reconstruction
