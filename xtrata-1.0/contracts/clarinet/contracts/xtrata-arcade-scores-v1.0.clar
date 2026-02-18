;; xtrata-arcade-scores-v1.0
;;
;; Purpose:
;; - Lightweight on-chain score attestation for arcade games.
;; - Each transaction stores the caller's BEST score per {game-id, mode}.
;; - `mode` values:
;;    u0 => score mode (higher is better)
;;    u1 => time mode  (lower is better)
;;
;; Cost posture:
;; - Single public write call (`submit-score`) with one map update.
;; - No chunking, no NFT minting, no STX fee transfer.

(define-constant ERR-INVALID-MODE    (err u100))
(define-constant ERR-NOT-IMPROVEMENT (err u101))
(define-constant ERR-INVALID-NAME    (err u102))
(define-constant ERR-INVALID-SCORE   (err u103))
(define-constant ERR-NOT-AUTHORIZED  (err u104))

(define-constant MODE-SCORE u0)
(define-constant MODE-TIME  u1)

(define-data-var contract-owner principal tx-sender)

(define-map PlayerBest
  {
    game-id: (string-ascii 32),
    mode: uint,
    player: principal
  }
  {
    name: (string-ascii 12),
    score: uint,
    updated-at: uint
  }
)

(define-private (valid-mode? (mode uint))
  (or (is-eq mode MODE-SCORE) (is-eq mode MODE-TIME))
)

(define-private (is-improved? (mode uint) (new-score uint) (old-score uint))
  (if (is-eq mode MODE-TIME)
    (< new-score old-score)
    (> new-score old-score)
  )
)

(define-public (submit-score
  (game-id (string-ascii 32))
  (mode uint)
  (score uint)
  (player-name (string-ascii 12))
)
  (begin
    (asserts! (valid-mode? mode) ERR-INVALID-MODE)
    (asserts! (> score u0) ERR-INVALID-SCORE)
    (asserts! (>= (len player-name) u3) ERR-INVALID-NAME)

    (match (map-get? PlayerBest { game-id: game-id, mode: mode, player: tx-sender })
      existing
        (begin
          (asserts! (is-improved? mode score (get score existing)) ERR-NOT-IMPROVEMENT)
          (map-set PlayerBest
            { game-id: game-id, mode: mode, player: tx-sender }
            {
              name: player-name,
              score: score,
              updated-at: stacks-block-height
            }
          )
          (print {
            event: "score-submitted",
            game-id: game-id,
            mode: mode,
            player: tx-sender,
            name: player-name,
            score: score,
            improved: true
          })
          (ok true)
        )
      (begin
        (map-set PlayerBest
          { game-id: game-id, mode: mode, player: tx-sender }
          {
            name: player-name,
            score: score,
            updated-at: stacks-block-height
          }
        )
        (print {
          event: "score-submitted",
          game-id: game-id,
          mode: mode,
          player: tx-sender,
          name: player-name,
          score: score,
          improved: false
        })
        (ok true)
      )
    )
  )
)

(define-read-only (get-player-best
  (game-id (string-ascii 32))
  (mode uint)
  (player principal)
)
  (map-get? PlayerBest { game-id: game-id, mode: mode, player: player })
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)
