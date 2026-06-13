#!/bin/bash
# Build the Rendezvous fuzz variant of xtrata-fakfun-forever-v2:
#   - rewrite the mainnet MASTER/SOURCE constants to local simnet aliases
#     (.xtrata-v3-2-3 / .bitcoin-pepe, both registered in Clarinet.toml)
#   - default free-threshold to 0 so fee-for always exercises the fee/discount
#     regime (the surcharge invariant stays live on every step)
#   - append the invariants block
# Output: tests/rv/.build/xtrata-fakfun-forever-v2-fuzz.clar (gitignored)
set -eu
cd "$(dirname "$0")/../.."   # -> contracts/clarinet
SRC=contracts/fakfun-idea/xtrata-fakfun-forever-v2.clar
OUT=tests/rv/.build/xtrata-fakfun-forever-v2-fuzz.clar
mkdir -p tests/rv/.build
sed -e "s|'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X\.xtrata-v3-2-3|.xtrata-v3-2-3|g" \
    -e "s|'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ\.bitcoin-pepe|.bitcoin-pepe|g" \
    -e "s|(define-data-var free-threshold uint u87)|(define-data-var free-threshold uint u0)|" \
    "$SRC" > "$OUT"
cat tests/rv/xtrata-fakfun-forever-v2.invariants.clar >> "$OUT"
cat tests/rv/xtrata-fakfun-forever-v2.tests.clar >> "$OUT"
echo "built $OUT"
