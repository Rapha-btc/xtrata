# Protocol Design

## Core objects

- `component-object`: immutable reusable asset with creator, media metadata, and license flags
- `work-manifest`: ordered dependency list plus transform instructions
- `lineage-edge`: typed reference describing reuse mode such as sample, visual layer, code import, or adaptation
- `royalty-policy`: revenue split rules keyed to dependency weights or role classes
- `release-record`: optional commercial packaging for a specific edition or distribution channel

## Potential protocol rules

- every derivative must declare explicit parent object IDs
- transforms should be typed so indexers can reconstruct meaning, not just detect reuse
- payout policies should support both fixed shares and graph-derived percentages
- license profiles should allow "reference allowed, commercial remix denied" style constraints

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-style recursive inscriptions can hold canonical media chunks and manifests
- Stacks contracts can manage registration, splits, collection packaging, and usage permissions
- an indexer can materialize the graph into reusable views for remix browsers and payout engines
