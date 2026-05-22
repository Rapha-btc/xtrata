;; xtrata-migrated-ipfs-collection-v1.0
;; Prototype migrated SIP-009 collection that preserves source token URIs and
;; exposes Xtrata backup pointers.

(impl-trait .sip009-nft-trait.nft-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-MIGRATED (err u102))
(define-constant ERR-NOT-BACKED-UP (err u103))

(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))
(define-constant SOURCE-COLLECTION .mock-ipfs-collection)
(define-constant BACKUP-REGISTRY .xtrata-backup-registry-v1-0)

(define-non-fungible-token migrated-ipfs-token uint)

(define-data-var collection-name (string-ascii 64) "Migrated IPFS Collection")
(define-data-var collection-symbol (string-ascii 16) "MIPFS")
(define-data-var max-token-id uint u0)
(define-data-var migrated-count uint u0)

(define-map TokenURIs uint (string-ascii 256))
(define-map MigratedIndex uint uint)
(define-map BackupPointers
  uint
  {
    xtrata-contract: principal,
    inscription-id: uint,
    content-hash: (buff 32),
    metadata-uri: (string-ascii 256),
    backup-uri: (string-ascii 256),
    registered-at: uint,
    registrar: principal
  }
)

(define-private (record-migration (id uint))
  (let (
    (count (var-get migrated-count))
    (current-max (var-get max-token-id))
  )
    (begin
      (map-set MigratedIndex count id)
      (var-set migrated-count (+ count u1))
      (if (> id current-max)
        (var-set max-token-id id)
        true
      )
      id
    )
  )
)

(define-public (migrate (token-id uint))
  (let (
    (source-owner (unwrap! (contract-call? .mock-ipfs-collection get-owner token-id) ERR-NOT-FOUND))
    (source-uri (unwrap! (contract-call? .mock-ipfs-collection get-token-uri token-id) ERR-NOT-FOUND))
    (backup (unwrap! (contract-call? .xtrata-backup-registry-v1-0 get-backup SOURCE-COLLECTION token-id) ERR-NOT-BACKED-UP))
  )
    (begin
      (asserts! (is-none (nft-get-owner? migrated-ipfs-token token-id)) ERR-ALREADY-MIGRATED)
      (asserts! (is-eq source-owner (some tx-sender)) ERR-NOT-AUTHORIZED)
      (try! (contract-call? .mock-ipfs-collection transfer token-id tx-sender CONTRACT-PRINCIPAL))
      (try! (nft-mint? migrated-ipfs-token token-id tx-sender))
      (match source-uri
        uri (map-set TokenURIs token-id uri)
        true
      )
      (map-set BackupPointers token-id backup)
      (record-migration token-id)
      (ok token-id)
    )
  )
)

(define-read-only (get-last-token-id)
  (ok (var-get max-token-id))
)

(define-read-only (get-token-uri (id uint))
  (if (is-some (nft-get-owner? migrated-ipfs-token id))
    (ok (map-get? TokenURIs id))
    (ok none)
  )
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? migrated-ipfs-token id))
)

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (some sender) (nft-get-owner? migrated-ipfs-token id)) ERR-NOT-AUTHORIZED)
    (try! (nft-transfer? migrated-ipfs-token id sender recipient))
    (ok true)
  )
)

(define-read-only (get-collection-metadata)
  (ok {
    name: (var-get collection-name),
    symbol: (var-get collection-symbol)
  })
)

(define-read-only (get-source-contract)
  (ok SOURCE-COLLECTION)
)

(define-read-only (get-backup-registry)
  (ok BACKUP-REGISTRY)
)

(define-read-only (is-migrated (token-id uint))
  (ok (is-some (nft-get-owner? migrated-ipfs-token token-id)))
)

(define-read-only (get-migrated-count)
  (ok (var-get migrated-count))
)

(define-read-only (get-migrated-id (index uint))
  (map-get? MigratedIndex index)
)

(define-read-only (get-backup (token-id uint))
  (if (is-some (nft-get-owner? migrated-ipfs-token token-id))
    (map-get? BackupPointers token-id)
    none
  )
)

(define-read-only (get-backup-uri (token-id uint))
  (match (map-get? BackupPointers token-id)
    backup (some (get backup-uri backup))
    none
  )
)
