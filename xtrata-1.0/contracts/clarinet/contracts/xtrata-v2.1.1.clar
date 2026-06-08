;; xtrata-v2.1.1 compatibility stub
;; v2.1.1 was never deployed to mainnet. This stub exists only to satisfy
;; inter-contract type-checks in v3.0.0, v3.2.0, and v3.2.1 which reference
;; .xtrata-v2-1-1. All functions return empty / not-found values.

(impl-trait .sip009-nft-trait.nft-trait)
(use-trait nft-trait .sip009-nft-trait.nft-trait)

(define-non-fungible-token xtrata-inscription uint)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND      (err u101))

(define-map InscriptionMeta uint
  {
    owner: principal,
    creator: principal,
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    sealed: bool,
    final-hash: (buff 32)
  }
)

(define-map TokenURIs uint (string-ascii 256))
(define-map InscriptionDependencies uint (list 50 uint))
(define-map Chunks { context: (buff 32), creator: principal, index: uint } (buff 16384))

(define-private (append-chunk-batch
  (index uint)
  (acc { context: (buff 32), creator: principal, chunks: (list 50 (optional (buff 16384))) })
)
  (let (
    (chunk (map-get? Chunks { context: (get context acc), creator: (get creator acc), index: index }))
    (next (default-to (get chunks acc) (as-max-len? (append (get chunks acc) chunk) u50)))
  )
    { context: (get context acc), creator: (get creator acc), chunks: next }
  )
)

(define-read-only (get-last-token-id) (ok u0))

(define-read-only (get-token-uri (id uint))
  (if (is-some (nft-get-owner? xtrata-inscription id))
    (ok (map-get? TokenURIs id))
    (ok none)
  )
)

(define-read-only (get-token-uri-raw (id uint))
  (map-get? TokenURIs id)
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? xtrata-inscription id))
)

(define-read-only (get-inscription-meta (id uint))
  (map-get? InscriptionMeta id)
)

(define-read-only (get-dependencies (id uint))
  (match (map-get? InscriptionDependencies id) deps deps (list))
)

(define-read-only (get-chunk (id uint) (index uint))
  (match (map-get? InscriptionMeta id)
    meta (map-get? Chunks { context: (get final-hash meta), creator: (get creator meta), index: index })
    none
  )
)

(define-read-only (get-chunk-batch (id uint) (indexes (list 50 uint)))
  (match (map-get? InscriptionMeta id)
    meta
      (let ((acc (fold append-chunk-batch indexes {
        context: (get final-hash meta),
        creator: (get creator meta),
        chunks: (list)
      })))
        (get chunks acc)
      )
    (list)
  )
)

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (some sender) (nft-get-owner? xtrata-inscription id)) ERR-NOT-AUTHORIZED)
    (nft-transfer? xtrata-inscription id sender recipient)
  )
)
