# XIP-004: Xtrata Namespace Standard

- Status: Draft
- Category: Standards Track
- Depends on: XIP-001 (manifest envelope)

## Abstract

XIP-004 defines how human-readable names resolve to Xtrata manifests and
inscriptions. Naming is a **uniqueness** problem and is therefore kept out of
the non-exclusive manifest layer (XIP-001). Instead of inventing a registry,
XIP-004 anchors names to an existing on-chain uniqueness primitive — BNS / BNSv2
— that the authority verifiably controls.

## Core principle

> Manifests may overlap freely; names may not. Uniqueness must come from a layer
> that already enforces it.

## Why not a manifest-based registry

XIP-001 manifests are intentionally non-exclusive: many may describe the same
inscription. That model cannot arbitrate "who owns the name `studio`," so a
namespace MUST NOT be expressed as an XIP-001 manifest type. A name needs a
single, on-chain, contestable owner.

## Anchoring to BNS

A namespace is a Stacks BNS / BNSv2 name the authority controls:

- Ownership of the name is resolved on-chain via BNS/BNSv2 (already integrated
  by Xtrata tooling).
- The name owner publishes a **pointer record** that resolves the name to a root
  Xtrata manifest inscription (XIP-001). Because that manifest is itself an
  inscription, its authorship is contract-attested.
- Authority over everything under the name therefore derives from: *controls the
  BNS name* → *authored the root manifest on-chain*.

## Name resolution

A namespaced reference has the form:

```
name.btc[/path][:inscriptionId]
```

Resolution algorithm (deterministic):

1. Resolve `name.btc` ownership via BNS/BNSv2 → owner address `A`.
2. Locate the root manifest inscription published by `A` for this name.
3. Verify the manifest passes XIP-001 authority checks (authored on-chain by `A`).
4. Resolve `path` within the manifest (sub-collections), then `inscriptionId`
   against the canonical core.

If any step fails, resolution fails closed — consumers MUST NOT fall back to an
unverified manifest.

```json
{
  "standard": "xip-001",
  "version": "1.0.0",
  "type": "collection",
  "name": "studio",
  "namespace": { "system": "bnsv2", "name": "studio.btc" }
}
```

## Conflict & precedence

- The BNS/BNSv2 owner of a name is the sole authority for that name.
- If a name changes hands, resolution follows current on-chain ownership; prior
  manifests do not retain authority over the name (though their inscriptions
  remain valid as data).
- A namespace claim that does not match current BNS ownership MUST be rejected.

## Relationship to other layers

- XIP-001 — the manifest a name resolves to.
- XIP-002 — marketplaces use namespace ownership as a strong signal of
  authoritative collection identity.
- XIP-003 — provenance is unaffected by naming; names are presentation, not
  provenance.

## Out of scope

- A bespoke Xtrata-native name registry. If ever desired it would be a separate
  proposal; this standard deliberately reuses BNS rather than competing with it.

## Summary

Names resolve to inscribed manifests, and their uniqueness is borrowed from BNS —
giving Xtrata human-readable, contestable, verifiable namespaces without a new
registry.
