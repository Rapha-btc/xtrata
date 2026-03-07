;; xtrata-commerce
;;
;; USDCx entitlement listings for Xtrata assets.
;; - Sellers list existing Xtrata asset ids for fixed-price USDCx access.
;; - Buyers pay USDCx and receive one-time entitlement keyed by asset id.
;; - MVP only: no auctions, royalties, multi-splits, or x402 settlement.
;;
;; Mainnet reference targets: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 and SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-INVALID-PRICE (err u102))
(define-constant ERR-INVALID-ASSET (err u103))
(define-constant ERR-INACTIVE-LISTING (err u104))
(define-constant ERR-ALREADY-ENTITLED (err u105))
(define-constant ERR-ASSET-CONTROL (err u106))

(define-constant ALLOWED-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)
(define-constant PAYMENT-TOKEN-CONTRACT 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)

(define-data-var contract-owner principal tx-sender)
(define-data-var next-listing-id uint u0)

(define-map Listings
  uint
  {
    asset-id: uint,
    seller: principal,
    price: uint,
    active: bool,
    created-at: uint,
    updated-at: uint
  }
)

(define-map Entitlements
  { owner: principal, asset-id: uint }
  {
    listing-id: uint,
    seller: principal,
    price: uint,
    purchased-at: uint
  }
)

(define-private (get-asset-owner (asset-id uint))
  (match (unwrap! (contract-call? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0 get-owner asset-id) ERR-NOT-FOUND)
    owner (ok owner)
    ERR-NOT-FOUND
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

(define-private (transfer-usdcx (amount uint) (sender principal) (recipient principal))
  (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx transfer amount sender recipient none)
)

(define-private (can-manage-listing (listing { asset-id: uint, seller: principal, price: uint, active: bool, created-at: uint, updated-at: uint }))
  (or
    (is-eq tx-sender (get seller listing))
    (is-eq tx-sender (var-get contract-owner))
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-core-contract)
  (ok ALLOWED-XTRATA-CONTRACT)
)

(define-read-only (get-payment-token)
  (ok PAYMENT-TOKEN-CONTRACT)
)

(define-read-only (get-next-listing-id)
  (ok (var-get next-listing-id))
)

(define-read-only (get-listing (listing-id uint))
  (map-get? Listings listing-id)
)

(define-read-only (has-entitlement (asset-id uint) (owner principal))
  (ok (is-some (map-get? Entitlements { owner: owner, asset-id: asset-id })))
)

(define-public (create-listing (asset-id uint) (price uint))
  (begin
    (asserts! (> price u0) ERR-INVALID-PRICE)
    (try! (assert-asset-control asset-id tx-sender))
    (let ((listing-id (var-get next-listing-id)))
      (map-set Listings listing-id {
        asset-id: asset-id,
        seller: tx-sender,
        price: price,
        active: true,
        created-at: stacks-block-height,
        updated-at: stacks-block-height
      })
      (var-set next-listing-id (+ listing-id u1))
      (print {
        event: "create-listing",
        listing-id: listing-id,
        asset-id: asset-id,
        seller: tx-sender,
        price: price
      })
      (ok listing-id)
    )
  )
)

(define-public (set-listing-active (listing-id uint) (active bool))
  (let ((listing (unwrap! (map-get? Listings listing-id) ERR-NOT-FOUND)))
    (begin
      (asserts! (can-manage-listing listing) ERR-NOT-AUTHORIZED)
      (map-set Listings listing-id (merge listing {
        active: active,
        updated-at: stacks-block-height
      }))
      (print {
        event: "set-listing-active",
        listing-id: listing-id,
        seller: (get seller listing),
        active: active
      })
      (ok true)
    )
  )
)

(define-public (buy-with-usdc (listing-id uint))
  (let ((listing (unwrap! (map-get? Listings listing-id) ERR-NOT-FOUND)))
    (let (
      (asset-id (get asset-id listing))
      (seller (get seller listing))
      (price (get price listing))
    )
      (begin
        (asserts! (get active listing) ERR-INACTIVE-LISTING)
        (asserts!
          (is-none (map-get? Entitlements { owner: tx-sender, asset-id: asset-id }))
          ERR-ALREADY-ENTITLED
        )
        (try! (assert-asset-control asset-id seller))
        (try! (transfer-usdcx price tx-sender seller))
        (map-set Entitlements
          { owner: tx-sender, asset-id: asset-id }
          {
            listing-id: listing-id,
            seller: seller,
            price: price,
            purchased-at: stacks-block-height
          }
        )
        (print {
          event: "buy-with-usdc",
          listing-id: listing-id,
          asset-id: asset-id,
          seller: seller,
          buyer: tx-sender,
          price: price
        })
        (ok true)
      )
    )
  )
)
