;; xtrata-backup-registry-v1.0
;; Immutable registry for source NFT token -> Xtrata backup inscription pointers.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-DUPLICATE (err u101))
(define-constant ERR-NOT-FOUND (err u102))
(define-constant ERR-INVALID-URI (err u103))
(define-constant ERR-INVALID-BACKUP (err u104))
(define-constant ERR-PAUSED (err u105))

(define-constant XTRATA-CONTRACT .xtrata-v2-1-0)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool false)

(define-map CollectionEditors
  { source-contract: principal, editor: principal }
  bool
)

(define-map Backups
  { source-contract: principal, source-token-id: uint }
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

(define-private (is-editor (source-contract principal) (editor principal))
  (default-to false (map-get? CollectionEditors {
    source-contract: source-contract,
    editor: editor
  }))
)

(define-private (assert-can-register (source-contract principal))
  (begin
    (asserts!
      (or
        (is-eq tx-sender (var-get contract-owner))
        (is-editor source-contract contract-caller)
      )
      ERR-NOT-AUTHORIZED
    )
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

(define-public (set-collection-editor
  (source-contract principal)
  (editor principal)
  (allowed bool)
)
  (begin
    (try! (assert-owner))
    (map-set CollectionEditors {
      source-contract: source-contract,
      editor: editor
    } allowed)
    (ok true)
  )
)

(define-public (register-backup
  (source-contract principal)
  (source-token-id uint)
  (inscription-id uint)
  (content-hash (buff 32))
  (metadata-uri (string-ascii 256))
  (backup-uri (string-ascii 256))
)
  (begin
    (try! (assert-not-paused))
    (try! (assert-can-register source-contract))
    (asserts! (> (len metadata-uri) u0) ERR-INVALID-URI)
    (asserts! (> (len backup-uri) u0) ERR-INVALID-URI)
    (asserts!
      (is-none (map-get? Backups {
        source-contract: source-contract,
        source-token-id: source-token-id
      }))
      ERR-DUPLICATE
    )
    (asserts!
      (is-eq
        (contract-call? .xtrata-v2-1-0 get-inscription-hash inscription-id)
        (some content-hash)
      )
      ERR-INVALID-BACKUP
    )
    (map-insert Backups
      {
        source-contract: source-contract,
        source-token-id: source-token-id
      }
      {
        xtrata-contract: XTRATA-CONTRACT,
        inscription-id: inscription-id,
        content-hash: content-hash,
        metadata-uri: metadata-uri,
        backup-uri: backup-uri,
        registered-at: stacks-block-height,
        registrar: contract-caller
      }
    )
    (ok true)
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (get-xtrata-contract)
  (ok XTRATA-CONTRACT)
)

(define-read-only (is-collection-editor (source-contract principal) (editor principal))
  (ok (is-editor source-contract editor))
)

(define-read-only (get-backup (source-contract principal) (source-token-id uint))
  (map-get? Backups {
    source-contract: source-contract,
    source-token-id: source-token-id
  })
)

(define-read-only (get-backup-uri (source-contract principal) (source-token-id uint))
  (match (map-get? Backups {
    source-contract: source-contract,
    source-token-id: source-token-id
  })
    backup (some (get backup-uri backup))
    none
  )
)

(define-read-only (has-backup (source-contract principal) (source-token-id uint))
  (ok (is-some (map-get? Backups {
    source-contract: source-contract,
    source-token-id: source-token-id
  })))
)
