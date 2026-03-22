# Manifest Templates

These templates match the runtime files and operator flow now used by the frozen BVST bundle.

## 1. Runtime Token Map Entry

```json
{
  "generated_for": "on-chain-modules",
  "initialized_at": "2026-03-21T00:00:00.000Z",
  "source_template": "configs/token-map.template.json",
  "entries": {
    "bvst.runtime.patch-runtime.v1.0.0": {
      "token_id": null,
      "txid": null,
      "block_height": null
    }
  }
}
```

## 2. Rendered Catalog Index Entry

```json
{
  "name": "bvst.plugin.universalsynth.release.v1.0.13",
  "batch_file": "20-universalsynth-family.batch.json",
  "order": 120,
  "status": "ready",
  "template_path": "on-chain-modules/catalogs/plugins/universalsynth-family/universalsynth.release.catalog.json",
  "template_sha256": "fcb24c743503724582428092fbaa4e99c3da7882f00ef8e97d8206ec931e96e5",
  "direct_dependency_names": [
    "bvst.plugin.universalsynth.manifest.v1.0.13",
    "bvst.plugin.universalsynth.patch.v1.0.13",
    "bvst.plugin.universalsynth.shell.v1.0.13",
    "bvst.catalog.runtime.v1",
    "bvst.catalog.engine.v1",
    "bvst.catalog.schema.v1"
  ],
  "direct_dependency_token_ids": [237, 238, 240, 208, 202, 209],
  "resolved_dependency_names": [
    "bvst.catalog.foundation.v1",
    "bvst.catalog.runtime.v1",
    "bvst.catalog.engine.v1",
    "bvst.catalog.schema.v1",
    "bvst.plugin.universalsynth.manifest.v1.0.13",
    "bvst.plugin.universalsynth.patch.v1.0.13",
    "bvst.plugin.universalsynth.shell.v1.0.13"
  ],
  "missing_dependencies": [],
  "resolution_signature": "abc123...",
  "resolved_at": "2026-03-21T17:36:41.889Z",
  "resolved_from": "configs/token-map.runtime.json",
  "rendered_path": "on-chain-modules/rendered/catalogs/plugins/universalsynth-family/universalsynth.release.catalog.json",
  "rendered_sha256": "def456...",
  "rendered_bytes": 2195,
  "rendered_chunks": 1,
  "rendered_route": "helper",
  "route_expected": "helper",
  "route_matches_expected": true,
  "unresolved_paths": [],
  "inscribed": null
}
```

## 3. Inscription Log Entry

```json
{
  "name": "bvst.catalog.root.v1",
  "kind": "catalog",
  "token_id": 254,
  "txid": "0x...",
  "block_height": 123456,
  "sha256": "7fcddc98c7fd1aac73406d3755a6f6762bfa0edfbdaebb82a178c75709d1f931",
  "bytes": 1103,
  "chunks": 1,
  "route": "helper",
  "dependency_names": [
    "bvst.catalog.foundation.v1",
    "bvst.catalog.release.firstwaveinstruments.v1"
  ],
  "dependency_token_ids": [205, 206],
  "local_source_path": "on-chain-modules/rendered/catalogs/root/root.catalog.json",
  "rendered_path": "on-chain-modules/rendered/catalogs/root/root.catalog.json",
  "resolution_signature": "abc123...",
  "recorded_at": "2026-03-21T18:00:00.000Z"
}
```

## 4. Operator Command Template

```bash
node TASKS/BVST-on-chain-framework/scripts/apply-inscription-result.mjs \
  --name <artifact-name> \
  --token-id <token-id> \
  --txid <txid> \
  --block-height <block-height>
```

## 5. Release Checklist

```text
[ ] verify-bundle.mjs passed
[ ] preflight quote refreshed
[ ] token-map.runtime.json initialized
[ ] inscription-log.json initialized
[ ] rendered-index.json initialized
[ ] leaf artifact minted
[ ] live result recorded immediately
[ ] dependent catalog became ready before mint
[ ] rendered catalog minted from rendered/
[ ] final token IDs committed back into release records
```
