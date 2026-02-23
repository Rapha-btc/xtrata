;; xtrata-preinscribed-collection-sale-v1.0
;;
;; Escrow sale contract for pre-inscribed Xtrata tokens.
;; - Admin deposits already-minted token IDs into escrow.
;; - Buyers purchase specific escrowed IDs and receive immediate transfer.
;; - Supports allowlist, per-wallet limits, payout splits, and sale windows.
;;
;; Clarinet/local lock target:
;;   .xtrata-v2-1-0

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-AVAILABLE (err u102))
(define-constant ERR-INVALID-BPS (err u103))
(define-constant ERR-INVALID-TOKEN (err u104))
(define-constant ERR-NOT-ALLOWLISTED (err u105))
(define-constant ERR-WALLET-LIMIT (err u106))
(define-constant ERR-PAUSED (err u107))
(define-constant ERR-SALE-INACTIVE (err u108))
(define-constant ERR-NOT-AVAILABLE (err u109))
(define-constant ERR-INVALID-WINDOW (err u110))
(define-constant ERR-INVALID-ALLOWANCE (err u111))

(define-constant BASIS-POINTS u10000)
(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))
(define-constant ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool true)
(define-data-var price uint u0)
(define-data-var allowlist-enabled bool false)
(define-data-var max-per-wallet uint u0)
(define-data-var sale-start-block uint u0)
(define-data-var sale-end-block uint u0)
(define-data-var available-count uint u0)
(define-data-var sold-count uint u0)

(define-data-var artist-recipient principal tx-sender)
(define-data-var marketplace-recipient principal tx-sender)
(define-data-var operator-recipient principal tx-sender)

(define-data-var artist-bps uint u10000)
(define-data-var marketplace-bps uint u0)
(define-data-var operator-bps uint u0)

(define-map Allowlist
  { owner: principal }
  { allowance: uint }
)

(define-map WalletStats
  { owner: principal }
  { bought: uint }
)

(define-map Inventory
  { token-id: uint }
  {
    seller: principal,
    available: bool,
    sold: bool,
    deposited-at: uint,
    sold-at: uint,
    buyer: (optional principal)
  }
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

(define-private (assert-sale-active)
  (let
    (
      (start (var-get sale-start-block))
      (end (var-get sale-end-block))
    )
    (begin
      (asserts!
        (or (is-eq start u0) (>= stacks-block-height start))
        ERR-SALE-INACTIVE
      )
      (asserts!
        (or (is-eq end u0) (<= stacks-block-height end))
        ERR-SALE-INACTIVE
      )
      (ok true)
    )
  )
)

(define-private (get-wallet-stats-internal (owner principal))
  (default-to
    { bought: u0 }
    (map-get? WalletStats { owner: owner })
  )
)

(define-private (set-wallet-stats (owner principal) (bought uint))
  (map-set WalletStats { owner: owner } { bought: bought })
)

(define-private (check-wallet-limit (buyer principal))
  (let
    (
      (stats (get-wallet-stats-internal buyer))
      (limit (var-get max-per-wallet))
    )
    (if
      (and (> limit u0) (>= (get bought stats) limit))
      ERR-WALLET-LIMIT
      (ok true)
    )
  )
)

(define-private (check-allowlist (buyer principal))
  (if
    (var-get allowlist-enabled)
    (match (map-get? Allowlist { owner: buyer })
      entry
        (let
          (
            (allowance (get allowance entry))
            (stats (get-wallet-stats-internal buyer))
          )
          (if
            (>= (get bought stats) allowance)
            ERR-WALLET-LIMIT
            (ok true)
          )
        )
      ERR-NOT-ALLOWLISTED
    )
    (ok true)
  )
)

(define-private (pay-if-positive (amount uint) (sender principal) (recipient principal))
  (if
    (> amount u0)
    (stx-transfer? amount sender recipient)
    (ok true)
  )
)

(define-private (distribute-payment (buyer principal) (amount uint))
  (let
    (
      (marketplace-amount (/ (* amount (var-get marketplace-bps)) BASIS-POINTS))
      (operator-amount (/ (* amount (var-get operator-bps)) BASIS-POINTS))
      (artist-amount (- amount (+ marketplace-amount operator-amount)))
    )
    (begin
      (try! (pay-if-positive artist-amount buyer (var-get artist-recipient)))
      (try! (pay-if-positive marketplace-amount buyer (var-get marketplace-recipient)))
      (try! (pay-if-positive operator-amount buyer (var-get operator-recipient)))
      (ok true)
    )
  )
)

(define-private (deposit-token-internal (token-id uint))
  (let ((previous (map-get? Inventory { token-id: token-id })))
    (begin
      (match previous
        entry (asserts! (not (get available entry)) ERR-ALREADY-AVAILABLE)
        true
      )
      (try!
        (contract-call?
          'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
          transfer
          token-id
          tx-sender
          CONTRACT-PRINCIPAL
        )
      )
      (map-set Inventory
        { token-id: token-id }
        {
          seller: tx-sender,
          available: true,
          sold: false,
          deposited-at: stacks-block-height,
          sold-at: u0,
          buyer: none
        }
      )
      (var-set available-count (+ (var-get available-count) u1))
      (print
        {
          event: "deposit",
          token-id: token-id,
          seller: tx-sender
        }
      )
      (ok true)
    )
  )
)

(define-private (deposit-batch-step (token-id uint) (acc (response bool uint)))
  (match acc
    ok-value (deposit-token-internal token-id)
    err-value acc
  )
)

(define-private (withdraw-token-internal (token-id uint) (recipient principal))
  (let
    (
      (entry (unwrap! (map-get? Inventory { token-id: token-id }) ERR-NOT-FOUND))
    )
    (begin
      (asserts! (get available entry) ERR-NOT-AVAILABLE)
      (try!
        (as-contract
          (contract-call?
            'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
            transfer
            token-id
            CONTRACT-PRINCIPAL
            recipient
          )
        )
      )
      (map-set Inventory
        { token-id: token-id }
        (merge entry
          {
            available: false,
            sold: false,
            sold-at: u0,
            buyer: none
          }
        )
      )
      (var-set available-count (- (var-get available-count) u1))
      (print
        {
          event: "withdraw",
          token-id: token-id,
          recipient: recipient
        }
      )
      (ok true)
    )
  )
)

(define-private (withdraw-batch-step (token-id uint) (acc (response principal uint)))
  (match acc
    recipient
      (begin
        (try! (withdraw-token-internal token-id recipient))
        (ok recipient)
      )
    err-value acc
  )
)

(define-public (set-price (amount uint))
  (begin
    (try! (assert-owner))
    (var-set price amount)
    (ok true)
  )
)

(define-public (set-recipients
  (artist principal)
  (marketplace principal)
  (operator principal)
)
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
    (asserts!
      (is-eq (+ artist (+ marketplace operator)) BASIS-POINTS)
      ERR-INVALID-BPS
    )
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

(define-public (set-sale-window (start uint) (end uint))
  (begin
    (try! (assert-owner))
    (asserts! (or (is-eq end u0) (>= end start)) ERR-INVALID-WINDOW)
    (var-set sale-start-block start)
    (var-set sale-end-block end)
    (ok true)
  )
)

(define-public (set-allowlist-enabled (value bool))
  (begin
    (try! (assert-owner))
    (var-set allowlist-enabled value)
    (ok true)
  )
)

(define-public (set-max-per-wallet (value uint))
  (begin
    (try! (assert-owner))
    (var-set max-per-wallet value)
    (ok true)
  )
)

(define-public (set-allowlist (owner principal) (allowance uint))
  (begin
    (try! (assert-owner))
    (asserts! (> allowance u0) ERR-INVALID-ALLOWANCE)
    (map-set Allowlist { owner: owner } { allowance: allowance })
    (ok true)
  )
)

(define-public (clear-allowlist (owner principal))
  (begin
    (try! (assert-owner))
    (map-delete Allowlist { owner: owner })
    (ok true)
  )
)

(define-private (set-allowlist-entry (entry { owner: principal, allowance: uint }) (acc bool))
  (if
    acc
    (if
      (> (get allowance entry) u0)
      (begin
        (map-set Allowlist { owner: (get owner entry) } { allowance: (get allowance entry) })
        true
      )
      false
    )
    false
  )
)

(define-public (set-allowlist-batch (entries (list 200 { owner: principal, allowance: uint })))
  (begin
    (try! (assert-owner))
    (asserts! (fold set-allowlist-entry entries true) ERR-INVALID-ALLOWANCE)
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

(define-public (deposit-token (token-id uint))
  (begin
    (try! (assert-owner))
    (try! (deposit-token-internal token-id))
    (ok true)
  )
)

(define-public (deposit-batch (token-ids (list 50 uint)))
  (begin
    (try! (assert-owner))
    (try! (fold deposit-batch-step token-ids (ok true)))
    (ok true)
  )
)

(define-public (withdraw-token (token-id uint) (recipient principal))
  (begin
    (try! (assert-owner))
    (try! (withdraw-token-internal token-id recipient))
    (ok true)
  )
)

(define-public (withdraw-batch (token-ids (list 50 uint)) (recipient principal))
  (begin
    (try! (assert-owner))
    (try! (fold withdraw-batch-step token-ids (ok recipient)))
    (ok true)
  )
)

(define-public (buy (token-id uint))
  (let
    (
      (entry (unwrap! (map-get? Inventory { token-id: token-id }) ERR-NOT-FOUND))
      (buyer tx-sender)
      (price-value (var-get price))
      (stats (get-wallet-stats-internal buyer))
    )
    (begin
      (try! (assert-not-paused))
      (try! (assert-sale-active))
      (asserts! (get available entry) ERR-NOT-AVAILABLE)
      (try! (check-allowlist buyer))
      (try! (check-wallet-limit buyer))
      (try!
        (as-contract
          (contract-call?
            'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
            transfer
            token-id
            CONTRACT-PRINCIPAL
            buyer
          )
        )
      )
      (try! (distribute-payment buyer price-value))
      (set-wallet-stats buyer (+ (get bought stats) u1))
      (map-set Inventory
        { token-id: token-id }
        (merge entry
          {
            available: false,
            sold: true,
            sold-at: stacks-block-height,
            buyer: (some buyer)
          }
        )
      )
      (var-set available-count (- (var-get available-count) u1))
      (var-set sold-count (+ (var-get sold-count) u1))
      (print
        {
          event: "buy",
          token-id: token-id,
          buyer: buyer,
          price: price-value
        }
      )
      (ok true)
    )
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-paused)
  (ok (var-get paused))
)

(define-read-only (get-price)
  (ok (var-get price))
)

(define-read-only (get-allowlist-enabled)
  (ok (var-get allowlist-enabled))
)

(define-read-only (get-max-per-wallet)
  (ok (var-get max-per-wallet))
)

(define-read-only (get-sale-window)
  (ok
    {
      start-block: (var-get sale-start-block),
      end-block: (var-get sale-end-block)
    }
  )
)

(define-read-only (get-counts)
  (ok
    {
      available: (var-get available-count),
      sold: (var-get sold-count)
    }
  )
)

(define-read-only (get-recipients)
  (ok
    {
      artist: (var-get artist-recipient),
      marketplace: (var-get marketplace-recipient),
      operator: (var-get operator-recipient)
    }
  )
)

(define-read-only (get-splits)
  (ok
    {
      artist: (var-get artist-bps),
      marketplace: (var-get marketplace-bps),
      operator: (var-get operator-bps)
    }
  )
)

(define-read-only (get-allowlist-entry (owner principal))
  (map-get? Allowlist { owner: owner })
)

(define-read-only (get-wallet-stats (owner principal))
  (get-wallet-stats-internal owner)
)

(define-read-only (get-inventory (token-id uint))
  (map-get? Inventory { token-id: token-id })
)

(define-read-only (is-token-available (token-id uint))
  (match (map-get? Inventory { token-id: token-id })
    entry (ok (get available entry))
    (ok false)
  )
)

(define-read-only (get-allowed-xtrata-contract)
  (ok ALLOWED-XTRATA-CONTRACT)
)
