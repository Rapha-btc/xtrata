# XIP-000: Xtrata Improvement Proposal Process

- XIP: 000
- Title: XIP Process
- Status: Active
- Category: Process
- Spec version: 1.0.0

## Abstract

Xtrata Improvement Proposals (XIPs) are the design documents that define the
standards, formats, interfaces and conventions used by wallets, marketplaces,
explorers, indexers and applications across the Xtrata ecosystem. XIP-000 defines
how XIPs are written, reviewed, numbered, versioned, and changed — including the
mandatory header schema, the normative-language convention, and the requirement
that integrity-bearing standards ship reproducible test vectors.

## 1. Why a process

Xtrata exists to remove pointer-rot: permanent facts on-chain, stable references
forever. A standards process that cannot itself answer "which version of XIP-001
is current, and what exactly does it say?" would undermine that premise. XIP-000
therefore pins document versioning and conformance as firmly as the standards pin
data.

## 2. Normative language

Standards Track and Process XIPs **MUST** use RFC 2119 / RFC 8174 keywords
(**MUST**, **SHOULD**, **MAY**, etc.) with their RFC meanings, and **MUST**
include the standard RFC 8174 boilerplate near the top. Informational XIPs
**SHOULD** avoid normative keywords, except (a) when quoting another XIP, or
(b) for **fidelity constraints** — rules that a derived view or report must obey
to stay faithful to on-chain facts (e.g. "MUST NOT invent a relationship the
contract cannot confirm"). Such keywords constrain *representation accuracy*, not
new on-chain or wire behaviour. Anything that defines *implementable conformance*
behaviour belongs in a Standards Track XIP, not an Informational one.

## 3. Categories

- **Standards Track** — defines interoperable, normative formats and behaviours
  third parties implement (e.g. XIP-001 envelope, XIP-002 identity, XIP-006
  resolver conformance, XIP-007 marketplace).
- **Informational** — guidance, conventions, and *views* that introduce no new
  normative on-chain or wire behaviour (e.g. XIP-004 provenance, which only
  reveals contract facts under fidelity constraints, §2).
- **Process** — governance and procedure (this document).

## 4. Header schema (REQUIRED)

Every XIP **MUST** begin with a metadata block containing at least:

| Field | Req. | Meaning |
|-------|------|---------|
| `XIP` | MUST | The number (e.g. `001`). |
| `Title` | MUST | Short title. |
| `Status` | MUST | One of §6. |
| `Category` | MUST | Standards Track \| Informational \| Process. |
| `Spec version` | MUST | SemVer of the document's normative content. |
| `Requires` | SHOULD | XIPs that MUST be implemented first. |
| `Required-By` | MAY | Reverse pointers (informational). |
| `Replaces` / `Superseded-By` | conditional | For supersession (§7). |

## 5. Numbering & document versioning

- XIPs are assigned **sequential integer identifiers**; numbers are **never
  reused** for a different proposal.
- The initial corpus is numbered to follow the conceptual stack (governance →
  foundations → semantics → resolution → applications), so a lower number is
  generally a thing a higher one builds on. This is an authoring convenience; the
  **authoritative** dependency graph is always the explicit `Requires` /
  `Required-By` headers, which a tool should read rather than inferring order from
  the number.
- A renumbering of an **already-published** XIP is **PROHIBITED**: once a XIP has
  left Draft and others reference it, its number is permanent. Restructure by
  adding new XIPs and marking old ones `Superseded-By`, never by reassigning a
  live number. (Reordering is only acceptable while the whole batch is still
  Draft and unpublished, as was done once before ratification.)
- **Document versioning:** the normative content of a XIP is versioned by
  `Spec version` (SemVer): PATCH for errata/clarifications that do not change
  conformance, MINOR for backward-compatible additions, MAJOR for
  conformance-breaking changes. A MAJOR change to a published standard
  **SHOULD** instead be a new XIP that supersedes the old, so live references
  remain stable.

## 6. Lifecycle (status)

```
Draft -> Review -> Last Call -> Accepted -> Final
                                   |           |
                                   v           v
                              Withdrawn    Superseded / Deprecated
```

| Status | Meaning | Who sets it |
|--------|---------|-------------|
| **Draft** | Under active authoring; may change freely. | Author |
| **Review** | Stable enough for implementer feedback. | Author + Editor |
| **Last Call** | Final review window before acceptance; a fixed period is announced. | Editor |
| **Accepted** | Approved; implementations encouraged. | Editor |
| **Final** | Ratified and stable; changes only via new spec version or superseding XIP. | Editor |
| **Active** | For Process XIPs that remain perpetually in force (this one). | Editor |
| **Withdrawn** | Abandoned by the author. | Author |
| **Deprecated** | No longer recommended, not yet replaced. | Editor |
| **Superseded** | Replaced; carries `Superseded-By`. | Editor |

A XIP **MUST NOT** advance past **Review** while it depends (`Requires`) on a XIP
that is itself below the same status — foundations ratify first.

## 7. Supersession

A superseding XIP **MUST** set `Replaces: <old>`; the superseded XIP **MUST** be
updated to `Status: Superseded` with `Superseded-By: <new>`. The old document is
never deleted (permanence applies to standards too).

## 8. Roles

- **Author** — writes and revises the XIP.
- **Editor(s)** — steward the repository: assign numbers, check the header
  schema and template, manage status transitions and Last Call, and confirm the
  test-vector requirement (§9) is met. Editors arbitrate process, not technical
  merit.
- **Implementers / reviewers** — the wallets, marketplaces, indexers and explorers
  whose feedback gates Review → Accepted.

## 9. Reproducibility requirement (REQUIRED for integrity-bearing XIPs)

Any Standards Track XIP that defines a hash, signature, canonicalisation, or
Merkle/integrity commitment **MUST**:

1. specify the algorithm to byte-exactness (no "sorted JSON" hand-waving), and
2. include at least one **reproducible test vector** (input → exact canonical
   bytes → exact digest), and
3. reference or ship a **reference implementation** that regenerates those
   vectors.

A XIP failing this requirement **MUST NOT** advance past **Review**. Where a
published vector and prose disagree, the **vector is authoritative** and the prose
is errata. (XIP-001 establishes the canonicalisation/Merkle profile all others
reuse.)

## 10. XIP template

```
# XIP-NNN: <Title>

- XIP: NNN
- Title: <Title>
- Status: Draft
- Category: Standards Track | Informational | Process
- Requires: <list or none>
- Spec version: 0.1.0

> RFC 2119 / RFC 8174 keywords apply.

## Abstract
## Motivation
## Specification        (normative; pseudocode + field tables + MUST/SHOULD/MAY)
## Test vectors         (REQUIRED if integrity-bearing)
## Security considerations
## Conformance
## Relationship to other XIPs
## Summary
```

## 11. Principles

Permanence · Simplicity · Composability · Verifiability · Decentralisation.

The Xtrata contract preserves data and provenance; XIPs preserve interoperability;
XIP-000 preserves the standards themselves.

## 12. The current corpus

| XIP | Title | Category | Status | Requires |
|-----|-------|----------|--------|----------|
| 000 | XIP Process | Process | Active | — |
| 001 | Manifest Envelope, Canonicalisation & Integrity | Standards Track | Draft | 000 |
| 002 | Canonical Inscription Reference & Identity | Standards Track | Draft | 000, 001 |
| 003 | Organisational Manifests | Standards Track | Draft | 001, 002 |
| 004 | Provenance Graph | Informational | Draft | 001, 002 |
| 005 | Namespace | Standards Track | Draft | 001, 002 |
| 006 | Indexer & Resolver Conformance | Standards Track | Draft | 001–005 |
| 007 | Marketplace | Standards Track | Draft | 001, 002, 003, 005, 006 |
| 008 | Software Package | Standards Track | Draft | 001, 002, 004, 006 |

Recommended ratification order follows `Requires`: **001 and 002 first**, then
003/004/005/006, then the application layers 007 and 008.

## Summary

XIP-000 makes the standards process as durable as the data: explicit headers,
RFC-2119 normativity, never-reused numbers, SemVer document versioning,
supersession instead of mutation, and a hard test-vector gate so no
integrity-bearing standard ships ambiguous bytes.
