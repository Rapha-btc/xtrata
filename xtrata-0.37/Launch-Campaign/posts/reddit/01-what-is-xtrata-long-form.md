# Reddit Post: What is Xtrata?

## Title
What is Xtrata? A recursive on-chain memory layer for Bitcoin (Stacks)

## Body
Hi everyone, we’re launching **Xtrata** and wanted to share a clear overview of what it is and why we built it.

Xtrata is an **on-chain memory layer for Bitcoin (via Stacks)**.
The goal is simple: make media and app data **permanent, reconstructable, and composable** on-chain.

Here’s the core idea:

- Most NFT flows stop at metadata pointers.
- Xtrata focuses on storing and reconstructing the actual payload flow on-chain.
- Inscriptions can reference other inscriptions, so you can build **recursive, modular media/apps** instead of isolated blobs.

What that enables:

- **Permanence:** data model designed for long-term on-chain access.
- **Deterministic reconstruction:** same bytes, same result.
- **Recursion/composability:** parent-child relationships between inscriptions.
- **Compatibility:** SIP-009 compatible NFT behavior for broader ecosystem interoperability.
- **Practical scale patterns:** chunked upload/read patterns for larger payload workflows.

Who this is for:

- Builders who want composable on-chain primitives
- Creators who want permanent, verifiable media
- Collectors/curators who care about provenance that can be reconstructed and checked

If you’re technical, you can think of it as an attempt to move from “token as pointer” toward “token as verifiable on-chain data graph.”

If you’re a creator, think “mint media that lives on-chain and can reference other works in a composable structure.”

If you’re a collector, think “provenance and dependencies you can verify instead of trusting external storage.”

We’re looking for feedback from this community on:

1. Most valuable early use cases (art, music, data, mini-apps, other)
2. What you’d want to see in a public viewer first
3. What would make this actually useful (not just novel)

Explore: https://xtrata.xyz

If helpful, I can also post a follow-up technical deep dive explaining the exact mint/reconstruction flow step-by-step.
