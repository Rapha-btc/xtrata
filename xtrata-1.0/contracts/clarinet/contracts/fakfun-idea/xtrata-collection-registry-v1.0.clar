;; xtrata-collection-registry-v1.0  (Bitcoin Pepe)
;; ---------------------------------------------------------------------------
;; Per-collection escrow vault that binds one Gamma NFT to one permanent
;; on-chain Xtrata inscription, and keeps EXACTLY ONE of the two liquid at a
;; time. Clone this contract per collection (swap the two source constants).
;;
;; SOURCE collection : 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe        (Gamma NFT, off-chain art)
;; MASTER inscriber  : 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3       (on-chain bytes + hash verify)
;;
;; LIFECYCLE for a token (e.g. Bitcoin Pepe #69):
;;
;;   inscribe(#69)            holder of #69 pays the fee, mints the Xtrata
;;                            doppelganger; it is ESCROWED here on mint.
;;                            -> holder keeps #69, registry holds the Xtrata.
;;
;;   swap-pepe-for-xtrata(#69) deposit #69, withdraw the Xtrata.
;;                            -> registry holds #69, holder holds the Xtrata.
;;
;;   swap-xtrata-for-pepe(#69) deposit the Xtrata back, withdraw #69.
;;                            -> registry holds the Xtrata, holder holds #69.
;;
;; INVARIANT: for every bound token, the registry custodies exactly one side
;; of the pair. The pepe and its inscription can never both be liquid at once,
;; so the canonical identity lives in one place at a time.
;;
;; FEES: the holder always pays the master's ~0.1 STX inscription fee directly
;; (mint runs as the holder, then the inscription is pulled into escrow). On
;; top of that the registry charges its own fee, split 50/50 to two payouts:
;;   - the first `free-threshold` inscriptions are FREE (default 69),
;;   - then `inscribe-fee` (default 3 STX),
;;   - unless the payer has a pinned per-address discount (e.g. a big holder).
;; All three knobs are owner-settable.
;;
;; PAUSE NOTE: inscribe calls the master's mint-single-tx with the holder as
;; tx-sender, so from the master's view `contract-caller` is THIS registry. If
;; the master is paused, this registry must be on its AllowedCallers list.
;; ---------------------------------------------------------------------------

(define-constant ERR-NOT-OWNER (err u200)) ;; caller does not own the token in question
(define-constant ERR-ALREADY-INSCRIBED (err u201)) ;; this token already has a binding
(define-constant ERR-NOT-INSCRIBED (err u202)) ;; no binding for this token
(define-constant ERR-WRONG-STATE (err u203)) ;; the side you want is not the side escrowed
(define-constant ERR-NOT-AUTHORIZED (err u204)) ;; not contract owner
(define-constant ERR-BAD-DISCOUNT (err u205)) ;; discount fee must be < inscribe-fee

(define-constant MASTER 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-2-3) ;; xtrata master inscriber
(define-constant SOURCE 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe) ;; this collection (clone: change these two lines)
;; `current-contract` is a Clarity-4 built-in keyword = this contract's own
;; principal (the escrow vault). No definition needed.
(define-data-var contract-owner principal tx-sender)
(define-data-var free-threshold uint u69) ;; first N inscriptions are free
(define-data-var inscribe-fee uint u3000000) ;; 3 STX after the free tier, split 50/50
(define-data-var payout-a principal tx-sender) ;; deployer (our 50%)
(define-data-var payout-b principal 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7) ;; Jim / xtrata (his 50%)
(define-data-var inscribed-count uint u0)

;; Per-address fee override (absolute microSTX). Whitelisted addresses pay this
;; instead of `inscribe-fee` once the free tier is used up. e.g. a big holder
;; like chadstx.btc could be pinned to u1000000 (1 STX).
(define-map Discounts
  principal
  uint
)

;; source-token-id -> binding. Presence means an Xtrata doppelganger exists.
;; `xtrata-escrowed` true  = registry holds the Xtrata, holder holds the pepe.
;; `xtrata-escrowed` false = registry holds the pepe,   holder holds the Xtrata.
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

;; ---------------------------------------------------------------------------
;; Internal
;; ---------------------------------------------------------------------------

;; What `payer` would pay to inscribe right now:
;;   - free for the first `free-threshold` inscriptions (everyone),
;;   - then a per-address discount fee if one is pinned for them,
;;   - otherwise the standard `inscribe-fee`.
;; `inscribed-count` only counts successful inscriptions (bumped after a
;; successful mint), so the free tier is exact.
(define-read-only (fee-for (payer principal))
  (if (< (var-get inscribed-count) (var-get free-threshold))
    u0
    ;; a pinned discount applies, but is CLAMPED to the standard fee so it can
    ;; never become a surcharge if the owner later lowers `inscribe-fee` below it
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

;; Release an escrowed asset OUT of the vault to `recipient`. The transfer runs
;; as the contract (it owns the escrowed token), so we wrap `as-contract?` here
;; and pass the recipient in -- that is why the public swaps don't capture
;; tx-sender. The `with-nft` allowance is an IN-CONTRACT POST CONDITION: the
;; vault is permitted to move ONLY that one token id of that one collection in
;; this call, so a bug can never drain other escrowed NFTs.
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

;; ---------------------------------------------------------------------------
;; Inscribe: owner of the pepe mints its Xtrata doppelganger into escrow
;; ---------------------------------------------------------------------------

(define-public (inscribe
    (token-id uint)
    (expected-hash (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256))
  )
  (begin
    ;; 1. tx-sender must own the bitcoin pepe in question
    (asserts!
      (is-eq (some tx-sender)
        (unwrap! (contract-call? SOURCE get-owner token-id) ERR-NOT-OWNER)
      )
      ERR-NOT-OWNER
    )
    ;; 2. one doppelganger per token
    (asserts! (is-none (map-get? Bindings token-id)) ERR-ALREADY-INSCRIBED)
    ;; 3. registry fee (on top of the master's ~0.1 STX), split 50/50
    (try! (charge-fee tx-sender))
    ;; 4. mint the Xtrata inscription (the caller pays the master fee, mints to them)
    (let (
        (result (try! (contract-call? MASTER mint-single-tx expected-hash mime total-size
          chunks token-uri
        )))
        (xtrata-id (get token-id result))
        (total-inscribed (+ (var-get inscribed-count) u1))
      )
      ;; 5. escrow that fresh inscription inside this registry on mint
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

;; ---------------------------------------------------------------------------
;; Swap: deposit the pepe, withdraw the Xtrata (and back)
;; ---------------------------------------------------------------------------

(define-public (swap-pepe-for-xtrata (token-id uint))
  (let (
      (b (unwrap! (map-get? Bindings token-id) ERR-NOT-INSCRIBED))
      (x-id (get xtrata-id b))
    )
    (asserts! (get xtrata-escrowed b) ERR-WRONG-STATE)
    ;; deposit pepe into escrow (the pepe transfer asserts the caller owns it)
    (try! (contract-call? SOURCE transfer token-id tx-sender current-contract))
    ;; release the escrowed Xtrata to the caller
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
    ;; deposit the Xtrata into escrow (the xtrata transfer asserts the caller owns it)
    (try! (contract-call? MASTER transfer x-id tx-sender current-contract))
    ;; release the escrowed pepe to the caller
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

;; ---------------------------------------------------------------------------
;; Admin
;; ---------------------------------------------------------------------------

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

;; A discount must be a real discount: strictly below the standard fee.
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

;; ---------------------------------------------------------------------------
;; Readers
;; ---------------------------------------------------------------------------

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
