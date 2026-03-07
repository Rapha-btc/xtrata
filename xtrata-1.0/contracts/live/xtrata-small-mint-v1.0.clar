;; xtrata-small-mint-v1.0
;;
;; Small-file helper for xtrata-v2.1.0.
;; - Exposes a one-call write path for <= 30 chunks.
;; - Internally runs begin-or-get -> add-chunk-batch -> seal in one transaction.
;; - Returns existing canonical id for duplicate hashes (dedupe short-circuit).
;; - Keeps core xtrata as the canonical inscription contract.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-BATCH (err u102))
(define-constant ERR-INVALID-CORE-CONTRACT (err u103))

(define-constant CHUNK-SIZE u16384)
(define-constant MAX-SMALL-CHUNKS u30)

;; Default core target. Owner can update this for local/testnet/mainnet as needed.
(define-constant DEFAULT-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0)

(define-trait xtrata-trait
  (
    (begin-or-get ((buff 32) (string-ascii 64) uint uint) (response (optional uint) uint))
    (add-chunk-batch ((buff 32) (list 50 (buff 16384))) (response bool uint))
    (seal-inscription ((buff 32) (string-ascii 256)) (response uint uint))
    (seal-recursive ((buff 32) (string-ascii 256) (list 50 uint)) (response uint uint))
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool true)
(define-data-var core-contract principal DEFAULT-XTRATA-CONTRACT)

(define-private (assert-core-contract (xtrata-contract <xtrata-trait>))
  (begin
    (asserts!
      (is-eq (contract-of xtrata-contract) (var-get core-contract))
      ERR-INVALID-CORE-CONTRACT
    )
    (ok true)
  )
)

(define-private (assert-not-paused)
  (begin
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (ok true)
  )
)

(define-private (assert-small-upload-shape (total-size uint) (chunk-count uint))
  (begin
    (asserts! (> chunk-count u0) ERR-INVALID-BATCH)
    (asserts! (<= chunk-count MAX-SMALL-CHUNKS) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* chunk-count CHUNK-SIZE)) ERR-INVALID-BATCH)
    (ok true)
  )
)

(define-private (mint-small-single-tx-internal
  (xtrata-contract <xtrata-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (optional (list 50 uint)))
)
  (let ((chunk-count (len chunks)))
    (begin
      (try! (assert-core-contract xtrata-contract))
      (try! (assert-not-paused))
      (try! (assert-small-upload-shape total-size chunk-count))
      (match (try! (contract-call? xtrata-contract begin-or-get expected-hash mime total-size chunk-count))
        existing-id (ok { token-id: existing-id, existed: true })
        (begin
          (try! (contract-call? xtrata-contract add-chunk-batch expected-hash chunks))
          (match dependencies
            deps
              (let ((new-id (try! (contract-call? xtrata-contract seal-recursive expected-hash token-uri-string deps))))
                (ok { token-id: new-id, existed: false })
              )
            (let ((new-id (try! (contract-call? xtrata-contract seal-inscription expected-hash token-uri-string))))
              (ok { token-id: new-id, existed: false })
            )
          )
        )
      )
    )
  )
)

(define-public (mint-small-single-tx
  (xtrata-contract <xtrata-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
)
  (mint-small-single-tx-internal
    xtrata-contract
    expected-hash
    mime
    total-size
    chunks
    token-uri-string
    none
  )
)

(define-public (mint-small-single-tx-recursive
  (xtrata-contract <xtrata-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
)
  (mint-small-single-tx-internal
    xtrata-contract
    expected-hash
    mime
    total-size
    chunks
    token-uri-string
    (some dependencies)
  )
)

(define-public (set-paused (value bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set paused value)
    (ok true)
  )
)

(define-public (set-core-contract (new-core principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set core-contract new-core)
    (ok true)
  )
)

(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (get-core-contract)
  (ok (var-get core-contract))
)

(define-read-only (get-max-small-chunks)
  (ok MAX-SMALL-CHUNKS)
)
