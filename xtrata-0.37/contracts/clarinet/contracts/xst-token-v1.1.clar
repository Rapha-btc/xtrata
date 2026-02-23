;; xst-token-v1.1
;;
;; Deterministic participation token for Xtrata.
;; - Fixed supply, no admin controls.
;; - Emissions start once inscription #1000 exists.
;; - Emissions run for 4 years with a fixed schedule.
;; - Claim-based distribution using a global accumulator.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-010 TRAIT (FT COMPATIBILITY) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; [LOCAL / CLARINET]
(impl-trait .sip010-ft-trait.ft-trait)
(use-trait ft-trait .sip010-ft-trait.ft-trait)

;; [TESTNET]
;; (impl-trait 'ST000000000000000000002AMW42H.sip010-ft-trait.ft-trait)
;; (use-trait ft-trait 'ST000000000000000000002AMW42H.sip010-ft-trait.ft-trait)

;; [MAINNET]
;; (impl-trait 'SP000000000000000000002Q6VF78.sip010-ft-trait.ft-trait)
;; (use-trait ft-trait 'SP000000000000000000002Q6VF78.sip010-ft-trait.ft-trait)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- TOKEN METADATA ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant TOKEN-NAME "Xtrata (XST)")
(define-constant TOKEN-SYMBOL "XST")
(define-constant TOKEN-DECIMALS u0)
(define-constant TOKEN-SCALE u1)

(define-constant TOTAL-SUPPLY (* u1000000000 TOKEN-SCALE))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- EMISSIONS CONFIG ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant EMISSION-START-ID u1000)
(define-constant EMISSION-YEARS u4)
(define-constant BLOCKS-PER-YEAR u52560)
(define-constant DURATION-BLOCKS (* EMISSION-YEARS BLOCKS-PER-YEAR))

(define-constant YEAR1-SUPPLY (* u400000000 TOKEN-SCALE))
(define-constant YEAR2-SUPPLY (* u300000000 TOKEN-SCALE))
(define-constant YEAR3-SUPPLY (* u200000000 TOKEN-SCALE))
(define-constant YEAR4-SUPPLY (* u100000000 TOKEN-SCALE))

(define-constant YEAR1-RATE (/ YEAR1-SUPPLY BLOCKS-PER-YEAR))
(define-constant YEAR2-RATE (/ YEAR2-SUPPLY BLOCKS-PER-YEAR))
(define-constant YEAR3-RATE (/ YEAR3-SUPPLY BLOCKS-PER-YEAR))
(define-constant YEAR4-RATE (/ YEAR4-SUPPLY BLOCKS-PER-YEAR))

(define-constant OWNER-POOL-BPS u7000)
(define-constant PARTICIPANT-POOL-BPS u3000)
(define-constant BPS-DENOM u10000)

;; Lineage bonus (parent -> child)
(define-constant LINEAGE-BONUS-BPS u500) ;; 5%
(define-constant LINEAGE-BONUS-CAP u100)
(define-constant LINEAGE-BONUS-MAX-CHILDREN u100)
(define-constant LINEAGE-BONUS-PCT-SCALE u100)
(define-constant LINEAGE-BONUS-LINEAR-DENOM u99)

;; Scale accumulator to preserve precision in integer math.
(define-constant ACC-SCALE u1000000)

(define-constant PARTICIPANT-WEIGHT-BANDS (list
  { limit: u0, weight: u0 }
  { limit: u1, weight: u1 }
  { limit: u4, weight: u2 }
  { limit: u9, weight: u3 }
  { limit: u16, weight: u4 }
  { limit: u25, weight: u5 }
  { limit: u36, weight: u6 }
  { limit: u49, weight: u7 }
  { limit: u64, weight: u8 }
  { limit: u81, weight: u9 }
  { limit: u100, weight: u10 }
  { limit: u121, weight: u11 }
  { limit: u144, weight: u12 }
  { limit: u169, weight: u13 }
  { limit: u196, weight: u14 }
  { limit: u225, weight: u15 }
  { limit: u256, weight: u16 }
  { limit: u289, weight: u17 }
  { limit: u324, weight: u18 }
  { limit: u361, weight: u19 }
  { limit: u400, weight: u20 }
  { limit: u441, weight: u21 }
  { limit: u484, weight: u22 }
  { limit: u529, weight: u23 }
  { limit: u576, weight: u24 }
  { limit: u625, weight: u25 }
  { limit: u676, weight: u26 }
  { limit: u729, weight: u27 }
  { limit: u784, weight: u28 }
  { limit: u841, weight: u29 }
  { limit: u900, weight: u30 }
  { limit: u961, weight: u31 }
  { limit: u1024, weight: u32 }
  { limit: u1089, weight: u33 }
  { limit: u1156, weight: u34 }
  { limit: u1225, weight: u35 }
  { limit: u1296, weight: u36 }
  { limit: u1369, weight: u37 }
  { limit: u1444, weight: u38 }
  { limit: u1521, weight: u39 }
  { limit: u1600, weight: u40 }
  { limit: u1681, weight: u41 }
  { limit: u1764, weight: u42 }
  { limit: u1849, weight: u43 }
  { limit: u1936, weight: u44 }
  { limit: u2025, weight: u45 }
  { limit: u2116, weight: u46 }
  { limit: u2209, weight: u47 }
  { limit: u2304, weight: u48 }
  { limit: u2401, weight: u49 }
  { limit: u2500, weight: u50 }
  { limit: u2601, weight: u51 }
  { limit: u2704, weight: u52 }
  { limit: u2809, weight: u53 }
  { limit: u2916, weight: u54 }
  { limit: u3025, weight: u55 }
  { limit: u3136, weight: u56 }
  { limit: u3249, weight: u57 }
  { limit: u3364, weight: u58 }
  { limit: u3481, weight: u59 }
  { limit: u3600, weight: u60 }
  { limit: u3721, weight: u61 }
  { limit: u3844, weight: u62 }
  { limit: u3969, weight: u63 }
  { limit: u4096, weight: u64 }
  { limit: u4225, weight: u65 }
  { limit: u4356, weight: u66 }
  { limit: u4489, weight: u67 }
  { limit: u4624, weight: u68 }
  { limit: u4761, weight: u69 }
  { limit: u4900, weight: u70 }
  { limit: u5041, weight: u71 }
  { limit: u5184, weight: u72 }
  { limit: u5329, weight: u73 }
  { limit: u5476, weight: u74 }
  { limit: u5625, weight: u75 }
  { limit: u5776, weight: u76 }
  { limit: u5929, weight: u77 }
  { limit: u6084, weight: u78 }
  { limit: u6241, weight: u79 }
  { limit: u6400, weight: u80 }
  { limit: u6561, weight: u81 }
  { limit: u6724, weight: u82 }
  { limit: u6889, weight: u83 }
  { limit: u7056, weight: u84 }
  { limit: u7225, weight: u85 }
  { limit: u7396, weight: u86 }
  { limit: u7569, weight: u87 }
  { limit: u7744, weight: u88 }
  { limit: u7921, weight: u89 }
  { limit: u8100, weight: u90 }
  { limit: u8281, weight: u91 }
  { limit: u8464, weight: u92 }
  { limit: u8649, weight: u93 }
  { limit: u8836, weight: u94 }
  { limit: u9025, weight: u95 }
  { limit: u9216, weight: u96 }
  { limit: u9409, weight: u97 }
  { limit: u9604, weight: u98 }
  { limit: u9801, weight: u99 }
  { limit: u10000, weight: u100 }
  { limit: u1000000000000, weight: u100 }
))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- XTRATA CONTRACT LINK ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Uses a local contract principal; deploy xst-token from the same deployer as xtrata.
(define-private (xtrata-get-last-token-id)
  (contract-call? .xtrata-v2-1-0 get-last-token-id)
)

(define-private (xtrata-inscription-exists (token-id uint))
  (contract-call? .xtrata-v2-1-0 inscription-exists token-id)
)

(define-private (xtrata-get-owner (token-id uint))
  (contract-call? .xtrata-v2-1-0 get-owner token-id)
)

(define-private (xtrata-get-dependencies (token-id uint))
  (contract-call? .xtrata-v2-1-0 get-dependencies token-id)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ERROR CODES ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-REGISTERED (err u102))
(define-constant ERR-READONLY (err u103))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- TOKEN DEFINITION ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-fungible-token xst)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- STATE ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-data-var emissions-start-block (optional uint) none)
(define-data-var last-emission-block uint u0)
(define-data-var total-emitted uint u0)

(define-data-var acc-owner-per-weight uint u0)
(define-data-var total-owner-weight uint u0)
(define-data-var registered-count uint u0)
(define-data-var owner-undistributed uint u0)

(define-data-var acc-participant-per-weight uint u0)
(define-data-var total-participant-weight uint u0)
(define-data-var participant-undistributed uint u0)

(define-map InscriptionWeight uint uint)
(define-map InscriptionRewardDebt uint uint)
(define-map InscriptionParticipantOwner uint principal)
(define-map InscriptionParent uint uint)
(define-map InscriptionLineageBonus uint uint)
(define-map ParentChildCount uint uint)

(define-map ParticipantCount principal uint)
(define-map ParticipantWeight principal uint)
(define-map ParticipantRewardDebt principal uint)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- HELPERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-private (min-u (a uint) (b uint))
  (if (< a b) a b)
)

(define-private (max-u (a uint) (b uint))
  (if (> a b) a b)
)

(define-private (emission-end-block (start uint))
  (+ start DURATION-BLOCKS)
)

(define-private (effective-block (start uint) (current uint))
  (let ((end (emission-end-block start)))
    (if (> current end) end current)
  )
)

(define-private (calc-year-blocks (start uint) (year uint) (from uint) (to uint))
  (let (
    (year-start (+ start (* year BLOCKS-PER-YEAR)))
    (year-end (+ year-start BLOCKS-PER-YEAR))
    (seg-start (max-u from year-start))
    (seg-end (min-u to year-end))
  )
    (if (> seg-end seg-start) (- seg-end seg-start) u0)
  )
)

(define-private (calc-emission (start uint) (from uint) (to uint))
  (let (
    (blocks0 (calc-year-blocks start u0 from to))
    (blocks1 (calc-year-blocks start u1 from to))
    (blocks2 (calc-year-blocks start u2 from to))
    (blocks3 (calc-year-blocks start u3 from to))
    (emit0 (* blocks0 YEAR1-RATE))
    (emit1 (* blocks1 YEAR2-RATE))
    (emit2 (* blocks2 YEAR3-RATE))
    (emit3 (* blocks3 YEAR4-RATE))
  )
    (+ emit0 (+ emit1 (+ emit2 emit3)))
  )
)

(define-private (maybe-start-emissions)
  (if (is-none (var-get emissions-start-block))
    (let ((last-id (unwrap! (xtrata-get-last-token-id) ERR-READONLY)))
      (if (>= last-id EMISSION-START-ID)
        (begin
          (var-set emissions-start-block (some stacks-block-height))
          (var-set last-emission-block stacks-block-height)
          (ok true)
        )
        (ok false)
      )
    )
    (ok false)
  )
)

(define-private (assert-inscription-exists (token-id uint))
  (let ((exists (unwrap! (xtrata-inscription-exists token-id) ERR-READONLY)))
    (asserts! exists ERR-NOT-FOUND)
    (ok true)
  )
)

(define-private (get-inscription-owner (token-id uint))
  (let ((owner-opt (unwrap! (xtrata-get-owner token-id) ERR-READONLY)))
    (match owner-opt
      owner (ok owner)
      ERR-NOT-FOUND
    )
  )
)

(define-private (weight-for-id (token-id uint))
  (if (is-eq token-id u0)
    u1400
    (if (<= token-id u10)
      u1200
      (if (<= token-id u100)
        u1000
        (if (<= token-id u1000)
          u800
          (if (<= token-id u10000)
            u640
            (if (<= token-id u100000)
              u512
              (if (<= token-id u1000000)
                u410
                (if (<= token-id u10000000)
                  u328
                  (if (<= token-id u100000000)
                    u262
                    (if (<= token-id u1000000000)
                      u209
                      (if (<= token-id u10000000000)
                        u167
                        (if (<= token-id u100000000000)
                          u133
                          (if (<= token-id u1000000000000)
                            u106
                            (if (<= token-id u10000000000000)
                              u84
                              (if (<= token-id u100000000000000)
                                u67
                                u53
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  )
)

(define-private (participant-band-step
  (band { limit: uint, weight: uint })
  (acc { count: uint, weight: uint, done: bool })
)
  (if (get done acc)
    acc
    (if (<= (get count acc) (get limit band))
      { count: (get count acc), weight: (get weight band), done: true }
      acc
    )
  )
)

(define-private (participant-weight-for-count (count uint))
  (let ((result (fold participant-band-step PARTICIPANT-WEIGHT-BANDS {
    count: count,
    weight: u0,
    done: false
  })))
    (get weight result)
  )
)

(define-private (select-parent-fold (dep uint) (acc (optional { id: uint, weight: uint })))
  (let ((dep-weight (weight-for-id dep)))
    (match acc
      current
        (if (> dep-weight (get weight current))
          (some { id: dep, weight: dep-weight })
          (if (and (is-eq dep-weight (get weight current)) (< dep (get id current)))
            (some { id: dep, weight: dep-weight })
            acc
          )
        )
      (some { id: dep, weight: dep-weight })
    )
  )
)

(define-private (select-primary-parent (deps (list 50 uint)))
  (match (fold select-parent-fold deps none)
    current (some (get id current))
    none
  )
)

(define-private (lineage-multiplier (child-index uint))
  (if (>= child-index LINEAGE-BONUS-MAX-CHILDREN)
    u0
    (let (
      (reduction (/ (* (- child-index u1) LINEAGE-BONUS-PCT-SCALE) LINEAGE-BONUS-LINEAR-DENOM))
    )
      (if (>= reduction LINEAGE-BONUS-PCT-SCALE)
        u0
        (- LINEAGE-BONUS-PCT-SCALE reduction)
      )
    )
  )
)

(define-private (lineage-bonus (parent-id uint) (child-index uint))
  (let (
    (parent-weight (weight-for-id parent-id))
    (raw (/ (* parent-weight LINEAGE-BONUS-BPS) BPS-DENOM))
    (mult (lineage-multiplier child-index))
    (scaled (/ (* raw mult) LINEAGE-BONUS-PCT-SCALE))
  )
    (if (> scaled LINEAGE-BONUS-CAP) LINEAGE-BONUS-CAP scaled)
  )
)

(define-private (settle-participant (owner principal))
  (let (
    (weight (default-to u0 (map-get? ParticipantWeight owner)))
    (acc (var-get acc-participant-per-weight))
    (debt (default-to u0 (map-get? ParticipantRewardDebt owner)))
    (delta (if (> acc debt) (- acc debt) u0))
    (pending (/ (* weight delta) ACC-SCALE))
  )
    (begin
      (if (> pending u0)
        (try! (ft-mint? xst pending owner))
        true
      )
      (map-set ParticipantRewardDebt owner acc)
      (ok pending)
    )
  )
)

(define-private (set-participant-count (owner principal) (new-count uint))
  (let (
    (old-weight (default-to u0 (map-get? ParticipantWeight owner)))
    (new-weight (participant-weight-for-count new-count))
  )
    (begin
      (if (is-eq old-weight new-weight)
        (begin
          (map-set ParticipantCount owner new-count)
          (ok false)
        )
        (begin
          (try! (settle-participant owner))
          (map-set ParticipantCount owner new-count)
          (map-set ParticipantWeight owner new-weight)
          (map-set ParticipantRewardDebt owner (var-get acc-participant-per-weight))
          (if (> new-weight old-weight)
            (var-set total-participant-weight
              (+ (var-get total-participant-weight) (- new-weight old-weight))
            )
            (if (> old-weight new-weight)
              (var-set total-participant-weight
                (- (var-get total-participant-weight) (- old-weight new-weight))
              )
              true
            )
          )
          (ok true)
        )
      )
    )
  )
)

(define-private (register-participant-owner (token-id uint) (owner principal))
  (match (map-get? InscriptionParticipantOwner token-id)
    prev-owner
      (if (is-eq prev-owner owner)
        (ok false)
        (let (
          (prev-count (default-to u0 (map-get? ParticipantCount prev-owner)))
          (next-prev (if (> prev-count u0) (- prev-count u1) u0))
          (current-count (default-to u0 (map-get? ParticipantCount owner)))
          (next-current (+ current-count u1))
        )
          (begin
            (try! (set-participant-count prev-owner next-prev))
            (try! (set-participant-count owner next-current))
            (map-set InscriptionParticipantOwner token-id owner)
            (ok true)
          )
        )
      )
    (let ((current-count (default-to u0 (map-get? ParticipantCount owner))))
      (begin
        (try! (set-participant-count owner (+ current-count u1)))
        (map-set InscriptionParticipantOwner token-id owner)
        (ok true)
      )
    )
  )
)

(define-private (register-inscription-core (token-id uint))
  (begin
    (try! (assert-inscription-exists token-id))
    (let (
      (owner (try! (get-inscription-owner token-id)))
      (owner-registered (is-none (map-get? InscriptionWeight token-id)))
    )
      (begin
        (if owner-registered
          (let (
            (base-weight (weight-for-id token-id))
            (deps (xtrata-get-dependencies token-id))
            (primary-parent (select-primary-parent deps))
            (bonus (match primary-parent
              parent-id
                (let (
                  (current-count (default-to u0 (map-get? ParentChildCount parent-id)))
                  (child-index (+ current-count u1))
                  (computed (lineage-bonus parent-id child-index))
                )
                  (begin
                    (map-set ParentChildCount parent-id child-index)
                    (map-set InscriptionParent token-id parent-id)
                    (map-set InscriptionLineageBonus token-id computed)
                    computed
                  )
                )
              u0
            ))
            (weight (+ base-weight bonus))
          )
            (map-set InscriptionWeight token-id weight)
            (map-set InscriptionRewardDebt token-id (var-get acc-owner-per-weight))
            (var-set total-owner-weight (+ (var-get total-owner-weight) weight))
            (var-set registered-count (+ (var-get registered-count) u1))
          )
          true
        )
        (try! (register-participant-owner token-id owner))
        (ok owner-registered)
      )
    )
  )
)

(define-private (register-fold (token-id uint) (acc (response uint uint)))
  (let ((count (try! acc)))
    (let ((registered (try! (register-inscription-core token-id))))
      (if registered
        (ok (+ count u1))
        (ok count)
      )
    )
  )
)

(define-private (project-acc-owner (current uint))
  (match (var-get emissions-start-block)
    start
      (let (
        (total-weight (var-get total-owner-weight))
        (end-block (effective-block start current))
        (last (var-get last-emission-block))
        (remaining (if (> TOTAL-SUPPLY (var-get total-emitted))
          (- TOTAL-SUPPLY (var-get total-emitted))
          u0
        ))
      )
        (if (or (is-eq remaining u0) (<= end-block last))
          (var-get acc-owner-per-weight)
          (let (
            (emit (calc-emission start last end-block))
            (bounded (if (> emit remaining) remaining emit))
            (owner-emit (/ (* bounded OWNER-POOL-BPS) BPS-DENOM))
            (owner-total (+ owner-emit (var-get owner-undistributed)))
          )
            (if (is-eq total-weight u0)
              (var-get acc-owner-per-weight)
              (+ (var-get acc-owner-per-weight) (/ (* owner-total ACC-SCALE) total-weight))
            )
          )
        )
      )
    (var-get acc-owner-per-weight)
  )
)

(define-private (project-acc-participant (current uint))
  (match (var-get emissions-start-block)
    start
      (let (
        (total-weight (var-get total-participant-weight))
        (end-block (effective-block start current))
        (last (var-get last-emission-block))
        (remaining (if (> TOTAL-SUPPLY (var-get total-emitted))
          (- TOTAL-SUPPLY (var-get total-emitted))
          u0
        ))
      )
        (if (or (is-eq remaining u0) (<= end-block last))
          (var-get acc-participant-per-weight)
          (let (
            (emit (calc-emission start last end-block))
            (bounded (if (> emit remaining) remaining emit))
            (owner-emit (/ (* bounded OWNER-POOL-BPS) BPS-DENOM))
            (participant-emit (- bounded owner-emit))
            (participant-total (+ participant-emit (var-get participant-undistributed)))
          )
            (if (is-eq total-weight u0)
              (var-get acc-participant-per-weight)
              (+ (var-get acc-participant-per-weight)
                (/ (* participant-total ACC-SCALE) total-weight)
              )
            )
          )
        )
      )
    (var-get acc-participant-per-weight)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-010 REQUIRED FUNCTIONS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply xst))
)

(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance xst owner))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (try! (ft-transfer? xst amount sender recipient))
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- EMISSIONS + CLAIMS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (update-emissions)
  (begin
    (try! (maybe-start-emissions))
    (match (var-get emissions-start-block)
      start
        (let (
          (end-block (effective-block start stacks-block-height))
          (last (var-get last-emission-block))
        )
          (if (<= end-block last)
            (ok u0)
            (let (
              (remaining (if (> TOTAL-SUPPLY (var-get total-emitted))
                (- TOTAL-SUPPLY (var-get total-emitted))
                u0
              ))
              (owner-weight-total (var-get total-owner-weight))
              (participant-weight-total (var-get total-participant-weight))
            )
              (if (is-eq remaining u0)
                (ok u0)
                (let (
                  (emit (calc-emission start last end-block))
                  (bounded (if (> emit remaining) remaining emit))
                  (owner-emit (/ (* bounded OWNER-POOL-BPS) BPS-DENOM))
                  (participant-emit (- bounded owner-emit))
                  (owner-total (+ owner-emit (var-get owner-undistributed)))
                  (participant-total (+ participant-emit (var-get participant-undistributed)))
                )
                  (if (> owner-weight-total u0)
                    (begin
                      (var-set acc-owner-per-weight
                        (+ (var-get acc-owner-per-weight)
                          (/ (* owner-total ACC-SCALE) owner-weight-total)
                        )
                      )
                      (var-set owner-undistributed u0)
                    )
                    (var-set owner-undistributed owner-total)
                  )
                  (if (> participant-weight-total u0)
                    (begin
                      (var-set acc-participant-per-weight
                        (+ (var-get acc-participant-per-weight)
                          (/ (* participant-total ACC-SCALE) participant-weight-total)
                        )
                      )
                      (var-set participant-undistributed u0)
                    )
                    (var-set participant-undistributed participant-total)
                  )
                  (var-set total-emitted (+ (var-get total-emitted) bounded))
                  (var-set last-emission-block end-block)
                  (ok bounded)
                )
              )
            )
          )
        )
      (ok u0)
    )
  )
)

(define-public (register-inscription (token-id uint))
  (begin
    (try! (update-emissions))
    (register-inscription-core token-id)
  )
)

(define-public (register-inscriptions (token-ids (list 200 uint)))
  (begin
    (try! (update-emissions))
    (let ((result (fold register-fold token-ids (ok u0))))
      (ok (try! result))
    )
  )
)

(define-public (claim-owner (token-id uint))
  (begin
    (try! (update-emissions))
    (let ((owner (try! (get-inscription-owner token-id))))
      (asserts! (is-eq owner tx-sender) ERR-NOT-AUTHORIZED)
      (if (is-none (map-get? InscriptionWeight token-id))
        (try! (register-inscription-core token-id))
        true
      )
      (let (
        (weight (unwrap! (map-get? InscriptionWeight token-id) ERR-NOT-FOUND))
        (acc (var-get acc-owner-per-weight))
        (debt (default-to u0 (map-get? InscriptionRewardDebt token-id)))
        (delta (if (> acc debt) (- acc debt) u0))
        (pending (/ (* weight delta) ACC-SCALE))
      )
        (if (> pending u0)
          (try! (ft-mint? xst pending tx-sender))
          true
        )
        (map-set InscriptionRewardDebt token-id acc)
        (ok pending)
      )
    )
  )
)

(define-public (claim-participant)
  (begin
    (try! (update-emissions))
    (settle-participant tx-sender)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- READ-ONLY SURFACE (ORACLE SUPPORT) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-emissions-start-block)
  (ok (var-get emissions-start-block))
)

(define-read-only (get-last-emission-block)
  (ok (var-get last-emission-block))
)

(define-read-only (get-total-emitted)
  (ok (var-get total-emitted))
)

(define-read-only (get-remaining-supply)
  (ok (if (> TOTAL-SUPPLY (var-get total-emitted))
    (- TOTAL-SUPPLY (var-get total-emitted))
    u0
  ))
)

(define-read-only (get-acc-owner-per-weight)
  (ok (var-get acc-owner-per-weight))
)

(define-read-only (get-total-owner-weight)
  (ok (var-get total-owner-weight))
)

(define-read-only (get-owner-undistributed)
  (ok (var-get owner-undistributed))
)

(define-read-only (get-acc-participant-per-weight)
  (ok (var-get acc-participant-per-weight))
)

(define-read-only (get-total-participant-weight)
  (ok (var-get total-participant-weight))
)

(define-read-only (get-participant-undistributed)
  (ok (var-get participant-undistributed))
)

(define-read-only (get-participant-count (owner principal))
  (ok (default-to u0 (map-get? ParticipantCount owner)))
)

(define-read-only (get-participant-weight (owner principal))
  (ok (default-to u0 (map-get? ParticipantWeight owner)))
)

(define-read-only (get-parent-child-count (parent-id uint))
  (ok (default-to u0 (map-get? ParentChildCount parent-id)))
)

(define-read-only (get-inscription-parent (token-id uint))
  (map-get? InscriptionParent token-id)
)

(define-read-only (get-inscription-lineage-bonus (token-id uint))
  (ok (default-to u0 (map-get? InscriptionLineageBonus token-id)))
)

(define-read-only (get-registered-count)
  (ok (var-get registered-count))
)

(define-read-only (get-can-start-emissions)
  (ok (is-none (var-get emissions-start-block)))
)

(define-read-only (get-current-year-index)
  (match (var-get emissions-start-block)
    start
      (let ((current (effective-block start stacks-block-height)))
        (ok (if (<= current start)
          u0
          (let ((elapsed (- current start)))
            (if (>= elapsed DURATION-BLOCKS)
              u3
              (let ((idx (/ elapsed BLOCKS-PER-YEAR)))
                (if (> idx u3) u3 idx)
              )
            )
          )
        ))
      )
    (ok u0)
  )
)

(define-read-only (get-current-per-block-rate)
  (match (var-get emissions-start-block)
    start
      (let ((current (effective-block start stacks-block-height)))
        (if (<= current start)
          (ok YEAR1-RATE)
          (let ((elapsed (- current start)))
            (if (>= elapsed DURATION-BLOCKS)
              (ok YEAR4-RATE)
              (let ((idx (/ elapsed BLOCKS-PER-YEAR)))
                (ok (if (is-eq idx u0)
                  YEAR1-RATE
                  (if (is-eq idx u1)
                    YEAR2-RATE
                    (if (is-eq idx u2) YEAR3-RATE YEAR4-RATE)
                  )
                ))
              )
            )
          )
        )
      )
    (ok YEAR1-RATE)
  )
)

(define-read-only (get-inscription-weight (token-id uint))
  (match (map-get? InscriptionWeight token-id)
    weight (ok (some weight))
    (ok none)
  )
)

(define-read-only (is-inscription-registered (token-id uint))
  (ok (is-some (map-get? InscriptionWeight token-id)))
)

(define-read-only (get-claimable-owner (token-id uint))
  (let (
    (acc (project-acc-owner stacks-block-height))
    (weight (default-to u0 (map-get? InscriptionWeight token-id)))
    (debt (default-to u0 (map-get? InscriptionRewardDebt token-id)))
    (delta (if (> acc debt) (- acc debt) u0))
  )
    (ok (/ (* weight delta) ACC-SCALE))
  )
)

(define-read-only (get-claimable-participant (owner principal))
  (let (
    (acc (project-acc-participant stacks-block-height))
    (weight (default-to u0 (map-get? ParticipantWeight owner)))
    (debt (default-to u0 (map-get? ParticipantRewardDebt owner)))
    (delta (if (> acc debt) (- acc debt) u0))
  )
    (ok (/ (* weight delta) ACC-SCALE))
  )
)
