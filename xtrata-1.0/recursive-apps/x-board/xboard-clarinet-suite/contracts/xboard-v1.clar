;; Xboard v1 Clarity contract draft
;; Purpose: simple permanent tile ownership + programme registry for 93 Xboard tiles.
;; Status: first implementation draft. Run through Clarinet tests and external review before testnet/mainnet.

;; -----------------------------------------------------------------------------
;; Constants and errors
;; -----------------------------------------------------------------------------

(define-constant CONTRACT-OWNER tx-sender)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-TILE (err u101))
(define-constant ERR-INVALID-PROGRAM (err u102))
(define-constant ERR-PROGRAM-TILE-MISMATCH (err u103))
(define-constant ERR-BID-TOO-LOW (err u104))
(define-constant ERR-NOT-OWNER (err u105))
(define-constant ERR-TRANSFER-FAILED (err u106))
(define-constant ERR-PAUSED (err u107))
(define-constant ERR-INVALID-AMOUNT (err u108))
(define-constant ERR-INVALID-PAGE (err u109))

(define-constant MAX-TILE-ID u92)
(define-constant MIN-INITIAL-BID u1000000) ;; 1 STX, in microSTX
(define-constant FEE-BPS u100)             ;; 1%
(define-constant MIN-OUTBID-BPS u100)      ;; next bid must be current gross bid + 1%
(define-constant BPS-DENOMINATOR u10000)
(define-constant MAX-PROGRAM-LEN u96)
(define-constant PROGRAM-PREFIX-LEN u9)    ;; B1 + 2-char slot + mode + font + size + position + colour
(define-constant MAX-INSCRIPTION-DIGITS u12)
(define-constant WIRE-ALPHABET "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
(define-constant WIRE-BASE u62)
(define-constant TILE-PAGE-SIZE u10)

;; -----------------------------------------------------------------------------
;; State
;; -----------------------------------------------------------------------------

(define-map tiles
  { tile-id: uint }
  {
    owner: (optional principal),
    gross-bid: uint,
    locked: uint,
    program: (string-ascii 96),
    updated-at: uint,
    claimed-at: uint
  }
)

(define-data-var protocol-fees uint u0)
(define-data-var total-locked uint u0)
(define-data-var paused bool false)

;; -----------------------------------------------------------------------------
;; Small helpers
;; -----------------------------------------------------------------------------

(define-private (is-valid-tile (tile-id uint))
  (<= tile-id MAX-TILE-ID)
)

(define-private (is-direct-caller)
  (is-eq tx-sender contract-caller)
)

(define-private (is-standard-principal (who principal))
  (match (principal-destruct? who)
    decoded (is-none (get name decoded))
    error-code false
  )
)

(define-private (fee-for (bid uint))
  (/ (* bid FEE-BPS) BPS-DENOMINATOR)
)

(define-private (locked-for (bid uint))
  (- bid (fee-for bid))
)

(define-private (ceil-bps (amount uint) (bps uint))
  (/ (+ (* amount bps) (- BPS-DENOMINATOR u1)) BPS-DENOMINATOR)
)

(define-private (required-bid-from-gross (gross-bid uint))
  (if (is-eq gross-bid u0)
    MIN-INITIAL-BID
    (+ gross-bid (ceil-bps gross-bid MIN-OUTBID-BPS))
  )
)

(define-private (get-tile-or-empty (tile-id uint))
  (default-to
    {
      owner: none,
      gross-bid: u0,
      locked: u0,
      program: (clear-program tile-id),
      updated-at: u0,
      claimed-at: u0
    }
    (map-get? tiles { tile-id: tile-id })
  )
)

;; Base62 two-character wire code for tile ids u0..u92.
;; UI public ids such as C01, M12 and S80 stay off-chain.
(define-private (wire-char (index uint))
  (unwrap-panic
    (as-max-len?
      (unwrap-panic (slice? WIRE-ALPHABET index (+ index u1)))
      u1
    )
  )
)

(define-private (wire-code-for-tile (tile-id uint))
  (if (is-valid-tile tile-id)
    (concat
      (wire-char (/ tile-id WIRE-BASE))
      (wire-char (mod tile-id WIRE-BASE))
    )
    "??"
  )
)

(define-private (clear-program (tile-id uint))
  (concat (concat "B1" (wire-code-for-tile tile-id)) "X0000")
)

(define-private (tile-page-entry (tile-id uint))
  {
    tile-id: tile-id,
    tile: (if (is-valid-tile tile-id)
      (some (get-tile-or-empty tile-id))
      none
    )
  }
)

;; Programme format:
;; B1 + slot + mode + font + size + position + colour + payload
;; Example: B100T1324HELLO
;; B1: protocol/version
;; 00: two-char wire code
;; T: mode: T text, I inscription, X clear
;; 1: font option, fixed UI palette
;; 3: size option, fixed UI palette
;; 2: position option, fixed UI palette
;; 4: colour option, fixed UI palette
;; HELLO: payload

(define-private (has-valid-header (tile-id uint) (program (string-ascii 96)))
  (and
    (is-eq (slice? program u0 u2) (some "B1"))
    (is-eq (slice? program u2 u4) (some (wire-code-for-tile tile-id)))
  )
)

(define-private (valid-mode? (program (string-ascii 96)))
  (or
    (is-eq (slice? program u4 u5) (some "T"))
    (is-eq (slice? program u4 u5) (some "I"))
    (is-eq (slice? program u4 u5) (some "X"))
  )
)

(define-private (valid-font? (program (string-ascii 96)))
  (or
    (is-eq (slice? program u5 u6) (some "0"))
    (is-eq (slice? program u5 u6) (some "1"))
    (is-eq (slice? program u5 u6) (some "2"))
    (is-eq (slice? program u5 u6) (some "3"))
    (is-eq (slice? program u5 u6) (some "4"))
  )
)

(define-private (valid-size? (program (string-ascii 96)))
  (or
    (is-eq (slice? program u6 u7) (some "0"))
    (is-eq (slice? program u6 u7) (some "1"))
    (is-eq (slice? program u6 u7) (some "2"))
    (is-eq (slice? program u6 u7) (some "3"))
    (is-eq (slice? program u6 u7) (some "4"))
  )
)

(define-private (valid-position? (program (string-ascii 96)))
  (or
    (is-eq (slice? program u7 u8) (some "0"))
    (is-eq (slice? program u7 u8) (some "1"))
    (is-eq (slice? program u7 u8) (some "2"))
    (is-eq (slice? program u7 u8) (some "3"))
    (is-eq (slice? program u7 u8) (some "4"))
    (is-eq (slice? program u7 u8) (some "5"))
    (is-eq (slice? program u7 u8) (some "6"))
    (is-eq (slice? program u7 u8) (some "7"))
    (is-eq (slice? program u7 u8) (some "8"))
  )
)

(define-private (valid-colour? (program (string-ascii 96)))
  (or
    (is-eq (slice? program u8 u9) (some "0"))
    (is-eq (slice? program u8 u9) (some "1"))
    (is-eq (slice? program u8 u9) (some "2"))
    (is-eq (slice? program u8 u9) (some "3"))
    (is-eq (slice? program u8 u9) (some "4"))
    (is-eq (slice? program u8 u9) (some "5"))
    (is-eq (slice? program u8 u9) (some "6"))
    (is-eq (slice? program u8 u9) (some "7"))
    (is-eq (slice? program u8 u9) (some "8"))
    (is-eq (slice? program u8 u9) (some "9"))
  )
)

(define-private (is-inscription-payload? (payload (string-ascii 96)))
  ;; Relies on Clarity's string-to-uint? parser to reject non-decimal strings.
  ;; Clarinet tests must cover: "159" accepted; "abc", "1a", "", and overlong strings rejected.
  (and
    (> (len payload) u0)
    (<= (len payload) MAX-INSCRIPTION-DIGITS)
    (is-some (string-to-uint? payload))
  )
)

(define-private (has-valid-payload (program (string-ascii 96)))
  (let
    (
      (mode (unwrap! (slice? program u4 u5) false))
      (payload-len (- (len program) PROGRAM-PREFIX-LEN))
    )
    (if (is-eq mode "X")
      (is-eq (len program) PROGRAM-PREFIX-LEN)
      (let
        (
          (payload (unwrap! (slice? program PROGRAM-PREFIX-LEN (len program)) false))
        )
        (if (is-eq mode "T")
          (> payload-len u0)
          (if (is-eq mode "I")
            (is-inscription-payload? payload)
            false
          )
        )
      )
    )
  )
)

(define-private (is-valid-program-internal (tile-id uint) (program (string-ascii 96)))
  (and
    (is-valid-tile tile-id)
    (>= (len program) PROGRAM-PREFIX-LEN)
    (<= (len program) MAX-PROGRAM-LEN)
    (has-valid-header tile-id program)
    (valid-mode? program)
    (valid-font? program)
    (valid-size? program)
    (valid-position? program)
    (valid-colour? program)
    (has-valid-payload program)
  )
)

;; -----------------------------------------------------------------------------
;; Read-only functions
;; -----------------------------------------------------------------------------

(define-read-only (get-tile (tile-id uint))
  (if (is-valid-tile tile-id)
    (ok (get-tile-or-empty tile-id))
    ERR-INVALID-TILE
  )
)

(define-read-only (get-owner (tile-id uint))
  (if (is-valid-tile tile-id)
    (ok (get owner (get-tile-or-empty tile-id)))
    ERR-INVALID-TILE
  )
)

(define-read-only (get-required-bid (tile-id uint))
  (if (is-valid-tile tile-id)
    (ok (required-bid-from-gross (get gross-bid (get-tile-or-empty tile-id))))
    ERR-INVALID-TILE
  )
)

(define-read-only (can-program (tile-id uint) (who principal))
  (if (is-valid-tile tile-id)
    (ok (is-eq (get owner (get-tile-or-empty tile-id)) (some who)))
    ERR-INVALID-TILE
  )
)

(define-read-only (is-valid-program (tile-id uint) (program (string-ascii 96)))
  (ok (is-valid-program-internal tile-id program))
)

(define-read-only (get-contract-stats)
  (ok {
    protocol-fees: (var-get protocol-fees),
    total-locked: (var-get total-locked),
    paused: (var-get paused)
  })
)

(define-read-only (get-tile-page (start uint) (limit uint))
  (if
    (and
      (is-valid-tile start)
      (> limit u0)
      (<= limit TILE-PAGE-SIZE)
    )
    (ok
      (unwrap-panic
        (slice?
          (list
            (tile-page-entry (+ start u0))
            (tile-page-entry (+ start u1))
            (tile-page-entry (+ start u2))
            (tile-page-entry (+ start u3))
            (tile-page-entry (+ start u4))
            (tile-page-entry (+ start u5))
            (tile-page-entry (+ start u6))
            (tile-page-entry (+ start u7))
            (tile-page-entry (+ start u8))
            (tile-page-entry (+ start u9))
          )
          u0
          limit
        )
      )
    )
    ERR-INVALID-PAGE
  )
)

;; -----------------------------------------------------------------------------
;; Public functions
;; -----------------------------------------------------------------------------

(define-public (claim-tile (tile-id uint) (bid uint) (program (string-ascii 96)))
  (let
    (
      (tile (get-tile-or-empty tile-id))
      (required-bid (required-bid-from-gross (get gross-bid tile)))
      (protocol-fee (fee-for bid))
      (new-locked (locked-for bid))
      (previous-owner (get owner tile))
      (previous-locked (get locked tile))
    )
    (asserts! (is-direct-caller) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-valid-tile tile-id) ERR-INVALID-TILE)
    (asserts! (is-valid-program-internal tile-id program) ERR-INVALID-PROGRAM)
    (asserts! (>= bid required-bid) ERR-BID-TOO-LOW)
    (asserts! (> new-locked u0) ERR-INVALID-AMOUNT)

    ;; Pull the full gross bid into this contract.
    (try! (stx-transfer? bid tx-sender (as-contract tx-sender)))

    ;; Refund the previous owner if the tile was occupied.
    (match previous-owner previous-principal
      (try! (as-contract (stx-transfer? previous-locked tx-sender previous-principal)))
      true
    )

    (var-set protocol-fees (+ (var-get protocol-fees) protocol-fee))
    (var-set total-locked (+ (- (var-get total-locked) previous-locked) new-locked))

    (map-set tiles
      { tile-id: tile-id }
      {
        owner: (some tx-sender),
        gross-bid: bid,
        locked: new-locked,
        program: program,
        updated-at: block-height,
        claimed-at: block-height
      }
    )

    (print {
      event: "claim",
      tile-id: tile-id,
      new-owner: tx-sender,
      gross-bid: bid,
      locked: new-locked,
      protocol-fee: protocol-fee,
      previous-owner: previous-owner,
      previous-refund: previous-locked,
      program: program,
      block-height: block-height
    })

    (ok true)
  )
)

(define-public (program-tile (tile-id uint) (program (string-ascii 96)))
  (let
    (
      (tile (get-tile-or-empty tile-id))
    )
    (asserts! (is-direct-caller) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-valid-tile tile-id) ERR-INVALID-TILE)
    (asserts! (is-eq (get owner tile) (some tx-sender)) ERR-NOT-OWNER)
    (asserts! (is-valid-program-internal tile-id program) ERR-INVALID-PROGRAM)

    (map-set tiles
      { tile-id: tile-id }
      (merge tile {
        program: program,
        updated-at: block-height
      })
    )

    (print {
      event: "program",
      tile-id: tile-id,
      owner: tx-sender,
      program: program,
      block-height: block-height
    })

    (ok true)
  )
)

(define-public (release-tile (tile-id uint))
  (let
    (
      (caller tx-sender)
      (tile (get-tile-or-empty tile-id))
      (locked (get locked tile))
    )
    (asserts! (is-direct-caller) ERR-NOT-AUTHORIZED)
    (asserts! (is-valid-tile tile-id) ERR-INVALID-TILE)
    (asserts! (is-eq (get owner tile) (some tx-sender)) ERR-NOT-OWNER)
    (asserts! (> locked u0) ERR-INVALID-AMOUNT)

    ;; Return only the locked balance. The original 1% entry fee is not refunded.
    (try! (as-contract (stx-transfer? locked tx-sender caller)))

    (var-set total-locked (- (var-get total-locked) locked))

    (map-set tiles
      { tile-id: tile-id }
      {
        owner: none,
        gross-bid: u0,
        locked: u0,
        program: (clear-program tile-id),
        updated-at: block-height,
        claimed-at: u0
      }
    )

    (print {
      event: "release",
      tile-id: tile-id,
      owner: caller,
      refunded: locked,
      program: (clear-program tile-id),
      block-height: block-height
    })

    (ok true)
  )
)

(define-public (withdraw-fees (amount uint) (recipient principal))
  (begin
    (asserts! (is-direct-caller) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (<= amount (var-get protocol-fees)) ERR-INVALID-AMOUNT)
    (asserts! (is-standard-principal recipient) ERR-NOT-AUTHORIZED)

    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (var-set protocol-fees (- (var-get protocol-fees) amount))

    (print {
      event: "withdraw-fees",
      amount: amount,
      recipient: recipient,
      block-height: block-height
    })

    (ok true)
  )
)

(define-public (set-paused (value bool))
  (begin
    (asserts! (is-direct-caller) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set paused value)
    (print {
      event: "set-paused",
      value: value,
      block-height: block-height
    })
    (ok true)
  )
)
