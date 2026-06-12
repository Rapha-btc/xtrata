;; ==========================================================================
;; RENDEZVOUS INVARIANTS for xtrata-collection-registry
;; Appended by build.sh to the local-alias fuzz build (free-threshold = 0 so
;; fee-for always exercises the fee/discount regime; the surcharge invariant
;; is live on every step).
;;
;; Integration paths (inscribe/swap/escrow) require real pepe ownership and the
;; live xtrata mint, which simnet does not have -- those are covered exhaustively
;; by the stxer mainnet-fork sims (70/70). RV here property-fuzzes the pure
;; admin/fee/discount state surface.
;; ==========================================================================

;; A "discount" must never become a SURCHARGE: for every funded simnet principal
;; the effective fee (fee-for) must never exceed the standard inscribe-fee.
;; set-discount enforces (< discount fee) at write time, but set-fee can later
;; drop the fee BELOW a pinned discount. Before the fee-for clamp this fails;
;; with the clamp it holds by construction.
(define-read-only (invariant-no-discount-surcharge)
  (let ((f (var-get inscribe-fee)))
    (and
      (<= (fee-for 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) f)
      (<= (fee-for 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5) f)
      (<= (fee-for 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG) f)
      (<= (fee-for 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC) f)
      (<= (fee-for 'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND) f)
      (<= (fee-for 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB) f))))

;; No inscription can be recorded for a pepe the sender does not own. Local
;; bitcoin-pepe has zero mints in simnet, so the ownership gate must keep
;; inscribed-count pinned at zero regardless of inscribe args RV throws.
(define-read-only (invariant-no-inscriptions-without-pepes)
  (is-eq (var-get inscribed-count) u0))

;; Rendezvous call-tracking hook (required by rv).
(define-map context (string-ascii 100) { called: uint })
(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))
