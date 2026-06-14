#!/bin/bash
# Build the Rendezvous fuzz variant of pepe-4ever-fakfun:
#   - rewrite the mainnet MASTER/SOURCE constants to local simnet aliases
#     (.xtrata-v3-2-3 / .bitcoin-pepe, both registered in Clarinet.toml)
#   - default free-threshold to 0 so fee-for always exercises the fee/discount
#     regime (the surcharge invariant stays live on every step)
#   - append the invariants block, then the tests block
# Output: tests/rv/.build/pepe-4ever-fakfun-fuzz.clar (gitignored)
#
# pepe-4ever-fakfun is forever-v2 with a changed `inscribe`: it mints via
#   (as-contract? ((with-stx master-fee)) (mint-single-tx ...))
# after funding the contract first via
#   (stx-transfer? master-fee tx-sender current-contract)
# where master-fee is read live from (MASTER quote-single-tx-fee ...).
# quote-single-tx-fee is a read-only and CANNOT revert, so the funds-in step
# executes in simnet; the master mint still reverts (paused / chunks never hash
# to a seeded canonical entry), so inscribe is atomic-reverted and the contract
# STX balance must return to 0. That is the extra no-leak invariant added here.
set -eu
cd "$(dirname "$0")/../.."   # -> contracts/clarinet
SRC=contracts/fakfun-idea/pepe-4ever-fakfun.clar
OUT=tests/rv/.build/pepe-4ever-fakfun-fuzz.clar
mkdir -p tests/rv/.build
sed -e "s|'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X\.xtrata-v3-2-3|.xtrata-v3-2-3|g" \
    -e "s|'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ\.bitcoin-pepe|.bitcoin-pepe|g" \
    -e "s|(define-data-var free-threshold uint u87)|(define-data-var free-threshold uint u0)|" \
    "$SRC" > "$OUT"
cat tests/rv/pepe-4ever-fakfun.invariants.clar >> "$OUT"
cat tests/rv/pepe-4ever-fakfun.tests.clar >> "$OUT"
echo "built $OUT"
