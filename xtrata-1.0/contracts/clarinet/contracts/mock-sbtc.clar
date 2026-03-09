;; mock-sbtc
;;
;; Minimal SIP-010 sBTC fixture for local commerce and vault tests.

(impl-trait .sip010-ft-trait.ft-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))

(define-fungible-token sbtc)

(define-data-var contract-owner principal tx-sender)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (try! (ft-mint? sbtc amount recipient))
    (ok true)
  )
)

(define-read-only (get-name)
  (ok "Mock sBTC")
)

(define-read-only (get-symbol)
  (ok "sBTC")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply sbtc))
)

(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance sbtc owner))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (try! (ft-transfer? sbtc amount sender recipient))
    (match memo
      memo-bytes (begin (print memo-bytes) true)
      true
    )
    (ok true)
  )
)
