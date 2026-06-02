;; Test-only forwarding contract used to prove that xboard-v1 mutations require
;; a direct wallet call. Do not deploy this helper with the production contract.

(define-public (claim-tile (tile-id uint) (bid uint) (program (string-ascii 96)))
  (contract-call? .xboard-v1 claim-tile tile-id bid program)
)

(define-public (program-tile (tile-id uint) (program (string-ascii 96)))
  (contract-call? .xboard-v1 program-tile tile-id program)
)

(define-public (release-tile (tile-id uint))
  (contract-call? .xboard-v1 release-tile tile-id)
)

(define-public (withdraw-fees (amount uint) (recipient principal))
  (contract-call? .xboard-v1 withdraw-fees amount recipient)
)

(define-public (set-paused (value bool))
  (contract-call? .xboard-v1 set-paused value)
)
