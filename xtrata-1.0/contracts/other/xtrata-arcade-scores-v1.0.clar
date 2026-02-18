;; xtrata-arcade-scores-v1.0
;;
;; Purpose:
;; - Lightweight on-chain arcade leaderboard + score attestation.
;; - Maintains a ranked top-10 board per {game-id, mode}.
;; - Persists each caller's BEST verified score per {game-id, mode}.
;; - `mode` values:
;;    u0 => score mode (higher is better)
;;    u1 => time mode  (lower is better)
;;
;; Cost posture:
;; - Single public write call (`submit-score`) with bounded map operations.
;; - No chunking, NFT minting, or STX fee transfer.

(define-constant ERR-INVALID-MODE    (err u100))
(define-constant ERR-NOT-IMPROVEMENT (err u101))
(define-constant ERR-INVALID-NAME    (err u102))
(define-constant ERR-INVALID-SCORE   (err u103))
(define-constant ERR-NOT-AUTHORIZED  (err u104))
(define-constant ERR-NOT-TOP10       (err u105))
(define-constant ERR-INVALID-RANK    (err u106))

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

(define-map LeaderboardSlot
  {
    game-id: (string-ascii 32),
    mode: uint,
    rank: uint
  }
  {
    player: principal,
    name: (string-ascii 12),
    score: uint,
    updated-at: uint
  }
)

(define-private (valid-mode? (mode uint))
  (or (is-eq mode MODE-SCORE) (is-eq mode MODE-TIME))
)

(define-private (valid-rank? (rank uint))
  (and (>= rank u1) (<= rank u10))
)

(define-private (better-score? (mode uint) (new-score uint) (old-score uint))
  (if (is-eq mode MODE-TIME)
    (< new-score old-score)
    (> new-score old-score)
  )
)

(define-private (copy-slot
  (game-id (string-ascii 32))
  (mode uint)
  (from-rank uint)
  (to-rank uint)
)
  (match (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: from-rank })
    existing
      (map-set LeaderboardSlot
        { game-id: game-id, mode: mode, rank: to-rank }
        existing
      )
    (map-delete LeaderboardSlot { game-id: game-id, mode: mode, rank: to-rank })
  )
)

(define-private (is-player-at-rank
  (game-id (string-ascii 32))
  (mode uint)
  (rank uint)
  (player principal)
)
  (match (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: rank })
    entry (is-eq (get player entry) player)
    false
  )
)

(define-private (find-player-rank
  (game-id (string-ascii 32))
  (mode uint)
  (player principal)
)
  (if (is-player-at-rank game-id mode u1 player) u1
  (if (is-player-at-rank game-id mode u2 player) u2
  (if (is-player-at-rank game-id mode u3 player) u3
  (if (is-player-at-rank game-id mode u4 player) u4
  (if (is-player-at-rank game-id mode u5 player) u5
  (if (is-player-at-rank game-id mode u6 player) u6
  (if (is-player-at-rank game-id mode u7 player) u7
  (if (is-player-at-rank game-id mode u8 player) u8
  (if (is-player-at-rank game-id mode u9 player) u9
  (if (is-player-at-rank game-id mode u10 player) u10
    u0
  ))))))))))
)

(define-private (qualifies-at-rank?
  (game-id (string-ascii 32))
  (mode uint)
  (score uint)
  (rank uint)
)
  (match (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: rank })
    entry (better-score? mode score (get score entry))
    true
  )
)

(define-private (find-insert-rank
  (game-id (string-ascii 32))
  (mode uint)
  (score uint)
)
  (if (qualifies-at-rank? game-id mode score u1) u1
  (if (qualifies-at-rank? game-id mode score u2) u2
  (if (qualifies-at-rank? game-id mode score u3) u3
  (if (qualifies-at-rank? game-id mode score u4) u4
  (if (qualifies-at-rank? game-id mode score u5) u5
  (if (qualifies-at-rank? game-id mode score u6) u6
  (if (qualifies-at-rank? game-id mode score u7) u7
  (if (qualifies-at-rank? game-id mode score u8) u8
  (if (qualifies-at-rank? game-id mode score u9) u9
  (if (qualifies-at-rank? game-id mode score u10) u10
    u0
  ))))))))))
)

(define-private (shift-down-from
  (game-id (string-ascii 32))
  (mode uint)
  (start-rank uint)
)
  (begin
    (if (<= start-rank u9) (copy-slot game-id mode u9 u10) true)
    (if (<= start-rank u8) (copy-slot game-id mode u8 u9) true)
    (if (<= start-rank u7) (copy-slot game-id mode u7 u8) true)
    (if (<= start-rank u6) (copy-slot game-id mode u6 u7) true)
    (if (<= start-rank u5) (copy-slot game-id mode u5 u6) true)
    (if (<= start-rank u4) (copy-slot game-id mode u4 u5) true)
    (if (<= start-rank u3) (copy-slot game-id mode u3 u4) true)
    (if (<= start-rank u2) (copy-slot game-id mode u2 u3) true)
    (if (<= start-rank u1) (copy-slot game-id mode u1 u2) true)
    true
  )
)

(define-private (collapse-up-from
  (game-id (string-ascii 32))
  (mode uint)
  (start-rank uint)
)
  (begin
    (if (<= start-rank u1) (copy-slot game-id mode u2 u1) true)
    (if (<= start-rank u2) (copy-slot game-id mode u3 u2) true)
    (if (<= start-rank u3) (copy-slot game-id mode u4 u3) true)
    (if (<= start-rank u4) (copy-slot game-id mode u5 u4) true)
    (if (<= start-rank u5) (copy-slot game-id mode u6 u5) true)
    (if (<= start-rank u6) (copy-slot game-id mode u7 u6) true)
    (if (<= start-rank u7) (copy-slot game-id mode u8 u7) true)
    (if (<= start-rank u8) (copy-slot game-id mode u9 u8) true)
    (if (<= start-rank u9) (copy-slot game-id mode u10 u9) true)
    (if (<= start-rank u10) (map-delete LeaderboardSlot { game-id: game-id, mode: mode, rank: u10 }) true)
    true
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

    (let (
      (existing-best (map-get? PlayerBest { game-id: game-id, mode: mode, player: tx-sender }))
      (player-rank (find-player-rank game-id mode tx-sender))
    )
      (match existing-best
        existing (asserts! (better-score? mode score (get score existing)) ERR-NOT-IMPROVEMENT)
        true
      )

      (if (> player-rank u0)
        (collapse-up-from game-id mode player-rank)
        true
      )

      (let (
        (insert-rank (find-insert-rank game-id mode score))
      )
        (asserts! (> insert-rank u0) ERR-NOT-TOP10)
        (shift-down-from game-id mode insert-rank)
        (map-set LeaderboardSlot
          { game-id: game-id, mode: mode, rank: insert-rank }
          {
            player: tx-sender,
            name: player-name,
            score: score,
            updated-at: stacks-block-height
          }
        )
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
          rank: insert-rank,
          improved: (is-some existing-best)
        })
        (ok insert-rank)
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

(define-read-only (get-top10-entry
  (game-id (string-ascii 32))
  (mode uint)
  (rank uint)
)
  (begin
    (asserts! (valid-mode? mode) ERR-INVALID-MODE)
    (asserts! (valid-rank? rank) ERR-INVALID-RANK)
    (ok (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: rank }))
  )
)

(define-read-only (get-top10
  (game-id (string-ascii 32))
  (mode uint)
)
  (begin
    (asserts! (valid-mode? mode) ERR-INVALID-MODE)
    (ok (list
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u1 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u2 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u3 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u4 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u5 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u6 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u7 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u8 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u9 })
      (map-get? LeaderboardSlot { game-id: game-id, mode: mode, rank: u10 })
    ))
  )
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
