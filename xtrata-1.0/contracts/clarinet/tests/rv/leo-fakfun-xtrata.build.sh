#!/bin/bash
# Build the Rendezvous fuzz variant of leo-fakfun-xtrata:
#   - rewrite mainnet MASTER/SOURCE constants to local simnet aliases
#     (.xtrata-v3-2-3 / .leo-cats, both registered in Clarinet.toml)
#   - default free-threshold to 0 so fee-for always exercises the fee/discount
#     regime (the 4-STX surcharge invariant stays live on every step)
#   - append the invariants block, then the tests block
# Output: tests/rv/.build/leo-fakfun-xtrata-fuzz.clar (gitignored)
set -eu
cd "$(dirname "$0")/../.."   # -> contracts/clarinet
SRC=contracts/fakfun-idea/leo-fakfun-xtrata.clar
OUT=tests/rv/.build/leo-fakfun-xtrata-fuzz.clar
mkdir -p tests/rv/.build
sed -e "s|'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X\.xtrata-v3-2-3|.xtrata-v3-2-3|g" \
    -e "s|'SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC\.leo-cats|.leo-cats|g" \
    -e "s|(define-data-var free-threshold uint u87)|(define-data-var free-threshold uint u0)|" \
    "$SRC" > "$OUT"
cat tests/rv/leo-fakfun-xtrata.invariants.clar >> "$OUT"
cat tests/rv/leo-fakfun-xtrata.tests.clar >> "$OUT"
echo "built $OUT"
