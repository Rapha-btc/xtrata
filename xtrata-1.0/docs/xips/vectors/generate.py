#!/usr/bin/env python3
"""Reference vector generator for the Xtrata XIP corpus.

Reproduces every reproducible value (hashes, Merkle roots) asserted in the XIP
documents, prints them, and verifies them against the values published in the
specs. Exit code 0 means every published vector is reproducible; non-zero means
a spec value does not match this reference construction.

Constructions:
  XIP-001 §3  Canonicalisation: RFC 8785 JCS, integer-only, sorted keys, no
              whitespace. For the ASCII/integer objects used here, this equals
              json.dumps(obj, sort_keys=True, separators=(',',':')).
  XIP-001 §3.2 manifestHash = SHA-256(JCS(manifest))
  XIP-001 §4.4 xtrata-merkle-v1:
              leafHash = SHA-256(0x00 || JCS(leafObject))
              nodeHash = SHA-256(0x01 || left || right)
              empty set = SHA-256(0x00); single item = its leaf.
              sort members by (contract, inscriptionId); duplicate last on odd.
  XIP-002 §1.1 reference hash = SHA-256(ascii("<principal>:<id>"))
"""
import hashlib
import json
import sys

CORE = "SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3"


def jcs(obj: dict) -> bytes:
    # RFC 8785 for the restricted Xtrata profile (ASCII strings, integers only).
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha256(b: bytes) -> str:
    return "0x" + hashlib.sha256(b).hexdigest()


def leaf_hash(member: dict) -> str:
    return sha256(b"\x00" + jcs(member))


def merkle_root(members: list) -> str:
    if not members:
        return sha256(b"\x00")  # empty-set sentinel
    ordered = sorted(members, key=lambda m: (m["contract"], m["inscriptionId"]))
    level = [bytes.fromhex(leaf_hash(m)[2:]) for m in ordered]
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            left = level[i]
            right = level[i + 1] if i + 1 < len(level) else level[i]
            nxt.append(hashlib.sha256(b"\x01" + left + right).digest())
        level = nxt
    return "0x" + level[0].hex()


# ---- inputs ---------------------------------------------------------------

manifest = {
    "standard": "xip-001",
    "specVersion": "1.0.0",
    "type": "collection",
    "name": "Example Collection",
    "defaultContract": CORE,
    "mapping": {
        "type": "explicit",
        "items": [
            {"inscriptionId": 359, "order": 1},
            {"inscriptionId": 360, "order": 2},
        ],
    },
}

members = [
    {"contract": CORE, "inscriptionId": 359, "finalHash": "0x" + "a" * 64, "order": 1},
    {"contract": CORE, "inscriptionId": 360, "finalHash": "0x" + "b" * 64, "order": 2},
    {"contract": CORE, "inscriptionId": 361, "finalHash": "0x" + "c" * 64, "order": 3},
]

reference = f"{CORE}:359"

# ---- compute --------------------------------------------------------------

results = {
    "xip-001.manifestHash": sha256(jcs(manifest)),
    "xip-001.leaf.359": leaf_hash(members[0]),
    "xip-001.leaf.360": leaf_hash(members[1]),
    "xip-001.leaf.361": leaf_hash(members[2]),
    "xip-001.integrityRoot.3items": merkle_root(members),
    "xip-001.integrityRoot.item359": merkle_root([members[0]]),
    "xip-001.integrityRoot.empty": merkle_root([]),
    "xip-002.reference": reference,
    "xip-002.referenceHash": sha256(reference.encode("ascii")),
}

# ---- expected (as published in the specs) ---------------------------------

expected = {
    "xip-001.manifestHash": "0xfe70c7740fddb6e9197bdae6183147ec1f2a1b95eb33af780bcbc13c73a33e46",
    "xip-001.leaf.359": "0x263046c2cec65ecb9e6e5e4a550e1e64cdeb408d57c7f3c037151f10cc636fa2",
    "xip-001.leaf.360": "0xc93f9cbd0dcd3be716c0e295a460ef8f09a39339261481e4a6cd7ffa708d0a3a",
    "xip-001.leaf.361": "0x0c5c98fe26aded1d59aafae4b2eb218a25c5159ddb73bc557ec5c836cbdd69ae",
    "xip-001.integrityRoot.3items": "0x2c9d8361cc7b6b507c3c67ff475330c2d8b9fec1a9afe4a9605df1ed89a21e97",
    "xip-001.integrityRoot.item359": "0x263046c2cec65ecb9e6e5e4a550e1e64cdeb408d57c7f3c037151f10cc636fa2",
    "xip-001.integrityRoot.empty": "0x6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    "xip-002.referenceHash": "0x8856e9b194e4b03513d0f5f887cb822a0a4e5c360949262230abc07f0bcffce7",
}

# ---- verify ---------------------------------------------------------------

ok = True
print("Xtrata XIP reference vectors\n")
for key, value in results.items():
    exp = expected.get(key)
    if exp is None:
        print(f"  {key} = {value}")
        continue
    match = value == exp
    ok = ok and match
    print(f"  [{'OK ' if match else 'BAD'}] {key} = {value}")
    if not match:
        print(f"        expected {exp}")

# Emit machine-readable vectors alongside the script.
with open(__file__.rsplit("/", 1)[0] + "/vectors.json", "w") as fh:
    json.dump({"algo": "xtrata-merkle-v1", "vectors": results}, fh, indent=2)
    fh.write("\n")

print("\n" + ("ALL VECTORS REPRODUCED" if ok else "MISMATCH — corpus value(s) wrong"))
sys.exit(0 if ok else 1)
