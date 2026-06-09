# XIP reference vectors

Reference generators that reproduce and verify every reproducible value
published in the XIP corpus. If a generator exits non-zero, a value in the specs
does not match the reference construction and must be treated as errata.

## Generators

| Script | Covers | Runtime | Output |
|--------|--------|---------|--------|
| `generate.py` | XIP-001 §3.4 `manifestHash`, §4.4/4.5 `xtrata-merkle-v1` leaf hashes and integrity roots (3-item / single / empty), XIP-002 §1.1 reference hash | Python 3 stdlib only (`hashlib`, `json`) | `vectors.json` |
| `generate-signing.mjs` | XIP-001 §5.1 domain-separated signing message + secp256k1 signature (deterministic, low-S, recoverable), with recovery + c32 address derivation | Node + repo deps | `signing-vectors.json` |

## Running

```sh
# from the repo root (xtrata-1.0/)
python3 docs/xips/vectors/generate.py          # hashing & Merkle vectors
node    docs/xips/vectors/generate-signing.mjs # signing-message vector
```

Each prints `OK`/`BAD` per value and exits `0` only if all published vectors
reproduce exactly.

## Authority

Where a generator and the prose disagree on a published vector, **the generator
is authoritative** and the prose is errata (XIP-001 *Reference implementation*).

## Dependency note (pinning before inscription)

`generate.py` is self-contained (standard library only) and is reproducible
anywhere.

`generate-signing.mjs` currently relies on the repository's installed packages —
`@noble/secp256k1` (v1.7.x API: async `sign(..., { canonical, der, recovered })`)
and `@stacks/transactions` (`getAddressFromPublicKey`). The signature itself is
deterministic given the fixed test key, so the *published vector* is stable; but
to make the signing vector reproducible **standalone** when the XIP corpus is
inscribed on-chain, the signing dependencies SHOULD be pinned (exact versions
recorded) or a minimal vendored secp256k1 + c32 implementation included
alongside the script. Until then, regenerate with the repo's lockfile in place.
