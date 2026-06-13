;; ==========================================================================
;; RENDEZVOUS PROPERTY TESTS for xtrata-fakfun-forever-v2  (rv `test` mode)
;; Appended by xtrata-fakfun-forever-v2.build.sh after the invariants block.
;;
;; These encode the TRANSITION properties (freeze monotonicity, one-time
;; binding, owner-only mutation, canonical-gate liveness) that a stateless
;; read-only invariant cannot express on its own. Each test-* runs as the
;; deployer (the contract-owner), with rv feeding fuzzed args, and must return
;; (ok ...) -- an (err ...) marks a failed property. Tests run on a fresh
;; snapshot, so they compose with the invariant run rather than replacing it.
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
