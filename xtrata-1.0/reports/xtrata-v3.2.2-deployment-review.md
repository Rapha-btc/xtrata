# Xtrata v3.2.2 — Deployment Review Packet

**Date:** 2026-06-07  
**Author:** stxtrata (Claude Code session)  
**Status:** Ready for mainnet deployment  
**Target contract:** `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-2`  
**Deployer wallet:** `Xtrata.btc` (Xverse) — `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X`

---

## 1. Decision Summary: Why v3.2.x, Not v3.4.0

The project had been tracking two candidate next versions:

- **v3.4.0** — a more ambitious rewrite targeting Clarity 4, with a new
  migration-source allowlist mechanism (`set-migration-source` /
  `is-migration-source`) and other protocol additions.
- **v3.2.2** — a minimal, surgical update to v3.2.1 that removes only dead
  code.

The decision to deploy v3.2.2 instead of v3.4.0 rests on three factors:

1. **On-chain evidence.** `xtrata-v3.2.1` was successfully deployed and
   exercised on mainnet the day before this session. All inscription, upload,
   sealing, and fee mechanics were confirmed live. v3.2.2's core logic is
   byte-for-byte identical to v3.2.1 in every path that was exercised.

2. **Risk surface.** v3.4.0 introduced Clarity 4 semantics, a new allowlist
   mechanism, and deployment sequencing steps that had not been tested
   on-chain. Deploying it would mean launching on an entirely unvalidated
   runtime upgrade. v3.2.2 carries none of that uncertainty.

3. **The only delta is dead code removal.** The sole difference between
   v3.2.1 and v3.2.2 is the removal of `migrate-from-v2-1-1` and its
   supporting branches in `get-migrated-chunk` / `get-migrated-chunk-batch`.
   The `xtrata-v2-1-1` contract was never deployed to mainnet and has no live
   tokens. The function could never have been called successfully in
   production.

The v3.4.0 handover suite has been deleted from the repository. It is not a
current deployment target.

---

## 2. Contract Delta: v3.2.1 → v3.2.2

Four changes, all in the migration layer:

| Location | v3.2.1 | v3.2.2 |
|---|---|---|
| Version string (`get-contract-info`) | `"xtrata-v3.2.1"` | `"xtrata-v3.2.2"` |
| `migrate-from-v2-1-1` function | present | **removed** |
| `get-migrated-chunk` | had v2-1-1 branch | **removed** |
| `get-migrated-chunk-batch` | had v2-1-1 branch | **removed** |

**No changes to:**
- Upload/chunking (`begin-inscription`, `add-chunk-batch`, `seal-inscription`)
- Single-transaction minting (`mint-single-tx`, `mint-single-tx-recursive`,
  `mint-single-tx-with-relationships`)
- Fee model (begin, upload-chunk, upload-batch, seal, single-tx fee units)
- Relationship model (dependencies, parents)
- `migrate-from-v1` (v1-1-1 migration)
- `migrate-from-v2-1-0` (v2-1-0 migration, the relevant live legacy path)
- HashToId advisory dedup logic
- Admin functions, pause model, expiry/purge mechanism
- SIP-009 compatibility

---

## 3. Test Results

**Framework:** Clarinet v4 simnet + Vitest  
**Test file:** `contracts/clarinet/tests/xtrata-v3.2.2.test.ts`  
**Result: 22/22 tests pass**

### Test inventory

| # | Test name |
|---|---|
| 1 | exposes fixed contract info and supports SIP-009 mint, transfer, URI, and enumeration |
| 2 | uses list 32 ABI for upload-style chunk payload routes |
| 3 | keeps local and mainnet SIP-009 trait variants aligned to their deployment targets |
| 4 | mints duplicate single-tx content as new token IDs with different token URIs |
| 5 | mints duplicate staged content as a new token and keeps hash lookup first-seen |
| 6 | mints duplicate content in a different parent/dependency relationship context |
| 7 | begin-or-get starts duplicate uploads instead of returning an existing hash token |
| 8 | migrates a legacy token even when its hash already has a first-seen token |
| 9 | enforces exact 16 KiB non-final chunks and a declared-size-consistent final chunk |
| 10 | caps actual upload batches at 32 chunks and rejects oversized single-tx attempts |
| 11 | resumes a staged upload without charging a second begin fee or resetting current-index |
| 12 | rejects staged resume attempts with mismatched file metadata without mutating upload state |
| 13 | mints through the v3.2.2 small-mint helper with list 32 ABI and policy cap 30 |
| 14 | reconstructs a 33-chunk staged file uploaded as 32 plus 1 batches |
| 15 | mints one-byte, one-chunk, small, and exact 512 KiB files through the single-call route |
| 16 | quotes and charges the single-call fee once instead of staged begin plus seal |
| 17 | rolls back failed single-call mint writes on hash mismatch |
| 18 | keeps dependencies open but enforces parent ownership and duplicate-parent rejection |
| 19 | migrates a v2.1.0 legacy token with same-id ownership, source lineage, and chunk fallback |
| 20 | rejects re-migration of the same v2.1.0 token and preserves original ownership |
| 21 | expires and purges abandoned staged uploads without touching sealed state |
| 22 | returns summary/meta values needed for independent reconstruction |

### Test coverage notes

- Test 3 explicitly verifies that the **simnet contract** uses the local
  `.sip009-nft-trait` and the **live contract** uses the mainnet
  `'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait'`. Both
  source files are read from disk and asserted.
- Tests 19–20 confirm `migrate-from-v2-1-0` works correctly and that
  re-migration is rejected. There is no test for `migrate-from-v2-1-1`
  because that function does not exist in v3.2.2.
- Tests 11–12 verify upload resume safety (no double-fee, state not reset).
- Test 16 confirms the single-tx fee is strictly less than begin+seal combined.
- Test 17 confirms atomic rollback on hash mismatch (no partial state written).

---

## 4. Simnet Environment

The Clarinet.toml was cleaned up as part of this session. The simnet now loads
only the contracts needed to test v3.2.2:

| Contract | Purpose |
|---|---|
| `sip009-nft-trait` | SIP-009 interface (local simnet only) |
| `sip010-ft-trait` | SIP-010 interface |
| `mock-usdcx`, `mock-sbtc`, `mock-ipfs-collection` | Mock tokens/NFTs |
| `xtrata-v1-1-1` | Legacy migration source (needed by `migrate-from-v1`) |
| `xtrata-v2-1-0` | Current live core — migration source and tests |
| `xtrata-v2-1-1` | Compatibility stub (never deployed; satisfies type-checker) |
| `xtrata-v2-1-0` | Current live core (migration source) |
| `xtrata-v3-2-2` | **The new core under test** |
| `xtrata-small-mint-v1-0/1` | Helper contracts |
| `xtrata-backup-registry-v1-0` | Registry helper |
| `xtrata-migrated-ipfs-collection-v1-0` | Migration helper |
| `xtrata-collection-mint-v1-0` through `v1-4` | Collection mint variants |
| `xtrata-preinscribed-collection-sale-v1-0` | Collection sale |
| `xtrata-market-*` | Market contracts |
| `xtrata-commerce`, `xtrata-vault` | Commerce/vault |
| `xtrata-arcade-scores-v1-0` through `v1-3` | Arcade score contracts |

Removed from simnet (no longer needed):
- `xtrata-v3-0-0`, `xtrata-v3-2-0`, `xtrata-v3-2-1`, `xtrata-v3-4-0`

The `xtrata-v2-1-1` entry is a Clarity 3 stub that satisfies the type-checker
for other contracts that reference `.xtrata-v2-1-1`. It is not a deployment
target and was not deployed to mainnet.

---

## 5. Post-Review Fixes (Applied After Opus 4.8 Review)

Two issues were raised by an independent reviewer and have been patched:

### `inspectSource` `as-contract` false-positive (was blocking step 1)

The original regex in `scripts/mainnet-v3.2.2-handover.mjs` flagged any
occurrence of `(as-contract tx-sender)` including this fully legitimate
top-level constant on line 93 of the live contract:

```clarity
(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))
```

This is the standard Clarity pattern for capturing the contract's own escrow
principal. It is evaluated once at deploy time and is not a function-body
impersonation risk.

**Fix:** The check now filters line-by-line, skipping pure comment lines
(`; …`) and `define-constant` lines, and strips inline comments before
matching. Only `(as-contract tx-sender)` appearing in a non-constant context
(function body, `let`, etc.) is flagged.

### Legacy source verification script (was a manual trust assumption)

The Opus reviewer correctly identified that "exists" is not the same as
"type-correct and byte-identical to what's deployed." The migration layer
works only if the local live sources for `xtrata-v1-1-1` and `xtrata-v2-1-0`
match what is actually on-chain.

**New script:** `scripts/mainnet-v3.2.2-verify-legacy.mjs`

Run with:

```sh
npm run mainnet:v3.2.2:verify-legacy
```

For each legacy contract the script:
1. Reads the local `contracts/live/` source and SHA-256 hashes it.
2. Fetches the deployed source from the Hiro API
   (`/v2/contracts/source/{address}/{name}`).
3. Hashes the deployed source and compares — a mismatch means the local file
   does not represent what is on-chain.
4. Extracts function definitions from the deployed source and checks that all
   ten migration-relevant functions are present with the correct kind
   (`read-only` / `public`).
5. Extracts the `InscriptionMeta` map definition and confirms all seven fields
   that v3.2.2 destructures (`owner`, `creator`, `mime-type`, `total-size`,
   `total-chunks`, `sealed`, `final-hash`) are present in the deployed tuple.
6. When the local and deployed hashes differ, shows a per-function signature
   diff so the specific divergence is visible.

This closes the gap the Opus reviewer flagged: "my conclusion holds only if
these sources are the canonical deployed ones."

---

## 6. Deployment Readiness

### What can be done before the handover UI opens

```sh
npm run mainnet:v3.2.2:preflight
```

This reads on-chain state from Hiro API, computes the continuity next-id,
hashes the local source file, runs `inspectSource` checks, pre-computes the
announcement inscription, and writes `reports/mainnet-v3.2.2-handover.json`.

### Source integrity checks (run by preflight `inspectSource`)

The preflight script verifies the live contract source before any transaction:

1. Mainnet SIP-009 trait is active (`impl-trait 'SP2PABAF...nft-trait'`)
2. No active `as-contract tx-sender` expressions
3. Version string is `"xtrata-v3.2.2"`
4. `migrate-from-v2-1-0` is present
5. `migrate-from-v2-1-1` is absent
6. `single-tx-fee-for-chunks` function is present

### Handover sequence (no dependency contracts required)

1. `npm run mainnet:v3.2.2:preflight` — read-only preflight
2. `npm run mainnet:v3.2.2:handover-ui` — open Xverse UI
3. **Deploy** `xtrata-v3-2-2` as Clarity 3 (Xverse prompt)
4. `npm run mainnet:v3.2.2:verify -- 0x<txid>` — source hash verification
5. **Pause** `xtrata-v2-1-0` (Xverse prompt)
6. Rerun preflight (post-pause next-id)
7. **Set next-id** (Xverse prompt — one-shot, irreversible)
8. **Set royalty recipient** (Xverse prompt)
9. **Unpause** `xtrata-v3-2-2` (Xverse prompt)
10. **Mint announcement** inscription via `mint-single-tx` (Xverse prompt)

**No v2-1-1 deployment step.** Unlike the v3.2.1 handover, v3.2.2 has no
migration dependency that needs to be pre-deployed.

### Key differences from v3.2.1 handover

| Aspect | v3.2.1 | v3.2.2 |
|---|---|---|
| Deploy v2-1-1 dependency | required (Clarity 2) | **not required** |
| Migration paths in contract | v1, v2-1-0, v2-1-1 | v1, v2-1-0 only |
| Clarity version | 3 | 3 |
| Verify mode | not available | available (`verify` command) |
| Source checks | manual | automated `inspectSource` |

---

## 6. Files in This Packet

### Contract sources

| File | Purpose |
|---|---|
| `contracts/clarinet/contracts/xtrata-v3.2.2.clar` | Simnet version (local SIP-009 trait) |
| `contracts/live/xtrata-v3.2.2.clar` | **Mainnet deployment source** |

### Tests

| File | Purpose |
|---|---|
| `contracts/clarinet/tests/xtrata-v3.2.2.test.ts` | Full 22-test Clarinet/Vitest suite |
| `contracts/clarinet/Clarinet.toml` | Simnet contract registry |

### Handover tooling

| File | Purpose |
|---|---|
| `scripts/mainnet-v3.2.2-handover.mjs` | Preflight, verify, UI, report script |
| `scripts/mainnet-v3.2.2-verify-legacy.mjs` | Legacy source hash + interface verification |
| `src/mainnet-v3.2.2-handover.ts` | Xverse-connected browser UI |
| `web/mainnet-v3.2.2-handover.html` | UI HTML shell |

### Docs

| File | Purpose |
|---|---|
| `docs/mainnet-v3.2.2-handover.md` | Full deployment runbook |
| `docs/mainnet-v3.2.2-announcement-inscription.md` | First inscription text |
| `reports/xtrata-v3.2.2-deployment-review.md` | This document |

---

## 8. Reviewer Checklist

- [ ] `contracts/live/xtrata-v3.2.2.clar` — confirm mainnet SIP-009 trait is
  active and local trait lines are commented out
- [ ] Confirm `migrate-from-v2-1-1` does **not** appear in the live source
- [ ] Confirm `migrate-from-v2-1-0` **does** appear and is structurally
  identical to v3.2.1
- [ ] Confirm version string on line ~1505 reads `"xtrata-v3.2.2"`
- [ ] `contracts/clarinet/Clarinet.toml` — confirm `xtrata-v3-2-2` entry
  is `clarity_version = 3` and `epoch = 'latest'`
- [ ] `scripts/mainnet-v3.2.2-handover.mjs` — confirm `REQUIRED_CLARITY_VERSION = 3`,
  `CORE_NAME = 'xtrata-v3-2-2'`, and no `is-migration-source` reads
- [ ] `docs/mainnet-v3.2.2-handover.md` — confirm no v2-1-1 deploy step in
  handover sequence
- [ ] Run `npm --prefix contracts/clarinet test` and confirm 22/22 pass
- [ ] Run `npm run mainnet:v3.2.2:verify-legacy` and confirm both legacy contracts show `✓ VERIFIED` (requires Hiro API access)
