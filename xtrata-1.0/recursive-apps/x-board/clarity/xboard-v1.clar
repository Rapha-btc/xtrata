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

(define-constant MAX-TILE-ID u92)
(define-constant MIN-INITIAL-BID u1000000) ;; 1 STX, in microSTX
(define-constant FEE-BPS u100)             ;; 1%
(define-constant MIN-OUTBID-BPS u100)      ;; next bid must be current gross bid + 1%
(define-constant BPS-DENOMINATOR u10000)
(define-constant MAX-PROGRAM-LEN u96)
(define-constant PROGRAM-PREFIX-LEN u9)    ;; B1 + 2-char slot + mode + font + size + position + colour
(define-constant MAX-INSCRIPTION-DIGITS u12)

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
(define-private (wire-code-for-tile (tile-id uint))
  (if (is-eq tile-id u0) "00"
  (if (is-eq tile-id u1) "01"
  (if (is-eq tile-id u2) "02"
  (if (is-eq tile-id u3) "03"
  (if (is-eq tile-id u4) "04"
  (if (is-eq tile-id u5) "05"
  (if (is-eq tile-id u6) "06"
  (if (is-eq tile-id u7) "07"
  (if (is-eq tile-id u8) "08"
  (if (is-eq tile-id u9) "09"
  (if (is-eq tile-id u10) "0A"
  (if (is-eq tile-id u11) "0B"
  (if (is-eq tile-id u12) "0C"
  (if (is-eq tile-id u13) "0D"
  (if (is-eq tile-id u14) "0E"
  (if (is-eq tile-id u15) "0F"
  (if (is-eq tile-id u16) "0G"
  (if (is-eq tile-id u17) "0H"
  (if (is-eq tile-id u18) "0I"
  (if (is-eq tile-id u19) "0J"
  (if (is-eq tile-id u20) "0K"
  (if (is-eq tile-id u21) "0L"
  (if (is-eq tile-id u22) "0M"
  (if (is-eq tile-id u23) "0N"
  (if (is-eq tile-id u24) "0O"
  (if (is-eq tile-id u25) "0P"
  (if (is-eq tile-id u26) "0Q"
  (if (is-eq tile-id u27) "0R"
  (if (is-eq tile-id u28) "0S"
  (if (is-eq tile-id u29) "0T"
  (if (is-eq tile-id u30) "0U"
  (if (is-eq tile-id u31) "0V"
  (if (is-eq tile-id u32) "0W"
  (if (is-eq tile-id u33) "0X"
  (if (is-eq tile-id u34) "0Y"
  (if (is-eq tile-id u35) "0Z"
  (if (is-eq tile-id u36) "0a"
  (if (is-eq tile-id u37) "0b"
  (if (is-eq tile-id u38) "0c"
  (if (is-eq tile-id u39) "0d"
  (if (is-eq tile-id u40) "0e"
  (if (is-eq tile-id u41) "0f"
  (if (is-eq tile-id u42) "0g"
  (if (is-eq tile-id u43) "0h"
  (if (is-eq tile-id u44) "0i"
  (if (is-eq tile-id u45) "0j"
  (if (is-eq tile-id u46) "0k"
  (if (is-eq tile-id u47) "0l"
  (if (is-eq tile-id u48) "0m"
  (if (is-eq tile-id u49) "0n"
  (if (is-eq tile-id u50) "0o"
  (if (is-eq tile-id u51) "0p"
  (if (is-eq tile-id u52) "0q"
  (if (is-eq tile-id u53) "0r"
  (if (is-eq tile-id u54) "0s"
  (if (is-eq tile-id u55) "0t"
  (if (is-eq tile-id u56) "0u"
  (if (is-eq tile-id u57) "0v"
  (if (is-eq tile-id u58) "0w"
  (if (is-eq tile-id u59) "0x"
  (if (is-eq tile-id u60) "0y"
  (if (is-eq tile-id u61) "0z"
  (if (is-eq tile-id u62) "10"
  (if (is-eq tile-id u63) "11"
  (if (is-eq tile-id u64) "12"
  (if (is-eq tile-id u65) "13"
  (if (is-eq tile-id u66) "14"
  (if (is-eq tile-id u67) "15"
  (if (is-eq tile-id u68) "16"
  (if (is-eq tile-id u69) "17"
  (if (is-eq tile-id u70) "18"
  (if (is-eq tile-id u71) "19"
  (if (is-eq tile-id u72) "1A"
  (if (is-eq tile-id u73) "1B"
  (if (is-eq tile-id u74) "1C"
  (if (is-eq tile-id u75) "1D"
  (if (is-eq tile-id u76) "1E"
  (if (is-eq tile-id u77) "1F"
  (if (is-eq tile-id u78) "1G"
  (if (is-eq tile-id u79) "1H"
  (if (is-eq tile-id u80) "1I"
  (if (is-eq tile-id u81) "1J"
  (if (is-eq tile-id u82) "1K"
  (if (is-eq tile-id u83) "1L"
  (if (is-eq tile-id u84) "1M"
  (if (is-eq tile-id u85) "1N"
  (if (is-eq tile-id u86) "1O"
  (if (is-eq tile-id u87) "1P"
  (if (is-eq tile-id u88) "1Q"
  (if (is-eq tile-id u89) "1R"
  (if (is-eq tile-id u90) "1S"
  (if (is-eq tile-id u91) "1T"
  (if (is-eq tile-id u92) "1U"
    "??")))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))))
)

(define-private (clear-program (tile-id uint))
  (concat (concat "B1" (wire-code-for-tile tile-id)) "X0000")
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

(define-private (is-inscription-payload? (payload (string-ascii 87)))
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
      (payload (unwrap! (slice? program PROGRAM-PREFIX-LEN MAX-PROGRAM-LEN) false))
      (payload-len (- (len program) PROGRAM-PREFIX-LEN))
    )
    (if (is-eq mode "X")
      (is-eq (len program) PROGRAM-PREFIX-LEN)
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
      (tile (get-tile-or-empty tile-id))
      (locked (get locked tile))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-valid-tile tile-id) ERR-INVALID-TILE)
    (asserts! (is-eq (get owner tile) (some tx-sender)) ERR-NOT-OWNER)
    (asserts! (> locked u0) ERR-INVALID-AMOUNT)

    ;; Return only the locked balance. The original 1% entry fee is not refunded.
    (try! (as-contract (stx-transfer? locked tx-sender tx-sender)))

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
      owner: tx-sender,
      refunded: locked,
      program: (clear-program tile-id),
      block-height: block-height
    })

    (ok true)
  )
)

(define-public (withdraw-fees (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (<= amount (var-get protocol-fees)) ERR-INVALID-AMOUNT)

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
