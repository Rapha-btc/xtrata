# Protocol Design

## Core objects

- `legal-text-object`: statute, regulation, code section, or treaty segment
- `case-object`: decision, concurrence, dissent, or procedural order
- `amendment-object`: targeted change set against prior legal text
- `interpretation-object`: commentary, summary, or machine-generated explanation
- `jurisdiction-manifest`: active legal graph snapshot for a place or institution

## Potential protocol rules

- citation edges should be typed by relation such as applies, narrows, overturns, or clarifies
- text granularity should support clause-level references where practical
- authoritative publication state must be distinguishable from third-party commentary
- translation and summary objects should preserve provenance and confidence markers

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-style manifests can anchor canonical legal texts and amendment histories
- Stacks contracts can manage publication registries, timestamped codification order, and civic funding rules
- indexers can support precedent maps, clause diffs, and temporal legal snapshots
