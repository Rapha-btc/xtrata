# XIP-005: Xtrata Software Package Standard

- Status: Draft
- Category: Standards Track
- Depends on: XIP-001 (manifest envelope), XIP-003 (provenance)

## Abstract

XIP-005 profiles the XIP-001 envelope for **software packages** inscribed on
Xtrata: code, modules, recursive web apps, runtimes and their dependency graphs,
stored as permanent, verifiable, reconstructable on-chain artifacts.

## Core principle

> A package is data with an entry point and a dependency closure. Both must be
> verifiable from the chain.

## Package manifest

A package is an XIP-001 manifest of type `software-package` (an envelope
profile; not an XIP-001 organisational type):

```json
{
  "standard": "xip-001",
  "version": "1.0.0",
  "type": "software-package",
  "name": "example-runtime",
  "package": {
    "entry": "SP....xtrata-v3-2-3:412",
    "runtime": "html",
    "files": [
      { "path": "index.html", "inscriptionId": 412 },
      { "path": "engine.js",  "inscriptionId": 413 }
    ],
    "dependencies": [414, 415],
    "integrityRoot": "0x..."
  }
}
```

- `entry` is the inscription a consumer loads first.
- `files` maps logical paths to inscriptions so a package can be reassembled
  deterministically.
- `dependencies` reuse the Xtrata core's dependency relation (hard fact), so the
  closure is verifiable on-chain (XIP-003).
- `integrityRoot` commits to the full file + dependency set.

## Dependency closure & resolution

- The complete set of inscriptions required to run a package is its **dependency
  closure**, derived by transitively following the contract's `dependency`
  edges (XIP-003).
- A resolver MUST be able to reconstruct the closure from the chain alone and
  verify each artifact's content hash before execution.
- Runtime URL rewriting (e.g. resolving in-package references to on-chain
  content) MUST resolve only to inscriptions inside the verified closure.

## Versioning

Package versions form a chain via the XIP-001 parent graph: a new package
version inscribes the prior version id as a parent. Consumers follow the chain
from the authority for the latest authoritative release.

## Integrity & execution safety

- Every artifact MUST be content-hash verified against the contract before use.
- Executable packages SHOULD be run sandboxed; this standard does not grant
  trust, it only makes the artifact set verifiable and complete.
- A package MUST NOT depend on off-chain mutable resources for anything its
  `integrityRoot` claims to cover.

## Out of scope

- Build reproducibility of source → artifact (a higher-level concern).
- Package distribution incentives / sale → XIP-002.
- Human-readable package names → XIP-004.

## Summary

A software package is an XIP-001 envelope plus an entry point and a verifiable
dependency closure — letting code live on-chain as durably and checkably as any
other Xtrata inscription.
