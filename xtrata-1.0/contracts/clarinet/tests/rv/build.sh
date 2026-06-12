#!/bin/bash
# Build the Rendezvous fuzz variant of xtrata-collection-registry:
#   - rewrite the mainnet MASTER/SOURCE constants to local simnet aliases
#   - default free-threshold to 0 (so fee-for exercises the fee/discount regime)
#   - append the invariants block
# Output: tests/rv/.build/xtrata-collection-registry-fuzz.clar (gitignored)
set -eu
cd "$(dirname "$0")/../.."   # -> contracts/clarinet
SRC=contracts/fakfun-idea/xtrata-collection-registry-v1.0.clar
OUT=tests/rv/.build/xtrata-collection-registry-fuzz.clar
mkdir -p tests/rv/.build
sed -e "s|'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X\.xtrata-v3-2-3|.xtrata-v3-2-3|g" \
    -e "s|'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ\.bitcoin-pepe|.bitcoin-pepe|g" \
    -e "s|(define-data-var free-threshold uint u69)|(define-data-var free-threshold uint u0)|" \
    "$SRC" > "$OUT"
cat tests/rv/xtrata-collection-registry.invariants.clar >> "$OUT"
echo "built $OUT"
