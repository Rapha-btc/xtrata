# XIP-001: Xtrata Manifest Standard

## Abstract

XIP-001 defines a standard manifest format for describing, organising and presenting Xtrata-inscribed data.

## Core Principle

The contract preserves facts.

The manifest preserves context.

## Hard Provenance

Authoritative contract-level facts:

- creator
- owner
- hash
- mime type
- sealed status
- parents
- dependencies
- migration lineage

Manifests must not override contract-level facts.

## Soft Provenance

Manifest-level context may include:

- title
- description
- artist display name
- collection membership
- album membership
- exhibition grouping
- traits
- display order
- curatorial information

## Manifest Types

- collection
- album
- gallery
- archive
- exhibition
- namespace
- playlist
- software-package
- marketplace-launch
- provenance-graph

## Root Structure

```json
{
  "standard": "xip-001",
  "version": "1.0.0",
  "type": "collection",
  "name": "Example Collection"
}
```

## Authority

Example:

```json
{
  "authority": {
    "type": "creator",
    "address": "SP..."
  }
}
```

## Collection Relationships

Collections reference inscriptions.

Inscriptions do not need to reference collections.

Multiple manifests may reference the same inscription.

## Mapping Types

### Explicit

```json
{
  "mapping": {
    "type": "explicit",
    "items": []
  }
}
```

### Sequential

```json
{
  "mapping": {
    "type": "sequential",
    "tokenStart": 1,
    "tokenEnd": 10000,
    "inscriptionStart": 5000
  }
}
```

## Summary

The Xtrata contract preserves content and provenance.

The manifest layer preserves meaning and organisation.
