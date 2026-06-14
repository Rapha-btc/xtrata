;; ==========================================================================
;; RENDEZVOUS PROPERTY TESTS for pepe-4ever-fakfun  (rv `test` mode)
;; Appended by pepe-4ever-fakfun.build.sh after the invariants block.
;;
;; These encode the TRANSITION properties (freeze monotonicity, one-time
;; binding, owner-only mutation, canonical-gate liveness, and the variant's
;; STX no-leak on a reverted inscribe) that a stateless read-only invariant
;; cannot express on its own. Each test-* runs with rv feeding fuzzed args, and
;; must return (ok ...) -- an (err ...) marks a failed property. Tests run on a
;; fresh snapshot, so they compose with the invariant run rather than replacing
;; it.
;; ==========================================================================

;; ---- Invariant 6: owner-only + discount sanity ---------------------------
;; A stored discount, at write time, is strictly below the standard fee
;; (ERR-BAD-DISCOUNT guards it). Property: after a successful set-discount, the
;; recorded discount is < inscribe-fee. If rv feeds fee >= standard the call
;; reverts (the (try! ...) propagates the err) -- which is the intended guard.
(define-public (test-discount-below-fee (who principal) (fee uint))
  (begin
    ;; owner-only surface: rv fuzzes the caller, so discard non-owner callers
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    ;; set-discount itself rejects fee >= standard; only the accepted case is
    ;; the property under test, so skip the rejected case rather than fail
    (asserts! (< fee (var-get inscribe-fee)) (ok true))
    (try! (set-discount who fee))
    (asserts! (< (default-to u0 (get-discount who)) (var-get inscribe-fee)) (err u900))
    (ok true)))

;; Property: the effective fee-for a discounted principal never exceeds the
;; standard fee, even if set-fee is later dropped below the pinned discount.
;; Pin a discount, then drop the fee under it; fee-for must clamp to the (now
;; lower) standard, never surcharge.
(define-public (test-discount-never-surcharges (who principal) (disc uint) (lowfee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    ;; only meaningful when disc is a real discount vs the current standard
    (asserts! (< disc (var-get inscribe-fee)) (ok true))
    (try! (set-discount who disc))
    (try! (set-fee lowfee))                 ;; may now be below the pinned disc
    (asserts! (<= (fee-for who) (var-get inscribe-fee)) (err u901))
    (ok true)))

;; ---- Invariant 3: freeze monotonicity + post-freeze immutability ---------
;; Once finalized, is-finalized stays true and seed-canonical is rejected
;; (ERR-FINALIZED), so CanonicalHash can never change again. Property: after
;; finalize, a seed attempt must revert and is-finalized stays true.
(define-public (test-freeze-is-one-way (entries (list 200 { id: uint, hash: (buff 32) })))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    (try! (finalize-canonical))
    (asserts! (unwrap-panic (is-finalized)) (err u902))
    ;; any further seed must be rejected now that we are frozen
    (asserts! (is-err (seed-canonical entries)) (err u903))
    ;; freeze never flips back
    (asserts! (unwrap-panic (is-finalized)) (err u904))
    (ok true)))

;; Property: while NOT finalized, a seeded canonical entry is exactly what was
;; written (seed is faithful), and finalize then locks that exact value in.
(define-public (test-seed-then-freeze-locks (id uint) (h (buff 32)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    (asserts! (not (unwrap-panic (is-finalized))) (ok true)) ;; skip if already frozen
    (try! (seed-canonical (list { id: id, hash: h })))
    (asserts! (is-eq (some h) (get-canonical-hash id)) (err u905))
    (try! (finalize-canonical))
    ;; value is unchanged after freeze and can no longer be reseeded
    (asserts! (is-eq (some h) (get-canonical-hash id)) (err u906))
    (asserts! (is-err (seed-canonical (list { id: id, hash: 0x00 }))) (err u907))
    (asserts! (is-eq (some h) (get-canonical-hash id)) (err u908))
    (ok true)))

;; ---- Invariant 7: canonical-gate liveness --------------------------------
;; inscribe must REVERT unless expected-hash == CanonicalHash[token-id] AND the
;; token exists. In simnet the source pepe has no mints, so even a canonical
;; hash cannot let inscribe through (ERR-NO-SUCH-TOKEN fires first). Property:
;; inscribe of any token-id with a hash NOT matching its canonical entry is
;; rejected, and inscribed-count is unmoved.
(define-public (test-inscribe-rejects-non-canonical
    (token-id uint)
    (bad-hash (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256)))
  (let ((before (var-get inscribed-count)))
    ;; only test the non-canonical case: skip when bad-hash happens to match
    (asserts! (not (is-eq (some bad-hash) (get-canonical-hash token-id))) (ok true))
    (asserts! (is-err (inscribe token-id bad-hash mime total-size chunks token-uri)) (err u909))
    (asserts! (is-eq before (var-get inscribed-count)) (err u910))
    (ok true)))

;; ---- Invariant 4: one-time (no re-bind of an existing token) -------------
;; A token, once bound, can never be re-bound (ERR-ALREADY-INSCRIBED), and no
;; path mutates an existing binding's identity fields. In simnet no binding can
;; be created, so this asserts the precondition the gate enforces: inscribe on
;; a token that lacks a canonical entry is rejected before any state write.
(define-public (test-no-rebind-without-canonical
    (token-id uint)
    (h (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256)))
  (let ((before (var-get inscribed-count)))
    ;; if there is no canonical hash for this id, inscribe must revert
    (asserts! (is-none (get-canonical-hash token-id)) (ok true))
    (asserts! (is-err (inscribe token-id h mime total-size chunks token-uri)) (err u911))
    (asserts! (is-none (get-binding token-id)) (err u912))
    (asserts! (is-eq before (var-get inscribed-count)) (err u913))
    (ok true)))

;; ---- Invariant 8 (NEW, variant-specific): inscribe leaks no STX ----------
;; The new inscribe funds the contract first:
;;   (stx-transfer? master-fee tx-sender current-contract)
;; then mints via (as-contract? ((with-stx master-fee)) (master mint-single-tx)).
;; In simnet that mint always reverts, so the whole inscribe must atomic-revert
;; and the funds-in must roll back. Property: even when the canonical gate is
;; SATISFIED for this token-id (so we sail past the hash check and reach the
;; live-fee read + funds-in + master mint), the inscribe still reverts AND the
;; contract STX balance is exactly 0 afterward -- the funds-in never strands STX
;; in the vault.
;;
;; To exercise the deepest reachable path (past the canonical gate, into the
;; funds-in + master mint), we seed the canonical hash for this id to the fuzzed
;; expected-hash first, then call inscribe with that exact hash. The token still
;; has no owner on the simnet pepe (ERR-NO-SUCH-TOKEN) OR the master mint reverts
;; (ERR-PAUSED / ERR-HASH-MISMATCH); either way inscribe must revert with no
;; stranded STX.
(define-public (test-inscribe-no-stranded-stx
    (token-id uint)
    (expected-hash (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    (asserts! (not (unwrap-panic (is-finalized))) (ok true)) ;; need to be able to seed
    ;; make the canonical gate PASS for this id so inscribe reaches the funds-in
    (try! (seed-canonical (list { id: token-id, hash: expected-hash })))
    ;; inscribe must still revert (no pepe owner / master mint reverts)
    (asserts! (is-err (inscribe token-id expected-hash mime total-size chunks token-uri)) (err u914))
    ;; and no STX may have been stranded by the rolled-back funds-in transfer
    (asserts! (is-eq (stx-get-balance current-contract) u0) (err u915))
    ;; count is unmoved
    (asserts! (is-eq (var-get inscribed-count) u0) (err u916))
    (ok true)))

;; ---- Invariant 8 (DEEP, variant-specific): positive-path funds-in rollback -
;; The test above stops at ERR-NO-SUCH-TOKEN: the simnet bitcoin-pepe has no
;; mints, so inscribe reverts on the FIRST guard (get-owner = none) before the
;; live-fee read + funds-in ever execute -- so the no-leak claim there is only
;; structurally (not yet behaviourally) exercised. This test ATTEMPTS to drive
;; the DEEPEST path by first minting pepe #1 as the DEPLOYER, then seeding its
;; canonical hash and inscribing it with a VALID single-tx shape so the master
;; quote-single-tx-fee succeeds and the funds-in
;;   (stx-transfer? master-fee tx-sender current-contract)
;; would actually move STX before the master mint reverts (master is paused for
;; this non-allowed caller -> ERR-PAUSED), forcing the funds-in to roll back.
;;
;; SIMNET REALITY (matches the forever-v2 finding): bitcoin-pepe `claim` routes
;; through `mint`, whose public-sale branch asserts (var-get sale-enabled) FIRST
;; -- and sale-enabled is false on the simnet deploy. The DEPLOYER-while-paused
;; exemption lives DEEPER (in mint-many), so even the DEPLOYER cannot claim: the
;; source collection has ZERO mintable tokens here. So this test cannot mint #1
;; and SKIPS gracefully (returns (ok true)) when the mint is unavailable, rather
;; than failing on a harness limitation. If a future simnet fixture enables the
;; sale (or pre-seeds an owner for #1), the deep funds-in rollback assertions
;; below become live automatically -- the property is written to bite the moment
;; the path is reachable.
(define-public (test-inscribe-positive-path-no-leak (expected-hash (buff 32)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (ok true))
    (asserts! (not (unwrap-panic (is-finalized))) (ok true)) ;; need to seed
    ;; try to mint pepe #1 as deployer; if the source sale is closed (simnet),
    ;; SKIP rather than fail -- the positive path is simply unreachable here.
    (if (is-none (unwrap! (contract-call? .bitcoin-pepe get-owner u1) (err u920)))
      (match (contract-call? .bitcoin-pepe claim)
        ok-v true
        err-v (asserts! false (ok true))) ;; mint blocked (sale closed) -> skip
      true)
    ;; if we reach here, #1 has an owner: drive the deep funds-in path.
    (asserts!
      (is-some (unwrap! (contract-call? .bitcoin-pepe get-owner u1) (err u921)))
      (err u922))
    ;; canonical gate passes for #1
    (try! (seed-canonical (list { id: u1, hash: expected-hash })))
    ;; valid 1-chunk shape so the master quote succeeds and the funds-in fires;
    ;; the master mint then reverts (paused) -> whole inscribe atomic-reverts.
    (asserts!
      (is-err (inscribe u1 expected-hash "image/png" u1 (list 0x00) "ipfs://x"))
      (err u923))
    ;; inscribe reverted -> funds-in must be fully rolled back, no stranded STX
    (asserts! (is-eq (stx-get-balance current-contract) u0) (err u925))
    (asserts! (is-eq (var-get inscribed-count) u0) (err u926))
    (asserts! (is-none (get-binding u1)) (err u927))
    (ok true)))
