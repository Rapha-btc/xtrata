(define-trait ft-trait
  (
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 10) uint))
    (get-decimals () (response uint uint))
    (get-total-supply () (response uint uint))
    (get-balance (principal) (response uint uint))
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
  )
)
