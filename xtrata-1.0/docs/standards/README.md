# Xtrata Standards

This folder contains protocol and product standards intended for long-term
third-party integration, marketplace compatibility, preservation, indexing and
collection tooling.

## Standards

- [`xtrata-collection-manifest-standard.md`](xtrata-collection-manifest-standard.md)
  defines the Xtrata Collection Manifest format: the canonical collection-level
  control document for identity, provenance, item mapping, reconstruction,
  marketplace display, rights, validation and future composable data tools.
- [`xtrata-manifest-validation.md`](xtrata-manifest-validation.md)
  defines expected validator behavior, validation levels, error codes,
  canonicalization, signature checks and validation report shape.

## Schemas

- [`../../schemas/xtrata-collection-manifest.schema.json`](../../schemas/xtrata-collection-manifest.schema.json)
  is the draft JSON Schema for Xtrata Collection Manifests.

## Examples

- [`examples/minimal-marketplace-manifest.json`](examples/minimal-marketplace-manifest.json)
  is a Level 1 example for a simple marketplace-facing art collection.
- [`examples/preservation-migration-manifest.json`](examples/preservation-migration-manifest.json)
  is a Level 2 example for a fixed sequential preservation migration.
- [`examples/audiovisual-preservation-manifest.json`](examples/audiovisual-preservation-manifest.json)
  is a Level 2 audiovisual preservation example with images, audio and
  generation context.
- [`examples/full-composable-manifest.json`](examples/full-composable-manifest.json)
  is a Level 3 example for Audionals, BVST-style runtime modules and
  composable data tools.

## Intended Use

Standards in this folder should be stable enough for external builders to
reference. Drafts may evolve, but they should be written as implementation
targets rather than loose planning notes.
