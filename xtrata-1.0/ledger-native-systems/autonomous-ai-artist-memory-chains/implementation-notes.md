# Implementation Notes

## Minimal prototype slice

- define a run manifest schema for prompt, model, dataset, tool, and output references
- mint a small chain of agent runs with visible branch history
- expose a viewer showing what changed between two runs

## Notes for future development

- treat provider-specific model identifiers as unstable and wrap them in normalized references
- keep private material separable from public lineage anchors
- capture human intervention explicitly so authorship is not overstated

## Possible first integrations

- Xtrata recursive manifests for run records
- Stacks-based licensing for prompt packs, memory branches, and derivative works
