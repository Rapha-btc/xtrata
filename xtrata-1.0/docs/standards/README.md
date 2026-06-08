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
- [`xtrata-manifest-templates/schemas/xtrata-core-manifest-standard.json`](xtrata-manifest-templates/schemas/xtrata-core-manifest-standard.json)
  is the shared machine-readable baseline for the modular manifest template set.

## Manifest Templates

- [`xtrata-manifest-templates/README.md`](xtrata-manifest-templates/README.md)
  is the active entry point for the modular manifest template package.
- [`xtrata-manifest-templates/00-manifest-index.json`](xtrata-manifest-templates/00-manifest-index.json)
  indexes root templates, specialist folders and shared standards.
- [`xtrata-manifest-templates/MANIFEST_USE_GUIDE.md`](xtrata-manifest-templates/MANIFEST_USE_GUIDE.md)
  expands the manifest index into a practical guide covering every template,
  expected uses, project combinations and validation expectations.
- [`xtrata-manifest-templates/collections/minimal-marketplace-manifest.json`](xtrata-manifest-templates/collections/minimal-marketplace-manifest.json)
  is the collection template for simple marketplace-facing art collections.
- [`xtrata-manifest-templates/collections/preservation-migration-manifest.json`](xtrata-manifest-templates/collections/preservation-migration-manifest.json)
  is the collection template for fixed sequential preservation migrations.
- [`xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json`](xtrata-manifest-templates/collections/audiovisual-preservation-manifest.json)
  is the collection template for audiovisual preservation with images, audio and generation context.
- [`xtrata-manifest-templates/collections/full-composable-manifest.json`](xtrata-manifest-templates/collections/full-composable-manifest.json)
  is the collection template for Audionals, BVST-style runtime modules and composable data tools.

## Intended Use

Standards in this folder should be stable enough for external builders to
reference. Drafts may evolve, but they should be written as implementation
targets rather than loose planning notes.
