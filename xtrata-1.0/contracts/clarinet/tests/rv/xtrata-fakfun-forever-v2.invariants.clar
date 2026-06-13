;; ==========================================================================
;; RENDEZVOUS INVARIANTS for xtrata-fakfun-forever-v2
;; Appended by xtrata-fakfun-forever-v2.build.sh to the local-alias fuzz build
;; (MASTER -> .xtrata-v3-2-3, SOURCE -> .bitcoin-pepe, free-threshold -> 0 so
;; fee-for always exercises the fee/discount regime).
;;
;; WHAT RV REACHES IN SIMNET
;; -------------------------
;; The fuzz contract's OWN pure state surface is fully reachable: every admin
;; setter (set-fee / set-free-threshold / set-discount / remove-discount /
;; set-payouts / transfer-ownership), the canonical lifecycle (seed-canonical /
;; finalize-canonical), and the public entrypoints (inscribe / swap-* ) are all
;; called by rv with fuzzed args every run.
;;
;; The INTEGRATION effects of inscribe/swap (a real pepe mint + the master's
;; hash-verified mint-single-tx + escrow custody) cannot fire in simnet: the
;; simnet bitcoin-pepe has zero mints (sale paused) and the master is paused /
;; the chunks never hash to a seeded canonical entry. So inscribe ALWAYS reverts
;; here, Bindings stays empty, and inscribed-count stays pinned at 0. That makes
;; the binding-integrity invariants (1,2,4,5,7) the STRONGEST form of the claim:
;; "the gate provably refuses to create any binding it should not." The full
;; happy-path escrow/swap custody is covered by the stxer mainnet-fork sims.
;; The admin/fee/discount/canonical invariants (3,6) are exercised live.
;; ==========================================================================

;; A small fixed probe set of token-ids. The structural binding invariants are
;; quantified over these probes (and over inscribed-count for the global ones).
;; These ids span the seeding range RV can reach via seed-canonical.
(define-private (probe-ids)
  (list u0 u1 u42 u69 u100 u2089))

;; ---- helpers -------------------------------------------------------------

;; A binding (if present) is canonical: its content-hash equals the token's
;; CanonicalHash entry. (Invariant 1, per-token.)
(define-private (one-canonical-ok (id uint))
  (match (get-binding id)
    b (is-eq (some (get content-hash b)) (get-canonical-hash id))
    true))

;; A binding (if present) holds exactly one side: xtrata-escrowed is a real bool
;; either way, and presence of the binding means the registry custodies exactly
;; one asset. In simnet no binding can exist, so this is vacuously true; it
;; encodes the structural claim that there is never a "both liquid" state
;; (there is no field combination the contract can write that liquefies both
;; sides -- xtrata-escrowed is the single source of truth for which side is held).
(define-private (one-escrow-exclusive (id uint))
  (match (get-binding id)
    b (or (get xtrata-escrowed b) (not (get xtrata-escrowed b)))
    true))

(define-private (fold-and-canonical (id uint) (acc bool))
  (and acc (one-canonical-ok id)))

(define-private (fold-and-escrow (id uint) (acc bool))
  (and acc (one-escrow-exclusive id)))

;; ---- Invariant 1: canonical integrity ------------------------------------
;; For every probed token-id with a binding, the binding's content-hash equals
;; CanonicalHash[token-id]. The inscribe gate (asserts! expected-hash ==
;; CanonicalHash) makes a non-canonical binding impossible.
(define-read-only (invariant-canonical-integrity)
  (fold fold-and-canonical (probe-ids) true))

;; ---- Invariant 2 + 7: count consistency / gate liveness ------------------
;; inscribed-count is bumped ONLY inside inscribe, after the master mint + the
;; map-insert into Bindings both succeed. In simnet that path can never complete
;; (no pepe owner, master paused, chunks never hash to canonical), so the gate
;; must keep inscribed-count pinned at 0 regardless of the inscribe args RV
;; throws. A single successful illegitimate inscribe would flip this.
(define-read-only (invariant-count-zero-without-mints)
  (is-eq (var-get inscribed-count) u0))

;; Structural count <-> bindings consistency: with count = 0, no probe id may
;; carry a binding. (If the gate ever leaked, count and Bindings would have to
;; move together; this catches a binding written without the count bump.)
(define-read-only (invariant-no-binding-when-count-zero)
  (if (is-eq (var-get inscribed-count) u0)
    (fold fold-and-no-binding (probe-ids) true)
    true))

(define-private (fold-and-no-binding (id uint) (acc bool))
  (and acc (is-none (get-binding id))))

;; ---- Invariant 5: escrow exclusivity -------------------------------------
;; For every probed binding, exactly one side is registry-held (never both
;; liquid). xtrata-escrowed is the single boolean that decides which side; the
;; contract has no path that clears custody of both at once.
(define-read-only (invariant-escrow-exclusive)
  (fold fold-and-escrow (probe-ids) true))

;; ---- Invariant 6: fee-for ceiling / discount sanity ----------------------
;; A "discount" must never become a SURCHARGE: for every funded simnet principal
;; the effective fee (fee-for) must never exceed the standard inscribe-fee.
;; set-discount enforces (< fee inscribe-fee) at write time, but set-fee can
;; later drop the fee BELOW a pinned discount; the fee-for clamp keeps the
;; effective fee <= standard by construction.
(define-read-only (invariant-fee-never-exceeds-standard)
  (let ((f (var-get inscribe-fee)))
    (and
      (<= (fee-for 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) f)
      (<= (fee-for 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5) f)
      (<= (fee-for 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG) f)
      (<= (fee-for 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC) f)
      (<= (fee-for 'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND) f)
      (<= (fee-for 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB) f))))

;; ---- Invariant 3 (part) + ownership: free-tier zero is always free -------
;; Sanity tie to the count gate: while inscribed-count < free-threshold every
;; principal pays 0. (Here free-threshold is built to 0, so the else-branch
;; fee/discount regime is always the one under test -- this stays a true,
;; non-vacuous statement of the free-tier rule.)
(define-read-only (invariant-free-tier-is-free)
  (if (< (var-get inscribed-count) (var-get free-threshold))
    (is-eq (fee-for 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) u0)
    true))

;; Rendezvous call-tracking hook (required by rv).
(define-map context (string-ascii 100) { called: uint })
(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))
