(define-constant ERR-NOT-OWNER (err u200))
(define-constant ERR-ALREADY-INSCRIBED (err u201))
(define-constant ERR-NOT-INSCRIBED (err u202))
(define-constant ERR-WRONG-STATE (err u203))
(define-constant ERR-NOT-AUTHORIZED (err u204))
(define-constant ERR-BAD-DISCOUNT (err u205))

(define-constant MASTER 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3)
(define-constant SOURCE 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe)
(define-data-var contract-owner principal tx-sender)
(define-data-var free-threshold uint u69)
(define-data-var inscribe-fee uint u3000000)
(define-data-var payout-a principal tx-sender)
(define-data-var payout-b principal 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7)
(define-data-var inscribed-count uint u0)

(define-map Discounts
  principal
  uint
)

(define-map Bindings
  uint
  {
    xtrata-id: uint,
    content-hash: (buff 32),
    inscriber: principal,
    xtrata-escrowed: bool,
    at: uint,
  }
)

(define-read-only (fee-for (payer principal))
  (if (< (var-get inscribed-count) (var-get free-threshold))
    u0
    (let ((standard (var-get inscribe-fee)))
      (match (map-get? Discounts payer)
        d (if (< d standard) d standard)
        standard
      )
    )
  )
)

(define-private (charge-fee (payer principal))
  (let ((fee (fee-for payer)))
    (if (> fee u0)
      (let ((half (/ fee u2)))
        (begin
          (try! (stx-transfer? half payer (var-get payout-a)))
          (try! (stx-transfer? (- fee half) payer (var-get payout-b)))
          (ok true)
        )
      )
      (ok true)
    )
  )
)

(define-private (release-xtrata-to
    (id uint)
    (recipient principal)
  )
  (as-contract? ((with-nft MASTER "xtrata-inscription" (list id)))
    (try! (contract-call? MASTER transfer id current-contract recipient))
  )
)

(define-private (release-pepe-to
    (id uint)
    (recipient principal)
  )
  (as-contract? ((with-nft SOURCE "bitcoin-pepe" (list id)))
    (try! (contract-call? SOURCE transfer id current-contract recipient))
  )
)

(define-public (inscribe
    (token-id uint)
    (expected-hash (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256))
  )
  (begin
    (asserts!
      (is-eq (some tx-sender)
        (unwrap! (contract-call? SOURCE get-owner token-id) ERR-NOT-OWNER)
      )
      ERR-NOT-OWNER
    )
    (asserts! (is-none (map-get? Bindings token-id)) ERR-ALREADY-INSCRIBED)
    (try! (charge-fee tx-sender))
    (let (
        (result (try! (contract-call? MASTER mint-single-tx expected-hash mime total-size
          chunks token-uri
        )))
        (xtrata-id (get token-id result))
        (total-inscribed (+ (var-get inscribed-count) u1))
      )
      (try! (contract-call? MASTER transfer xtrata-id tx-sender current-contract))
      (map-insert Bindings token-id {
        xtrata-id: xtrata-id,
        content-hash: expected-hash,
        inscriber: tx-sender,
        xtrata-escrowed: true,
        at: stacks-block-height,
      })
      (var-set inscribed-count total-inscribed)
      (print {
        event: "inscribed",
        token-id: token-id,
        xtrata-id: xtrata-id,
        content-hash: expected-hash,
        inscriber: tx-sender,
        inscribed-count: total-inscribed,
      })
      (ok xtrata-id)
    )
  )
)

(define-public (swap-pepe-for-xtrata (token-id uint))
  (let (
      (b (unwrap! (map-get? Bindings token-id) ERR-NOT-INSCRIBED))
      (x-id (get xtrata-id b))
    )
    (asserts! (get xtrata-escrowed b) ERR-WRONG-STATE)
    (try! (contract-call? SOURCE transfer token-id tx-sender current-contract))
    (try! (release-xtrata-to x-id tx-sender))
    (map-set Bindings token-id (merge b { xtrata-escrowed: false }))
    (print {
      event: "swap-pepe-for-xtrata",
      token-id: token-id,
      xtrata-id: x-id,
      holder: tx-sender,
    })
    (ok true)
  )
)

(define-public (swap-xtrata-for-pepe (token-id uint))
  (let (
      (b (unwrap! (map-get? Bindings token-id) ERR-NOT-INSCRIBED))
      (x-id (get xtrata-id b))
    )
    (asserts! (not (get xtrata-escrowed b)) ERR-WRONG-STATE)
    (try! (contract-call? MASTER transfer x-id tx-sender current-contract))
    (try! (release-pepe-to token-id tx-sender))
    (map-set Bindings token-id (merge b { xtrata-escrowed: true }))
    (print {
      event: "swap-xtrata-for-pepe",
      token-id: token-id,
      xtrata-id: x-id,
      holder: tx-sender,
    })
    (ok true)
  )
)

(define-private (assert-owner)
  (ok (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED))
)

(define-public (set-fee (new-fee uint))
  (begin
    (try! (assert-owner))
    (var-set inscribe-fee new-fee)
    (ok true)
  )
)

(define-public (set-free-threshold (n uint))
  (begin
    (try! (assert-owner))
    (var-set free-threshold n)
    (ok true)
  )
)

(define-public (set-discount
    (who principal)
    (fee uint)
  )
  (begin
    (try! (assert-owner))
    (asserts! (< fee (var-get inscribe-fee)) ERR-BAD-DISCOUNT)
    (map-set Discounts who fee)
    (ok true)
  )
)

(define-public (remove-discount (who principal))
  (begin
    (try! (assert-owner))
    (map-delete Discounts who)
    (ok true)
  )
)

(define-public (set-payouts
    (a principal)
    (bb principal)
  )
  (begin
    (try! (assert-owner))
    (var-set payout-a a)
    (var-set payout-b bb)
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (assert-owner))
    (var-set contract-owner new-owner)
    (ok true)
  )
)

(define-read-only (get-binding (token-id uint))
  (map-get? Bindings token-id)
)

(define-read-only (is-inscribed (token-id uint))
  (ok (is-some (map-get? Bindings token-id)))
)

(define-read-only (get-fee)
  (ok (var-get inscribe-fee))
)

(define-read-only (get-free-threshold)
  (ok (var-get free-threshold))
)

(define-read-only (get-discount (who principal))
  (map-get? Discounts who)
)

(define-read-only (get-payouts)
  (ok {
    a: (var-get payout-a),
    b: (var-get payout-b),
  })
)

(define-read-only (get-inscribed-count)
  (ok (var-get inscribed-count))
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)
