# XIP-008: Xtrata Software Package

- XIP: 008
- Title: Software Package
- Status: Draft
- Category: Standards Track
- Requires: XIP-001, XIP-002, XIP-004, XIP-006
- Spec version: 1.0.0

> RFC 2119 / RFC 8174 keywords apply (see XIP-001).

## Abstract

XIP-008 profiles the XIP-001 envelope for **software packages** inscribed on
Xtrata: code, modules, recursive web apps, runtimes and their dependency graphs,
stored as permanent, verifiable, reconstructable on-chain artifacts. Because a
package can **execute code in a browser**, this standard is held to a higher
safety bar than the rest of the corpus: this revision closes the
**files-outside-the-verified-closure** hole in the prior draft and adds a
mandatory sandbox/CSP profile.

## Core principle

> A package is data with an entry point and a dependency closure. Every byte the
> package can load or execute MUST be inside the verified closure. Nothing else
> runs.

## 1. Package manifest

A package is an XIP-001 manifest of envelope `type` `software-package` (an
envelope profile; **not** an XIP-003 organisational type — they are peers):

```json
{
  "standard": "xip-001",
  "specVersion": "1.0.0",
  "type": "software-package",
  "name": "example-runtime",
  "defaultContract": "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3",
  "package": {
    "entry": 412,
    "runtime": "html",
    "files": [
      { "path": "index.html", "inscriptionId": 412, "mime": "text/html" },
      { "path": "engine.js",  "inscriptionId": 413, "mime": "application/javascript" }
    ],
    "packageDependencies": [
      { "name": "ui-kit", "manifest": "SP….xtrata-v3-2-3:701", "integrityRoot": "0x…" }
    ]
  },
  "integrity": { "algo": "xtrata-merkle-v1", "root": "0x…" }
}
```

| `package` field | Req. | Meaning |
|-----------------|------|---------|
| `entry` | MUST | The inscription id (within `defaultContract`) a consumer loads first. **MUST** appear in `files`. |
| `runtime` | MUST | Execution profile: `html`, `js-module`, `wasm`, or `data` (non-executing). Determines the sandbox (§4). |
| `files` | MUST | Logical-path → inscription map (with `mime`). The complete set of in-package addressable artifacts. |
| `packageDependencies` | MAY | References to **other package manifests** this one composes (§3). |

## 2. The closure MUST cover every loadable byte (security-critical fix)

The prior draft listed `files` and `dependencies` separately and derived the
verified closure from `dependencies` only — so a file referenced by path
(`engine.js`) could sit **outside** the verified closure, and runtime rewriting
either blocked the app or loaded unverified code. That hole is closed:

**The verified closure is defined as:**

```
closure(package) =
      { file.inscriptionId for file in package.files }      # every file
   ∪  transitiveClosure(packageDependencies)                # every composed package's closure
```

Normative rules:

- **Every** entry in `files` **MUST** be a real inscription on the package's
  contract(s) (XIP-002) and **MUST** be content-hash verified before use.
- `entry` **MUST** be in `files`.
- **Runtime URL rewriting / in-package resolution MUST resolve only to
  inscriptions inside `closure(package)`.** A reference to anything outside the
  closure **MUST** fail to load (not fall back to the network).
- `integrity.root` (XIP-001 §4.4) **MUST** commit to the full `files` set (leaves
  = each file's `{contract, inscriptionId, finalHash, order}`), so the manifest
  cannot later be reinterpreted with a different file set.
- A consumer **MUST NOT** execute or load any artifact whose hash does not verify,
  and **MUST** abort the whole package load on any closure verification failure
  (fail closed).

> Note on the core `dependencies` relation: a package author **SHOULD** also
> declare file/runtime relationships through the core's on-chain `dependency`
> edges so the closure is independently provable via XIP-004. But the **manifest
> `files` set is authoritative for what may load**, and it **MUST** be a subset of
> what content-hash verifies on-chain. On-chain dependencies that are *not* in
> `files` are provenance context (XIP-004), not loadable code.

## 3. Package dependencies & composition (the 50-edge cap)

The core caps `dependencies`/`parents` at **50 each** per inscription (XIP-002
§7). Real apps exceed 50 artifacts, so closure cannot rely on a single
inscription's direct edges:

- Large or modular packages **MUST** compose via `packageDependencies` — each is a
  reference to **another `software-package` manifest** with its own `files` and
  its own `integrityRoot`.
- Closure resolution recurses into each composed package (`transitiveClosure`),
  **MUST** bound recursion (recommended depth ≤ 32, total artifacts ≤ 50,000), and
  **MUST** detect and reject cycles (track visited package references).
- Each composed package is **version-pinned by its canonical reference** (XIP-002):
  a `packageDependencies` entry names an exact inscription, which is immutable. A
  dependency cannot be silently upgraded — see §5.

## 4. Execution safety (sandbox/CSP profile — REQUIRED for executable runtimes)

Verification proves the *artifact set*; it does **not** grant *trust* to the code.
For `runtime` ∈ {`html`, `js-module`, `wasm`}, a conformant loader **MUST**:

- execute in an **isolated sandbox** (e.g. a sandboxed iframe / worker) with:
  - **no ambient network egress** — all subresource loads intercepted and resolved
    **only** from `closure(package)`; any other fetch **MUST** be blocked;
  - a **Content-Security-Policy** that forbids `connect-src`, `img-src`, `script-src`,
    `style-src`, `font-src` targets outside the in-closure resolver (no `*`, no
    remote origins);
  - **no access to wallet, signing, key, or host-app APIs** unless the host
    *explicitly* grants a capability for that package; default deny;
- treat `runtime: data` as **non-executing** (rendered/parsed, never run as code);
- display the package's trust tier (XIP-006 §1) — a package is only as trusted as
  the manifest authority that published it (T1/T2 vs unendorsed).

A loader that cannot enforce the closure-only / no-egress sandbox **MUST NOT**
execute the package.

## 5. Versioning, pinning, and the supply chain

- Package versions form a chain via the XIP-001 parent graph; the latest
  authoritative release is the parent-chain tip (XIP-001 §6); forks fail closed.
- **Pinning is total and immutable.** Because every file and every
  `packageDependencies` entry names an exact, sealed inscription, a package's
  closure is frozen at publish time. This is a supply-chain **strength**: no
  dependency-confusion or post-publish substitution is possible.
- The cost of total pinning: a vulnerable dependency is frozen too. The **only**
  patch path is to publish a **new package version** (new inscription, prior as
  parent, updated `packageDependencies`). Consumers follow the authority's
  parent-chain tip to get patched releases.

## 6. Out of scope

- Build reproducibility of source → artifact (a higher-level concern).
- Package distribution incentives / sale → XIP-007.
- Human-readable package names → XIP-005.

## 7. Conformance

- **MUST** treat `closure(package) = files ∪ transitiveClosure(packageDependencies)`
  as the sole set of loadable artifacts (§2).
- **MUST** content-hash verify every artifact before use and fail closed on any
  miss.
- **MUST** ensure `entry ∈ files` and resolve in-package references only inside
  the closure.
- **MUST** enforce the §4 sandbox/CSP/no-egress profile for executable runtimes.
- **MUST** bound and cycle-protect `packageDependencies` recursion (§3).
- **MUST** display the package's XIP-006 trust tier and **MUST NOT** equate
  verification with trust.

## Summary

A software package is an XIP-001 envelope plus an entry point and a verifiable,
**fully-covering** dependency closure — every loadable byte inside it, nothing
outside it, run in a no-egress sandbox — letting code live on-chain as durably,
checkably, and safely as any other Xtrata inscription.
