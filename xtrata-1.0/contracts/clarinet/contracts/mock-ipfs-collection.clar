;; mock-ipfs-collection
;; Test-only SIP-009 source collection with IPFS token URIs.

(impl-trait .sip009-nft-trait.nft-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-DUPLICATE (err u102))

(define-non-fungible-token mock-ipfs-token uint)

(define-data-var contract-owner principal tx-sender)
(define-data-var max-token-id uint u0)
(define-data-var minted-count uint u0)

(define-map TokenURIs uint (string-ascii 256))
(define-map MintedIndex uint uint)

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (ok true)
  )
)

(define-private (record-mint (id uint))
  (let (
    (count (var-get minted-count))
    (current-max (var-get max-token-id))
  )
    (begin
      (map-set MintedIndex count id)
      (var-set minted-count (+ count u1))
      (if (> id current-max)
        (var-set max-token-id id)
        true
      )
      id
    )
  )
)

(define-public (mint (id uint) (recipient principal) (token-uri (string-ascii 256)))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (nft-get-owner? mock-ipfs-token id)) ERR-DUPLICATE)
    (try! (nft-mint? mock-ipfs-token id recipient))
    (map-set TokenURIs id token-uri)
    (record-mint id)
    (ok id)
  )
)

(define-read-only (get-last-token-id)
  (ok (var-get max-token-id))
)

(define-read-only (get-token-uri (id uint))
  (if (is-some (nft-get-owner? mock-ipfs-token id))
    (ok (map-get? TokenURIs id))
    (ok none)
  )
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? mock-ipfs-token id))
)

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (some sender) (nft-get-owner? mock-ipfs-token id)) ERR-NOT-AUTHORIZED)
    (try! (nft-transfer? mock-ipfs-token id sender recipient))
    (ok true)
  )
)

(define-read-only (get-minted-count)
  (ok (var-get minted-count))
)

(define-read-only (get-minted-id (index uint))
  (map-get? MintedIndex index)
)
