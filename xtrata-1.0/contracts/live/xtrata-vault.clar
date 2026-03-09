;; xtrata-vault
;;
;; sBTC reserve vaults for Xtrata assets.
;; - Asset owners open one vault per asset with an initial sBTC reserve deposit.
;; - Owners can top up deposits and toggle a reserve marker.
;; - MVP only: no withdrawals, liquidations, delegation, or vault ownership migration.
;;
;; Mainnet lock targets: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 and SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INVALID-ASSET (err u103))
(define-constant ERR-ALREADY-EXISTS (err u104))
(define-constant ERR-ASSET-CONTROL (err u105))

(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))
(define-constant ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)
(define-constant RESERVE-TOKEN-CONTRACT 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant TIER-1-MIN u100)
(define-constant TIER-2-MIN u500)
(define-constant TIER-3-MIN u1000)

(define-data-var contract-owner principal tx-sender)
(define-data-var next-vault-id uint u0)

(define-map Vaults
  uint
  {
    asset-id: uint,
    owner: principal,
    amount: uint,
    tier: uint,
    reserved: bool,
    created-at: uint,
    updated-at: uint
  }
)

(define-map VaultByAsset
  { asset-id: uint }
  uint
)

(define-private (get-tier-for-amount-internal (amount uint))
  (if (>= amount TIER-3-MIN)
    u3
    (if (>= amount TIER-2-MIN)
      u2
      (if (>= amount TIER-1-MIN)
        u1
        u0
      )
    )
  )
)

(define-private (get-asset-owner (asset-id uint))
  (match (unwrap! (contract-call? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 get-owner asset-id) ERR-NOT-FOUND)
    owner (ok owner)
    ERR-NOT-FOUND
  )
)

(define-private (assert-vault-control (vault { asset-id: uint, owner: principal, amount: uint, tier: uint, reserved: bool, created-at: uint, updated-at: uint }))
  (let ((current-owner (try! (get-asset-owner (get asset-id vault)))))
    (begin
      (asserts! (is-eq tx-sender (get owner vault)) ERR-NOT-AUTHORIZED)
      (asserts! (is-eq current-owner (get owner vault)) ERR-ASSET-CONTROL)
      (ok true)
    )
  )
)

(define-private (assert-asset-control (asset-id uint) (owner principal))
  (let ((current-owner (try! (get-asset-owner asset-id))))
    (begin
      (asserts! (is-eq current-owner owner) ERR-ASSET-CONTROL)
      (ok true)
    )
  )
)

(define-private (transfer-sbtc (amount uint) (sender principal) (recipient principal))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount sender recipient none)
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-core-contract)
  (ok ALLOWED-XTRATA-CONTRACT)
)

(define-read-only (get-reserve-token)
  (ok RESERVE-TOKEN-CONTRACT)
)

(define-read-only (get-next-vault-id)
  (ok (var-get next-vault-id))
)

(define-read-only (get-vault (vault-id uint))
  (map-get? Vaults vault-id)
)

(define-read-only (get-tier-for-amount (amount uint))
  (ok (get-tier-for-amount-internal amount))
)

(define-read-only (has-premium-access (asset-id uint) (user principal))
  (match (map-get? VaultByAsset { asset-id: asset-id })
    vault-id
      (match (map-get? Vaults vault-id)
        vault
          (if (not (is-eq (get owner vault) user))
            (ok false)
            (match (get-asset-owner asset-id)
              current-owner (ok (and (is-eq current-owner user) (> (get tier vault) u0)))
              err-code (ok false)
            )
          )
        (ok false)
      )
    (ok false)
  )
)

(define-public (open-vault (asset-id uint) (initial-amount uint))
  (begin
    (asserts! (> initial-amount u0) ERR-INVALID-AMOUNT)
    (asserts! (is-none (map-get? VaultByAsset { asset-id: asset-id })) ERR-ALREADY-EXISTS)
    (try! (assert-asset-control asset-id tx-sender))
    (try! (transfer-sbtc initial-amount tx-sender CONTRACT-PRINCIPAL))
    (let (
      (vault-id (var-get next-vault-id))
      (tier (get-tier-for-amount-internal initial-amount))
    )
      (map-set Vaults vault-id {
        asset-id: asset-id,
        owner: tx-sender,
        amount: initial-amount,
        tier: tier,
        reserved: false,
        created-at: stacks-block-height,
        updated-at: stacks-block-height
      })
      (map-set VaultByAsset { asset-id: asset-id } vault-id)
      (var-set next-vault-id (+ vault-id u1))
      (print {
        event: "open-vault",
        vault-id: vault-id,
        asset-id: asset-id,
        owner: tx-sender,
        amount: initial-amount,
        tier: tier
      })
      (ok vault-id)
    )
  )
)

(define-public (deposit-sbtc (vault-id uint) (amount uint))
  (let ((vault (unwrap! (map-get? Vaults vault-id) ERR-NOT-FOUND)))
    (begin
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)
      (try! (assert-vault-control vault))
      (try! (transfer-sbtc amount tx-sender CONTRACT-PRINCIPAL))
      (let (
        (new-amount (+ (get amount vault) amount))
        (new-tier (get-tier-for-amount-internal (+ (get amount vault) amount)))
      )
        (map-set Vaults vault-id (merge vault {
          amount: new-amount,
          tier: new-tier,
          updated-at: stacks-block-height
        }))
        (print {
          event: "deposit-sbtc",
          vault-id: vault-id,
          owner: tx-sender,
          amount: amount,
          total: new-amount,
          tier: new-tier
        })
        (ok true)
      )
    )
  )
)

(define-public (mark-reserved (vault-id uint) (reserved bool))
  (let ((vault (unwrap! (map-get? Vaults vault-id) ERR-NOT-FOUND)))
    (begin
      (try! (assert-vault-control vault))
      (map-set Vaults vault-id (merge vault {
        reserved: reserved,
        updated-at: stacks-block-height
      }))
      (print {
        event: "mark-reserved",
        vault-id: vault-id,
        owner: tx-sender,
        reserved: reserved
      })
      (ok true)
    )
  )
)
