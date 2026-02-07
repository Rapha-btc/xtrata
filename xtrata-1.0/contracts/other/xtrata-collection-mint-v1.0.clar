;; xtrata-collection-mint-v1.0
;; Per-collection mint coordinator.
;; - Charges a one-time mint fee split across recipients.
;; - Proxies xtrata begin/chunk/seal calls.
;; - Enforces max supply with reservation tracking.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-PRICE (err u101))
(define-constant ERR-INVALID-BPS (err u102))
(define-constant ERR-PAUSED (err u103))
(define-constant ERR-MAX-SUPPLY (err u104))
(define-constant ERR-NOT-FOUND (err u105))

(define-constant BASIS-POINTS u10000)

(define-trait xtrata-trait
  (
    (begin-inscription ((buff 32) (string-ascii 64) uint uint) (response bool uint))
    (add-chunk-batch ((buff 32) (list 50 (buff 16384))) (response bool uint))
    (seal-inscription ((buff 32) (string-ascii 256)) (response uint uint))
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool true)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var reserved-count uint u0)
(define-data-var minted-count uint u0)

(define-data-var artist-recipient principal tx-sender)
(define-data-var marketplace-recipient principal tx-sender)
(define-data-var operator-recipient principal tx-sender)

(define-data-var artist-bps uint u0)
(define-data-var marketplace-bps uint u0)
(define-data-var operator-bps uint u0)

(define-map MintSessions
  { owner: principal, hash: (buff 32) }
  { fee-paid: bool }
)

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (ok true)
  )
)

(define-private (assert-not-paused)
  (begin
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (ok true)
  )
)

(define-private (calc-splits (amount uint))
  (let (
    (artist (/ (* amount (var-get artist-bps)) BASIS-POINTS))
    (market (/ (* amount (var-get marketplace-bps)) BASIS-POINTS))
    (operator (/ (* amount (var-get operator-bps)) BASIS-POINTS))
    (assigned (+ artist market operator))
    (remainder (- amount assigned))
  )
    {
      artist: artist,
      market: market,
      operator: (+ operator remainder)
    }
  )
)

(define-private (pay-splits (amount uint))
  (if (> amount u0)
    (let ((splits (calc-splits amount)))
      (begin
        (if (> (get artist splits) u0)
          (try! (stx-transfer? (get artist splits) tx-sender (var-get artist-recipient)))
          true
        )
        (if (> (get market splits) u0)
          (try! (stx-transfer? (get market splits) tx-sender (var-get marketplace-recipient)))
          true
        )
        (if (> (get operator splits) u0)
          (try! (stx-transfer? (get operator splits) tx-sender (var-get operator-recipient)))
          true
        )
        (ok true)
      )
    )
    (ok true)
  )
)

(define-public (set-mint-price (amount uint))
  (begin
    (try! (assert-owner))
    (var-set mint-price amount)
    (ok true)
  )
)

(define-public (set-max-supply (amount uint))
  (begin
    (try! (assert-owner))
    (asserts! (> amount u0) ERR-INVALID-PRICE)
    (var-set max-supply amount)
    (ok true)
  )
)

(define-public (set-recipients (artist principal) (marketplace principal) (operator principal))
  (begin
    (try! (assert-owner))
    (var-set artist-recipient artist)
    (var-set marketplace-recipient marketplace)
    (var-set operator-recipient operator)
    (ok true)
  )
)

(define-public (set-splits (artist uint) (marketplace uint) (operator uint))
  (begin
    (try! (assert-owner))
    (asserts! (<= (+ artist marketplace operator) BASIS-POINTS) ERR-INVALID-BPS)
    (var-set artist-bps artist)
    (var-set marketplace-bps marketplace)
    (var-set operator-bps operator)
    (ok true)
  )
)

(define-public (set-paused (value bool))
  (begin
    (try! (assert-owner))
    (var-set paused value)
    (ok true)
  )
)

(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (try! (assert-owner))
    (var-set contract-owner new-owner)
    (ok true)
  )
)

(define-public (release-reservation (owner principal) (hash (buff 32)))
  (let ((session (map-get? MintSessions { owner: owner, hash: hash })))
    (begin
      (try! (assert-owner))
      (asserts! (is-some session) ERR-NOT-FOUND)
      (map-delete MintSessions { owner: owner, hash: hash })
      (var-set reserved-count (- (var-get reserved-count) u1))
      (ok true)
    )
  )
)

(define-public (mint-begin (xtrata-contract <xtrata-trait>) (expected-hash (buff 32)) (mime (string-ascii 64)) (total-size uint) (total-chunks uint))
  (begin
    (try! (assert-not-paused))
    (let (
      (session (map-get? MintSessions { owner: tx-sender, hash: expected-hash }))
      (active (+ (var-get minted-count) (var-get reserved-count)))
    )
      (begin
        (asserts! (< active (var-get max-supply)) ERR-MAX-SUPPLY)
        (if (is-none session)
          (begin
            (try! (pay-splits (var-get mint-price)))
            (var-set reserved-count (+ (var-get reserved-count) u1))
            (map-insert MintSessions { owner: tx-sender, hash: expected-hash } { fee-paid: true })
            true
          )
          true
        )
        (contract-call? xtrata-contract begin-inscription expected-hash mime total-size total-chunks)
      )
    )
  )
)

(define-public (mint-add-chunk-batch (xtrata-contract <xtrata-trait>) (hash (buff 32)) (chunks (list 50 (buff 16384))))
  (begin
    (try! (assert-not-paused))
    (asserts! (is-some (map-get? MintSessions { owner: tx-sender, hash: hash })) ERR-NOT-FOUND)
    (contract-call? xtrata-contract add-chunk-batch hash chunks)
  )
)

(define-public (mint-seal (xtrata-contract <xtrata-trait>) (expected-hash (buff 32)) (token-uri-string (string-ascii 256)))
  (begin
    (try! (assert-not-paused))
    (asserts! (is-some (map-get? MintSessions { owner: tx-sender, hash: expected-hash })) ERR-NOT-FOUND)
    (let ((token-id (try! (contract-call? xtrata-contract seal-inscription expected-hash token-uri-string))))
      (begin
        (map-delete MintSessions { owner: tx-sender, hash: expected-hash })
        (var-set reserved-count (- (var-get reserved-count) u1))
        (var-set minted-count (+ (var-get minted-count) u1))
        (ok token-id)
      )
    )
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-mint-price)
  (ok (var-get mint-price))
)


(define-read-only (get-max-supply)
  (ok (var-get max-supply))
)

(define-read-only (get-minted-count)
  (ok (var-get minted-count))
)

(define-read-only (get-reserved-count)
  (ok (var-get reserved-count))
)

(define-read-only (get-recipients)
  (ok {
    artist: (var-get artist-recipient),
    marketplace: (var-get marketplace-recipient),
    operator: (var-get operator-recipient)
  })
)

(define-read-only (get-splits)
  (ok {
    artist: (var-get artist-bps),
    marketplace: (var-get marketplace-bps),
    operator: (var-get operator-bps)
  })
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
