;; xtrata-small-mint-v1.1
;;
;; Small-file helper for xtrata-v3.2.1.
;; - Exposes a one-call small-file route for <= 32 chunks.
;; - Uses the v3.2.1 list-32 upload ABI.
;; - Calls the v3.2.1 native single-tx mint route so the core charges the
;;   single-call fee once, rather than staged begin + seal fees.
;; - Hash lookup in v3.2.1 is advisory only; duplicate hashes can mint new token IDs.
;;
;; Notes:
;; - This helper intentionally does not call begin-or-get/add-chunk-batch/seal.
;;   Doing so would use the staged route and staged fee model.
;; - This helper is a wrapper around the core single-tx path.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-BATCH (err u102))
(define-constant ERR-INVALID-CORE-CONTRACT (err u103))

(define-constant CHUNK-SIZE u16384)
(define-constant MAX-SMALL-CHUNKS u32)

;; Default core target. Owner can update this for local/testnet/mainnet as needed.
(define-constant DEFAULT-XTRATA-CONTRACT 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-1)

(define-trait xtrata-v3-2-1-trait
  (
    (mint-single-tx
      (
        (buff 32)
        (string-ascii 64)
        uint
        (list 32 (buff 16384))
        (string-ascii 256)
      )
      (response { token-id: uint, existed: bool } uint)
    )
    (mint-single-tx-recursive
      (
        (buff 32)
        (string-ascii 64)
        uint
        (list 32 (buff 16384))
        (string-ascii 256)
        (list 50 uint)
      )
      (response { token-id: uint, existed: bool } uint)
    )
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool true)
(define-data-var core-contract principal DEFAULT-XTRATA-CONTRACT)

(define-private (assert-core-contract (xtrata-contract <xtrata-v3-2-1-trait>))
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
    (asserts! (> total-size u0) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* chunk-count CHUNK-SIZE)) ERR-INVALID-BATCH)
    (asserts! (> total-size (* (- chunk-count u1) CHUNK-SIZE)) ERR-INVALID-BATCH)
    (ok true)
  )
)

(define-private (mint-small-single-tx-internal
  (xtrata-contract <xtrata-v3-2-1-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (optional (list 50 uint)))
)
  (let ((chunk-count (len chunks)))
    (begin
      (try! (assert-core-contract xtrata-contract))
      (try! (assert-not-paused))
      (try! (assert-small-upload-shape total-size chunk-count))
      (match dependencies
        deps
          (contract-call?
            xtrata-contract
            mint-single-tx-recursive
            expected-hash
            mime
            total-size
            chunks
            token-uri-string
            deps
          )
        (contract-call?
          xtrata-contract
          mint-single-tx
          expected-hash
          mime
          total-size
          chunks
          token-uri-string
        )
      )
    )
  )
)

(define-public (mint-small-single-tx
  (xtrata-contract <xtrata-v3-2-1-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
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
  (xtrata-contract <xtrata-v3-2-1-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
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
