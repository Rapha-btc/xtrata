# Protocol Design

## Core objects

- `prompt-object`: prompt text, prompt template, or system instruction reference
- `model-reference`: model family, version, provider, and capability notes
- `dataset-reference`: training or retrieval source descriptors with rights metadata
- `agent-run-manifest`: ordered record of inputs, tool calls, critiques, and outputs
- `memory-branch`: named branch representing a persistent creative persona or series

## Potential protocol rules

- every published output should reference the run manifest that produced it
- privacy tiers should separate public lineage from private prompt or data details
- rights metadata should distinguish source ownership from allowed reuse
- critique and human-edit objects should remain first-class edges, not free-text notes

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata-like inscriptions can anchor prompts, outputs, and run manifests
- Stacks contracts can register agent identities, licensing, and revenue splits
- off-chain semantic indexes can support prompt and memory search without redefining canonical lineage
