# Verification And Troubleshooting

## Post-mint verification checklist

After minting the parent:

1. Open parent inscription in Xtrata Viewer.
2. Confirm loader log reports successful module fetches.
3. Confirm runtime provenance panel shows expected module IDs.
4. Confirm selected cartridge plays and responds to input.
5. Confirm no fallback-to-zero IDs in log output.

## On-chain checks

Use read-only calls:

- `get-dependencies(parentId)` should contain all leaf IDs.
- `get-inscription-meta(id)` should return sealed metadata for each module.
- `get-chunk(id, 0)` should return non-empty first chunk for each leaf.

## Typical failures and fixes

### Error: `runtimeModuleId must be a positive integer`

Cause:
- `runtimeModuleId` in `cabinet.html` is still `0`.

Fix:
- Replace with the real minted runtime ID.
- Re-mint parent.

### Error: `Module <id> returned zero chunks`

Cause:
- Wrong module ID, wrong contract, or wrong network.

Fix:
- Verify contract fields in `cabinet.html`.
- Verify module ID exists in target contract.
- Re-check sender/network alignment.

### Error: `Manifest module is invalid JSON`

Cause:
- Manifest content malformed before minting.

Fix:
- Validate JSON locally, then re-mint manifest and parent.

### Error: `logic module must export bootArcade/mountCartridge`

Cause:
- Wrong file inscribed for runtime or cartridge logic.

Fix:
- Ensure runtime exports `bootArcade`.
- Ensure cartridge logic exports `mountCartridge`.
- Re-inscribe correct module(s), then update manifest/parent IDs.

### Parent sealed but game does not load

Cause:
- Parent dependency list and manifest module IDs are out of sync.

Fix:
- Update `declaredDependencyIds` to match all referenced modules.
- Mint a new parent with corrected dependency list.

## Reliability recommendations

1. Keep module files small and text-based for predictable chunk reads.
2. Reuse module IDs when content is unchanged.
3. Keep a release worksheet of all IDs by version.
4. Test parent in viewer immediately after minting.
5. Never rely on unstated module IDs; keep everything explicit in manifest + dependencies.
