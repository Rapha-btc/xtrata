;; xtrata-market-sbtc-v1.0
;;
;; Simple sBTC escrow marketplace for Xtrata inscriptions.
;; - list: moves NFT into escrow (market contract principal).
;; - buy: transfers NFT to buyer and sBTC to seller (optional fee).
;; - cancel: returns NFT to seller.
;;
;; NOTE: This contract assumes the Xtrata NFT transfer checks only tx-sender
;;       equals the provided sender. Escrow transfers use `as-contract`.
;;
;; Clarinet/local lock targets: .xtrata-v2-1-0 and .mock-sbtc

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 TRAIT ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; [LOCAL / CLARINET]
(use-trait nft-trait .sip009-nft-trait.nft-trait)

;; [TESTNET]
;; (use-trait nft-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.nft-trait.nft-trait)

;; [MAINNET]
;; (use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CONSTANTS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-LISTED (err u102))
(define-constant ERR-INVALID-PRICE (err u103))
(define-constant ERR-INVALID-FEE (err u104))

(define-constant BASIS-POINTS u10000)
(define-constant MAX-FEE-BPS u1000)
(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- STATE ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-data-var contract-owner principal tx-sender)
(define-constant ALLOWED-NFT-CONTRACT .xtrata-v2-1-0)
(define-constant PAYMENT-TOKEN-CONTRACT .mock-sbtc)
(define-data-var fee-bps uint u0)
(define-data-var next-listing-id uint u0)

(define-map Listings
  uint
  {
    seller: principal,
    nft-contract: principal,
    token-id: uint,
    price: uint,
    created-at: uint
  }
)

(define-map ListingByToken
  { nft-contract: principal, token-id: uint }
  uint
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- READ-ONLY HELPERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-nft-contract)
  (ok ALLOWED-NFT-CONTRACT)
)

(define-read-only (get-payment-token)
  (ok PAYMENT-TOKEN-CONTRACT)
)

(define-read-only (get-fee-bps)
  (ok (var-get fee-bps))
)

(define-read-only (get-last-listing-id)
  (let ((next (var-get next-listing-id)))
    (if (> next u0)
      (ok (- next u1))
      (ok u0)
    )
  )
)

(define-read-only (get-listing (listing-id uint))
  (map-get? Listings listing-id)
)

(define-read-only (get-listing-by-token (nft-contract principal) (token-id uint))
  (match (map-get? ListingByToken { nft-contract: nft-contract, token-id: token-id })
    listing-id (map-get? Listings listing-id)
    none
  )
)

(define-read-only (get-listing-id-by-token (nft-contract principal) (token-id uint))
  (map-get? ListingByToken { nft-contract: nft-contract, token-id: token-id })
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- PRIVATE HELPERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-private (transfer-payment (amount uint) (sender principal) (recipient principal))
  (contract-call? .mock-sbtc transfer amount sender recipient none)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (set-fee-bps (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-fee MAX-FEE-BPS) ERR-INVALID-FEE)
    (var-set fee-bps new-fee)
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- MARKET FUNCTIONS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (list-token (nft-contract <nft-trait>) (token-id uint) (price uint))
  (let ((nft-principal (contract-of nft-contract)))
    (begin
      (asserts! (is-eq nft-principal ALLOWED-NFT-CONTRACT) ERR-NOT-AUTHORIZED)
      (asserts! (> price u0) ERR-INVALID-PRICE)
      (asserts!
        (is-none (map-get? ListingByToken { nft-contract: nft-principal, token-id: token-id }))
        ERR-ALREADY-LISTED
      )
      (try! (contract-call? nft-contract transfer token-id tx-sender CONTRACT-PRINCIPAL))
      (let ((listing-id (var-get next-listing-id)))
        (map-set Listings listing-id {
          seller: tx-sender,
          nft-contract: nft-principal,
          token-id: token-id,
          price: price,
          created-at: stacks-block-height
        })
        (map-set ListingByToken { nft-contract: nft-principal, token-id: token-id } listing-id)
        (var-set next-listing-id (+ listing-id u1))
        (print {
          event: "list",
          listing-id: listing-id,
          seller: tx-sender,
          nft-contract: nft-principal,
          token-id: token-id,
          price: price
        })
        (ok listing-id)
      )
    )
  )
)

(define-public (cancel (nft-contract <nft-trait>) (listing-id uint))
  (let ((listing (unwrap! (map-get? Listings listing-id) ERR-NOT-FOUND)))
    (begin
      (asserts! (is-eq ALLOWED-NFT-CONTRACT (get nft-contract listing)) ERR-NOT-AUTHORIZED)
      (asserts! (is-eq (contract-of nft-contract) (get nft-contract listing)) ERR-NOT-FOUND)
      (asserts! (is-eq tx-sender (get seller listing)) ERR-NOT-AUTHORIZED)
      (try!
        (as-contract
          (contract-call?
            nft-contract
            transfer
            (get token-id listing)
            CONTRACT-PRINCIPAL
            (get seller listing)
          )
        )
      )
      (map-delete Listings listing-id)
      (map-delete ListingByToken {
        nft-contract: (get nft-contract listing),
        token-id: (get token-id listing)
      })
      (print {
        event: "cancel",
        listing-id: listing-id,
        seller: (get seller listing),
        nft-contract: (get nft-contract listing),
        token-id: (get token-id listing)
      })
      (ok true)
    )
  )
)

(define-public (buy (nft-contract <nft-trait>) (listing-id uint))
  (let ((listing (unwrap! (map-get? Listings listing-id) ERR-NOT-FOUND)))
    (let (
      (buyer tx-sender)
      (price (get price listing))
      (seller (get seller listing))
      (nft-contract-principal (get nft-contract listing))
      (token-id (get token-id listing))
      (fee-bps-value (var-get fee-bps))
    )
      (asserts! (is-eq nft-contract-principal ALLOWED-NFT-CONTRACT) ERR-NOT-AUTHORIZED)
      (asserts! (is-eq (contract-of nft-contract) nft-contract-principal) ERR-NOT-FOUND)
      (let (
        (fee (/ (* price fee-bps-value) BASIS-POINTS))
        (seller-amount (- price fee))
      )
        (begin
          (try!
            (as-contract
              (contract-call?
                nft-contract
                transfer
                token-id
                CONTRACT-PRINCIPAL
                buyer
              )
            )
          )
          (try! (transfer-payment seller-amount buyer seller))
          (if (> fee u0)
            (begin
              (try! (transfer-payment fee buyer (var-get contract-owner)))
              true
            )
            true
          )
          (map-delete Listings listing-id)
          (map-delete ListingByToken {
            nft-contract: nft-contract-principal,
            token-id: token-id
          })
          (print {
            event: "buy",
            listing-id: listing-id,
            buyer: tx-sender,
            seller: seller,
            nft-contract: nft-contract-principal,
            token-id: token-id,
            price: price,
            fee: fee
          })
          (ok true)
        )
      )
    )
  )
)
