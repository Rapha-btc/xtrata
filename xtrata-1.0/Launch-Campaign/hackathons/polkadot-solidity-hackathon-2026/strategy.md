# Polkadot Solidity Hackathon 2026 Strategy

## Event snapshot
- Registration observed: 2026-02-16 to 2026-03-20.
- Hacking phase observed: 2026-03-01 to 2026-03-20.
- Prize framing observed: up to $30,000.
- Focus: Solidity on Polkadot Hub and related Web3 tracks.
- Confidence: high.

## Recommended entry
Build **Xtrata Hub Proof Pack (EVM edition)**.

## Why this is the best fit
- Event explicitly targets Solidity smart-contract teams.
- Xtrata’s chunking, seal, and deterministic reconstruction model is a strong
  infrastructure differentiator when adapted into an EVM-compatible MVP.
- Demonstrates chain-agnostic protocol thinking without over-scoping.

## Product concept
Create a Polkadot Hub Solidity contract set for:
- Content hash registration and chunk manifests.
- Seal/finalize logic with immutable provenance state.
- Verification endpoint for deterministic reconstruction checks.

## 60-second pitch
Xtrata Hub Proof Pack brings deterministic on-chain media verification to the
Polkadot Solidity ecosystem. Teams can register, seal, and verify structured
content with reproducible outputs, enabling wallets and marketplaces to trust
media provenance beyond pointer metadata.

## Hackathon scope
Must-have:
- Core Solidity contracts and tests.
- Minimal UI to register/seal/verify one content object.
- Demo showing proof failure on tampered data.

Stretch:
- Cross-chain proof reference back to existing Xtrata content IDs.
- Batch verification for marketplace ingestion.

## Submission checklist
- Lead with Solidity architecture and test coverage.
- Show contract gas/cost considerations.
- Keep MVP strict to one end-to-end flow with reproducible results.

## Sources
- https://polkadotsolidity.com/
- https://www.web3devltd.com/event/polkadot-solidity-hackathon-2026
