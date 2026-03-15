# Protocol Design

## Core objects

- `claim-object`: atomic statement with evidence references and status markers
- `dataset-object`: versioned dataset with provenance, license, and access metadata
- `method-object`: code, notebook, workflow, or protocol definition
- `experiment-run`: parameterized execution record with outputs and environment notes
- `review-object`: peer review, replication, rebuttal, or amendment record

## Potential protocol rules

- claims should reference evidence objects directly, not only a top-level paper
- execution records should separate deterministic parameters from narrative interpretation
- review objects should attach to specific claim or method nodes when possible
- sensitive data must support permissioned or redacted reference patterns

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-style manifests can anchor claims, reviews, and reproducibility records
- Stacks contracts can coordinate registries, staking, and replication bounties
- specialized indexers can expose field-specific claim graphs and reproducibility dashboards
