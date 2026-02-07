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
(define-constant ERR-NOT-ALLOWLISTED (err u106))
(define-constant ERR-WALLET-LIMIT (err u107))
(define-constant ERR-FINALIZED (err u108))
(define-constant ERR-ALREADY-SET (err u109))
(define-constant ERR-NOT-FINALIZABLE (err u110))
(define-constant ERR-INVALID-BATCH (err u111))

(define-constant BASIS-POINTS u10000)

(define-trait xtrata-trait
  (
    (begin-inscription ((buff 32) (string-ascii 64) uint uint) (response bool uint))
    (add-chunk-batch ((buff 32) (list 50 (buff 16384))) (response bool uint))
    (seal-inscription ((buff 32) (string-ascii 256)) (response uint uint))
    (seal-inscription-batch ((list 50 { hash: (buff 32), token-uri: (string-ascii 256) })) (response { start: uint, count: uint } uint))
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool true)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var reserved-count uint u0)
(define-data-var minted-count uint u0)
(define-data-var finalized bool false)
(define-data-var allowlist-enabled bool false)
(define-data-var max-per-wallet uint u0)

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
(define-map Allowlist
  { owner: principal }
  { allowance: uint }
)
(define-map WalletStats
  { owner: principal }
  { minted: uint, reserved: uint }
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

(define-private (assert-not-finalized)
  (begin
    (asserts! (not (var-get finalized)) ERR-FINALIZED)
    (ok true)
  )
)

(define-private (get-wallet-stats-internal (owner principal))
  (default-to { minted: u0, reserved: u0 } (map-get? WalletStats { owner: owner }))
)

(define-private (set-wallet-stats (owner principal) (minted uint) (reserved uint))
  (map-set WalletStats { owner: owner } { minted: minted, reserved: reserved })
)

(define-private (check-wallet-limit (owner principal))
  (let (
    (stats (get-wallet-stats-internal owner))
    (active (+ (get minted stats) (get reserved stats)))
    (limit (var-get max-per-wallet))
  )
    (if (and (> limit u0) (>= active limit))
      ERR-WALLET-LIMIT
      (ok true)
    )
  )
)

(define-private (check-allowlist (owner principal))
  (if (var-get allowlist-enabled)
    (match (map-get? Allowlist { owner: owner })
      entry (let (
        (stats (get-wallet-stats-internal owner))
        (active (+ (get minted stats) (get reserved stats)))
        (allowance (get allowance entry))
      )
        (if (>= active allowance)
          ERR-WALLET-LIMIT
          (ok true)
        )
      )
      ERR-NOT-ALLOWLISTED
    )
    (ok true)
  )
)

(define-private (record-reservation (owner principal))
  (let ((stats (get-wallet-stats-internal owner)))
    (set-wallet-stats owner (get minted stats) (+ (get reserved stats) u1))
  )
)

(define-private (release-reservation-for (owner principal))
  (let (
    (stats (get-wallet-stats-internal owner))
    (reserved (get reserved stats))
    (next-reserved (if (> reserved u0) (- reserved u1) u0))
  )
    (set-wallet-stats owner (get minted stats) next-reserved)
  )
)

(define-private (record-mint-for (owner principal))
  (let (
    (stats (get-wallet-stats-internal owner))
    (reserved (get reserved stats))
    (next-reserved (if (> reserved u0) (- reserved u1) u0))
  )
    (set-wallet-stats owner (+ (get minted stats) u1) next-reserved)
  )
)

(define-private (record-mint-batch (owner principal) (count uint))
  (let ((stats (get-wallet-stats-internal owner)))
    (begin
      (asserts! (>= (get reserved stats) count) ERR-INVALID-BATCH)
      (set-wallet-stats owner (+ (get minted stats) count) (- (get reserved stats) count))
      (ok true)
    )
  )
)

(define-private (hash-in-list? (hash (buff 32)) (items (list 50 (buff 32))))
  (let ((res (fold hash-in-list-step items { target: hash, found: false })))
    (get found res)
  )
)

(define-private (hash-in-list-step (item (buff 32)) (acc { target: (buff 32), found: bool }))
  (if (get found acc)
    acc
    { target: (get target acc), found: (is-eq item (get target acc)) }
  )
)

(define-private (validate-batch-uniqueness (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) })))
  (let ((res (fold validate-batch-item items { ok: true, seen: (list) })))
    (get ok res)
  )
)

(define-private (validate-batch-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, seen: (list 50 (buff 32)) })
)
  (if (not (get ok acc))
    acc
    (if (hash-in-list? (get hash item) (get seen acc))
      { ok: false, seen: (get seen acc) }
      { ok: true, seen: (unwrap-panic (as-max-len? (append (get seen acc) (get hash item)) u50)) }
    )
  )
)

(define-private (validate-batch-sessions
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
)
  (let ((res (fold validate-batch-session items { ok: true, owner: owner })))
    (get ok res)
  )
)

(define-private (validate-batch-session
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, owner: principal })
)
  (if (get ok acc)
    (if (is-some (map-get? MintSessions { owner: (get owner acc), hash: (get hash item) }))
      acc
      { ok: false, owner: (get owner acc) }
    )
    acc
  )
)

(define-private (clear-mint-sessions
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
)
  (begin
    (fold clear-mint-session items owner)
    true
  )
)

(define-private (clear-mint-session
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (owner principal)
)
  (begin
    (map-delete MintSessions { owner: owner, hash: (get hash item) })
    owner
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
    (try! (assert-not-finalized))
    (var-set mint-price amount)
    (ok true)
  )
)

(define-public (set-max-supply (amount uint))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (asserts! (> amount u0) ERR-INVALID-PRICE)
    (asserts! (is-eq (var-get max-supply) u0) ERR-ALREADY-SET)
    (var-set max-supply amount)
    (ok true)
  )
)

(define-public (set-allowlist-enabled (value bool))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set allowlist-enabled value)
    (ok true)
  )
)

(define-public (set-max-per-wallet (amount uint))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set max-per-wallet amount)
    (ok true)
  )
)

(define-public (set-allowlist (owner principal) (allowance uint))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (map-set Allowlist { owner: owner } { allowance: allowance })
    (ok true)
  )
)

(define-public (clear-allowlist (owner principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (map-delete Allowlist { owner: owner })
    (ok true)
  )
)

(define-public (set-allowlist-batch (entries (list 50 { owner: principal, allowance: uint })))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (fold set-allowlist-entry entries (ok true))
  )
)

(define-private (set-allowlist-entry (entry { owner: principal, allowance: uint }) (acc (response bool uint)))
  (if (is-ok acc)
    (begin
      (map-set Allowlist { owner: (get owner entry) } { allowance: (get allowance entry) })
      acc
    )
    acc
  )
)

(define-public (set-recipients (artist principal) (marketplace principal) (operator principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set artist-recipient artist)
    (var-set marketplace-recipient marketplace)
    (var-set operator-recipient operator)
    (ok true)
  )
)

(define-public (set-splits (artist uint) (marketplace uint) (operator uint))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
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
    (try! (assert-not-finalized))
    (var-set paused value)
    (ok true)
  )
)

(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set contract-owner new-owner)
    (ok true)
  )
)

(define-public (release-reservation (owner principal) (hash (buff 32)))
  (let ((session (map-get? MintSessions { owner: owner, hash: hash })))
    (begin
      (try! (assert-owner))
      (try! (assert-not-finalized))
      (asserts! (is-some session) ERR-NOT-FOUND)
      (map-delete MintSessions { owner: owner, hash: hash })
      (var-set reserved-count (- (var-get reserved-count) u1))
      (release-reservation-for owner)
      (ok true)
    )
  )
)

(define-public (mint-begin (xtrata-contract <xtrata-trait>) (expected-hash (buff 32)) (mime (string-ascii 64)) (total-size uint) (total-chunks uint))
  (begin
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (let (
      (session (map-get? MintSessions { owner: tx-sender, hash: expected-hash }))
      (active (+ (var-get minted-count) (var-get reserved-count)))
    )
      (begin
        (if (is-none session)
          (begin
            (asserts! (< active (var-get max-supply)) ERR-MAX-SUPPLY)
            (try! (check-wallet-limit tx-sender))
            (try! (check-allowlist tx-sender))
            (try! (pay-splits (var-get mint-price)))
            (var-set reserved-count (+ (var-get reserved-count) u1))
            (record-reservation tx-sender)
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
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (asserts! (is-some (map-get? MintSessions { owner: tx-sender, hash: hash })) ERR-NOT-FOUND)
    (contract-call? xtrata-contract add-chunk-batch hash chunks)
  )
)

(define-public (mint-seal (xtrata-contract <xtrata-trait>) (expected-hash (buff 32)) (token-uri-string (string-ascii 256)))
  (begin
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (asserts! (is-some (map-get? MintSessions { owner: tx-sender, hash: expected-hash })) ERR-NOT-FOUND)
    (let ((token-id (try! (contract-call? xtrata-contract seal-inscription expected-hash token-uri-string))))
      (begin
        (map-delete MintSessions { owner: tx-sender, hash: expected-hash })
        (var-set reserved-count (- (var-get reserved-count) u1))
        (var-set minted-count (+ (var-get minted-count) u1))
        (record-mint-for tx-sender)
        (ok token-id)
      )
    )
  )
)

(define-public (mint-seal-batch
  (xtrata-contract <xtrata-trait>)
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (begin
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (asserts! (> (len items) u0) ERR-INVALID-BATCH)
    (asserts! (validate-batch-uniqueness items) ERR-INVALID-BATCH)
    (asserts! (validate-batch-sessions items tx-sender) ERR-NOT-FOUND)
    (let ((result (try! (contract-call? xtrata-contract seal-inscription-batch items))))
      (begin
        (clear-mint-sessions items tx-sender)
        (var-set reserved-count (- (var-get reserved-count) (len items)))
        (var-set minted-count (+ (var-get minted-count) (len items)))
        (try! (record-mint-batch tx-sender (len items)))
        (ok result)
      )
    )
  )
)

(define-public (finalize)
  (begin
    (try! (assert-owner))
    (asserts! (not (var-get finalized)) ERR-FINALIZED)
    (asserts! (> (var-get max-supply) u0) ERR-NOT-FINALIZABLE)
    (asserts! (is-eq (var-get reserved-count) u0) ERR-NOT-FINALIZABLE)
    (asserts! (is-eq (var-get minted-count) (var-get max-supply)) ERR-NOT-FINALIZABLE)
    (var-set finalized true)
    (ok true)
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

(define-read-only (get-finalized)
  (ok (var-get finalized))
)

(define-read-only (get-allowlist-enabled)
  (ok (var-get allowlist-enabled))
)

(define-read-only (get-max-per-wallet)
  (ok (var-get max-per-wallet))
)

(define-read-only (get-allowlist-entry (owner principal))
  (map-get? Allowlist { owner: owner })
)

(define-read-only (get-wallet-stats (owner principal))
  (ok (get-wallet-stats-internal owner))
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
