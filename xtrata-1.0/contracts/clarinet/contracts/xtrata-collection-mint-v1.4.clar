;; xtrata-collection-mint-v1.4
;; Flexible per-collection mint coordinator.
;; - Locks minting to xtrata-v2.1.0.
;; - Supports phase-based pricing/allowlists/limits.
;; - Tracks minted index + mint context.
;; - Adds operator/finance roles and two-step ownership transfer.
;; - Locks marketplace/operator recipient updates by default.
;;   The main Xtrata core admin grants scoped recipient-editor access.
;; - Streamlined payments: begin only pays Xtrata begin fee; collection mint price is paid at seal.
;; - Adds optional small-file single-tx collection mint path (<= 30 chunks).

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-PRICE (err u101))
(define-constant ERR-INVALID-BPS (err u102))
(define-constant ERR-PAUSED (err u103))
(define-constant ERR-MAX-SUPPLY (err u104))
(define-constant ERR-NOT-FOUND (err u105))
(define-constant ERR-NOT-ALLOWLISTED (err u106))
(define-constant ERR-WALLET-LIMIT (err u107))
(define-constant ERR-FINALIZED (err u108))
(define-constant ERR-ALREADY-SET (err u109))
(define-constant ERR-NOT-FINALIZABLE (err u110))
(define-constant ERR-INVALID-BATCH (err u111))
(define-constant ERR-INVALID-CORE-CONTRACT (err u112))
(define-constant ERR-INVALID-PHASE (err u113))
(define-constant ERR-PHASE-NOT-ACTIVE (err u114))
(define-constant ERR-PHASE-CAP (err u115))
(define-constant ERR-PENDING-OWNER (err u116))
(define-constant ERR-NO-PENDING-OWNER (err u117))
(define-constant ERR-INVALID-ALLOWLIST-MODE (err u118))
(define-constant ERR-RESERVATION-NOT-EXPIRED (err u119))
(define-constant ERR-DEFAULT-DEPENDENCIES-BATCH (err u120))
(define-constant ERR-DUPLICATE-HASH (err u122))

(define-constant BASIS-POINTS u10000)
(define-constant DEFAULT-TOKEN-URI "data:text/plain,xtrata-collection-default")
(define-constant SMALL-MINT-CHUNK-SIZE u16384)
(define-constant MAX-SMALL-MINT-CHUNKS u30)

(define-constant ALLOWLIST-INHERIT u0)
(define-constant ALLOWLIST-PUBLIC u1)
(define-constant ALLOWLIST-GLOBAL u2)
(define-constant ALLOWLIST-PHASE u3)

;; Locked core target for local/clarinet deployment.
(define-constant ALLOWED-XTRATA-CONTRACT .xtrata-v2-1-0)

(define-trait xtrata-trait
  (
    (begin-or-get ((buff 32) (string-ascii 64) uint uint) (response (optional uint) uint))
    (begin-inscription ((buff 32) (string-ascii 64) uint uint) (response bool uint))
    (add-chunk-batch ((buff 32) (list 50 (buff 16384))) (response bool uint))
    (seal-inscription ((buff 32) (string-ascii 256)) (response uint uint))
    (seal-inscription-batch ((list 50 { hash: (buff 32), token-uri: (string-ascii 256) })) (response { start: uint, count: uint } uint))
    (seal-recursive ((buff 32) (string-ascii 256) (list 50 uint)) (response uint uint))
    (get-admin () (response principal uint))
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var operator-admin principal tx-sender)
(define-data-var finance-admin principal tx-sender)

(define-data-var paused bool true)
(define-data-var mint-price uint u0)
(define-data-var max-supply uint u0)
(define-data-var reserved-count uint u0)
(define-data-var minted-count uint u0)
(define-data-var minted-index-count uint u0)
(define-data-var finalized bool false)
(define-data-var allowlist-enabled bool false)
(define-data-var max-per-wallet uint u0)

(define-data-var active-phase-id uint u0)
(define-data-var reservation-expiry-blocks uint u1440)

(define-data-var collection-name (string-ascii 64) "")
(define-data-var collection-symbol (string-ascii 16) "")
(define-data-var collection-base-uri (string-ascii 256) "")
(define-data-var collection-description (string-ascii 256) "")
(define-data-var reveal-block uint u0)
(define-data-var default-token-uri (string-ascii 256) DEFAULT-TOKEN-URI)
(define-data-var default-dependencies (list 50 uint) (list))

(define-data-var artist-recipient principal tx-sender)
(define-data-var marketplace-recipient principal tx-sender)
(define-data-var operator-recipient principal tx-sender)

(define-data-var artist-bps uint u0)
(define-data-var marketplace-bps uint u0)
(define-data-var operator-bps uint u0)

(define-map MintSessions
  { owner: principal, hash: (buff 32) }
  { fee-paid: bool, phase-id: uint, mint-price: uint, created-at: uint }
)
(define-map Allowlist
  { owner: principal }
  { allowance: uint }
)
(define-map PhaseAllowlist
  { phase-id: uint, owner: principal }
  { allowance: uint }
)
(define-map WalletStats
  { owner: principal }
  { minted: uint, reserved: uint }
)
(define-map PhaseWalletStats
  { phase-id: uint, owner: principal }
  { minted: uint, reserved: uint }
)
(define-map Phases
  { phase-id: uint }
  {
    enabled: bool,
    start-block: uint,
    end-block: uint,
    mint-price: uint,
    max-per-wallet: uint,
    max-supply: uint,
    allowlist-mode: uint
  }
)
(define-map PhaseStats
  { phase-id: uint }
  { minted: uint, reserved: uint }
)
(define-map MintedIndex
  { index: uint }
  { token-id: uint }
)
(define-map TokenMintContext
  { token-id: uint }
  { owner: principal, phase-id: uint, minted-at: uint }
)
(define-map RegisteredTokenUris
  { hash: (buff 32) }
  { token-uri: (string-ascii 256) }
)
(define-map RecipientEditors
  { editor: principal }
  { marketplace: bool, operator: bool }
)

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (ok true)
  )
)

(define-private (assert-config-admin)
  (begin
    (asserts!
      (or
        (is-eq tx-sender (var-get contract-owner))
        (is-eq tx-sender (var-get operator-admin))
      )
      ERR-NOT-AUTHORIZED
    )
    (ok true)
  )
)

(define-private (assert-finance-admin)
  (begin
    (asserts!
      (or
        (is-eq tx-sender (var-get contract-owner))
        (is-eq tx-sender (var-get finance-admin))
      )
      ERR-NOT-AUTHORIZED
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

(define-private (assert-not-finalized)
  (begin
    (asserts! (not (var-get finalized)) ERR-FINALIZED)
    (ok true)
  )
)

(define-private (assert-main-xtrata-admin (xtrata-contract <xtrata-trait>))
  (let ((admin (unwrap-panic (contract-call? xtrata-contract get-admin))))
    (begin
      (asserts!
        (is-eq (contract-of xtrata-contract) ALLOWED-XTRATA-CONTRACT)
        ERR-INVALID-CORE-CONTRACT
      )
      (asserts! (is-eq tx-sender admin) ERR-NOT-AUTHORIZED)
      (ok true)
    )
  )
)

(define-private (assert-core-contract (xtrata-contract <xtrata-trait>))
  (begin
    (asserts!
      (is-eq (contract-of xtrata-contract) ALLOWED-XTRATA-CONTRACT)
      ERR-INVALID-CORE-CONTRACT
    )
    (ok true)
  )
)

(define-private (assert-small-upload-shape (total-size uint) (chunk-count uint))
  (begin
    (asserts! (> chunk-count u0) ERR-INVALID-BATCH)
    (asserts! (<= chunk-count MAX-SMALL-MINT-CHUNKS) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* chunk-count SMALL-MINT-CHUNK-SIZE)) ERR-INVALID-BATCH)
    (ok true)
  )
)

(define-private (is-valid-allowlist-mode (mode uint))
  (or
    (is-eq mode ALLOWLIST-INHERIT)
    (is-eq mode ALLOWLIST-PUBLIC)
    (is-eq mode ALLOWLIST-GLOBAL)
    (is-eq mode ALLOWLIST-PHASE)
  )
)

(define-private (get-recipient-editor-access-internal (editor principal))
  (default-to
    { marketplace: false, operator: false }
    (map-get? RecipientEditors { editor: editor })
  )
)

(define-private (assert-marketplace-recipient-editor)
  (begin
    (asserts!
      (get marketplace (get-recipient-editor-access-internal tx-sender))
      ERR-NOT-AUTHORIZED
    )
    (ok true)
  )
)

(define-private (assert-operator-recipient-editor)
  (begin
    (asserts!
      (get operator (get-recipient-editor-access-internal tx-sender))
      ERR-NOT-AUTHORIZED
    )
    (ok true)
  )
)

(define-private (get-wallet-stats-internal (owner principal))
  (default-to { minted: u0, reserved: u0 } (map-get? WalletStats { owner: owner }))
)

(define-private (set-wallet-stats (owner principal) (minted uint) (reserved uint))
  (map-set WalletStats { owner: owner } { minted: minted, reserved: reserved })
)

(define-private (get-phase-wallet-stats-internal (phase-id uint) (owner principal))
  (default-to
    { minted: u0, reserved: u0 }
    (map-get? PhaseWalletStats { phase-id: phase-id, owner: owner })
  )
)

(define-private (set-phase-wallet-stats (phase-id uint) (owner principal) (minted uint) (reserved uint))
  (map-set
    PhaseWalletStats
    { phase-id: phase-id, owner: owner }
    { minted: minted, reserved: reserved }
  )
)

(define-private (get-phase-stats-internal (phase-id uint))
  (default-to { minted: u0, reserved: u0 } (map-get? PhaseStats { phase-id: phase-id }))
)

(define-private (set-phase-stats (phase-id uint) (minted uint) (reserved uint))
  (map-set PhaseStats { phase-id: phase-id } { minted: minted, reserved: reserved })
)

(define-private (get-phase-or-err (phase-id uint))
  (match (map-get? Phases { phase-id: phase-id })
    phase (ok phase)
    ERR-INVALID-PHASE
  )
)

(define-private (assert-phase-active (phase-id uint))
  (let ((phase (try! (get-phase-or-err phase-id))))
    (begin
      (asserts! (get enabled phase) ERR-PHASE-NOT-ACTIVE)
      (asserts!
        (or
          (is-eq (get start-block phase) u0)
          (>= stacks-block-height (get start-block phase))
        )
        ERR-PHASE-NOT-ACTIVE
      )
      (asserts!
        (or
          (is-eq (get end-block phase) u0)
          (<= stacks-block-height (get end-block phase))
        )
        ERR-PHASE-NOT-ACTIVE
      )
      (ok phase)
    )
  )
)

(define-private (check-wallet-limit (owner principal))
  (let (
    (stats (get-wallet-stats-internal owner))
    (active (+ (get minted stats) (get reserved stats)))
    (limit (var-get max-per-wallet))
  )
    (if (and (> limit u0) (>= active limit))
      ERR-WALLET-LIMIT
      (ok true)
    )
  )
)

(define-private (check-phase-wallet-limit (owner principal) (phase-id uint) (limit uint))
  (if (> limit u0)
    (let (
      (stats (get-phase-wallet-stats-internal phase-id owner))
      (active (+ (get minted stats) (get reserved stats)))
    )
      (if (>= active limit)
        ERR-WALLET-LIMIT
        (ok true)
      )
    )
    (ok true)
  )
)

(define-private (check-phase-cap (phase-id uint) (limit uint))
  (if (> limit u0)
    (let (
      (stats (get-phase-stats-internal phase-id))
      (active (+ (get minted stats) (get reserved stats)))
    )
      (if (>= active limit)
        ERR-PHASE-CAP
        (ok true)
      )
    )
    (ok true)
  )
)

(define-private (check-global-allowlist (owner principal))
  (match (map-get? Allowlist { owner: owner })
    entry (let (
      (stats (get-wallet-stats-internal owner))
      (active (+ (get minted stats) (get reserved stats)))
      (allowance (get allowance entry))
    )
      (if (>= active allowance)
        ERR-WALLET-LIMIT
        (ok true)
      )
    )
    ERR-NOT-ALLOWLISTED
  )
)

(define-private (check-phase-allowlist (owner principal) (phase-id uint))
  (match (map-get? PhaseAllowlist { phase-id: phase-id, owner: owner })
    entry (let (
      (stats (get-phase-wallet-stats-internal phase-id owner))
      (active (+ (get minted stats) (get reserved stats)))
      (allowance (get allowance entry))
    )
      (if (>= active allowance)
        ERR-WALLET-LIMIT
        (ok true)
      )
    )
    ERR-NOT-ALLOWLISTED
  )
)

(define-private (check-allowlist (owner principal) (phase-id uint) (mode uint))
  (if (is-valid-allowlist-mode mode)
    (if (is-eq mode ALLOWLIST-PUBLIC)
      (ok true)
      (if (is-eq mode ALLOWLIST-GLOBAL)
        (check-global-allowlist owner)
        (if (is-eq mode ALLOWLIST-PHASE)
          (check-phase-allowlist owner phase-id)
          (if (var-get allowlist-enabled)
            (check-global-allowlist owner)
            (ok true)
          )
        )
      )
    )
    ERR-INVALID-ALLOWLIST-MODE
  )
)

(define-private (record-phase-reservation (phase-id uint) (owner principal))
  (if (> phase-id u0)
    (let (
      (phase-stats (get-phase-stats-internal phase-id))
      (wallet-stats (get-phase-wallet-stats-internal phase-id owner))
    )
      (begin
        (set-phase-stats
          phase-id
          (get minted phase-stats)
          (+ (get reserved phase-stats) u1)
        )
        (set-phase-wallet-stats
          phase-id
          owner
          (get minted wallet-stats)
          (+ (get reserved wallet-stats) u1)
        )
        true
      )
    )
    true
  )
)

(define-private (release-phase-reservation (phase-id uint) (owner principal))
  (if (> phase-id u0)
    (let (
      (phase-stats (get-phase-stats-internal phase-id))
      (wallet-stats (get-phase-wallet-stats-internal phase-id owner))
      (phase-reserved (get reserved phase-stats))
      (wallet-reserved (get reserved wallet-stats))
      (next-phase-reserved (if (> phase-reserved u0) (- phase-reserved u1) u0))
      (next-wallet-reserved (if (> wallet-reserved u0) (- wallet-reserved u1) u0))
    )
      (begin
        (set-phase-stats phase-id (get minted phase-stats) next-phase-reserved)
        (set-phase-wallet-stats phase-id owner (get minted wallet-stats) next-wallet-reserved)
        true
      )
    )
    true
  )
)

(define-private (record-phase-mint (phase-id uint) (owner principal))
  (if (> phase-id u0)
    (let (
      (phase-stats (get-phase-stats-internal phase-id))
      (wallet-stats (get-phase-wallet-stats-internal phase-id owner))
      (phase-reserved (get reserved phase-stats))
      (wallet-reserved (get reserved wallet-stats))
      (next-phase-reserved (if (> phase-reserved u0) (- phase-reserved u1) u0))
      (next-wallet-reserved (if (> wallet-reserved u0) (- wallet-reserved u1) u0))
    )
      (begin
        (set-phase-stats
          phase-id
          (+ (get minted phase-stats) u1)
          next-phase-reserved
        )
        (set-phase-wallet-stats
          phase-id
          owner
          (+ (get minted wallet-stats) u1)
          next-wallet-reserved
        )
        true
      )
    )
    true
  )
)

(define-private (record-phase-mint-batch (phase-id uint) (owner principal) (count uint))
  (if (> phase-id u0)
    (let (
      (phase-stats (get-phase-stats-internal phase-id))
      (wallet-stats (get-phase-wallet-stats-internal phase-id owner))
    )
      (begin
        (asserts! (>= (get reserved phase-stats) count) ERR-INVALID-BATCH)
        (asserts! (>= (get reserved wallet-stats) count) ERR-INVALID-BATCH)
        (set-phase-stats
          phase-id
          (+ (get minted phase-stats) count)
          (- (get reserved phase-stats) count)
        )
        (set-phase-wallet-stats
          phase-id
          owner
          (+ (get minted wallet-stats) count)
          (- (get reserved wallet-stats) count)
        )
        (ok true)
      )
    )
    (ok true)
  )
)

(define-private (record-reservation (owner principal) (phase-id uint))
  (let ((stats (get-wallet-stats-internal owner)))
    (begin
      (set-wallet-stats owner (get minted stats) (+ (get reserved stats) u1))
      (record-phase-reservation phase-id owner)
      true
    )
  )
)

(define-private (release-reservation-for (owner principal) (phase-id uint))
  (let (
    (stats (get-wallet-stats-internal owner))
    (reserved (get reserved stats))
    (next-reserved (if (> reserved u0) (- reserved u1) u0))
  )
    (begin
      (set-wallet-stats owner (get minted stats) next-reserved)
      (release-phase-reservation phase-id owner)
      true
    )
  )
)

(define-private (record-mint-for (owner principal) (phase-id uint))
  (let (
    (stats (get-wallet-stats-internal owner))
    (reserved (get reserved stats))
    (next-reserved (if (> reserved u0) (- reserved u1) u0))
  )
    (begin
      (set-wallet-stats owner (+ (get minted stats) u1) next-reserved)
      (record-phase-mint phase-id owner)
      true
    )
  )
)

(define-private (record-mint-batch (owner principal) (phase-id uint) (count uint))
  (let ((stats (get-wallet-stats-internal owner)))
    (begin
      (asserts! (>= (get reserved stats) count) ERR-INVALID-BATCH)
      (set-wallet-stats owner (+ (get minted stats) count) (- (get reserved stats) count))
      (try! (record-phase-mint-batch phase-id owner count))
      (ok true)
    )
  )
)

(define-private (hash-in-list? (hash (buff 32)) (items (list 50 (buff 32))))
  (let ((res (fold hash-in-list-step items { target: hash, found: false })))
    (get found res)
  )
)

(define-private (hash-in-list-step (item (buff 32)) (acc { target: (buff 32), found: bool }))
  (if (get found acc)
    acc
    { target: (get target acc), found: (is-eq item (get target acc)) }
  )
)

(define-private (validate-batch-uniqueness (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) })))
  (let ((res (fold validate-batch-item items { ok: true, seen: (list) })))
    (get ok res)
  )
)

(define-private (validate-batch-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, seen: (list 50 (buff 32)) })
)
  (if (not (get ok acc))
    acc
    (if (hash-in-list? (get hash item) (get seen acc))
      { ok: false, seen: (get seen acc) }
      { ok: true, seen: (unwrap-panic (as-max-len? (append (get seen acc) (get hash item)) u50)) }
    )
  )
)

(define-private (validate-batch-sessions
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
)
  (let ((res (fold validate-batch-session items { ok: true, owner: owner })))
    (get ok res)
  )
)

(define-private (validate-batch-session
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, owner: principal })
)
  (if (get ok acc)
    (if (is-some (map-get? MintSessions { owner: (get owner acc), hash: (get hash item) }))
      acc
      { ok: false, owner: (get owner acc) }
    )
    acc
  )
)

(define-private (get-session-phase (owner principal) (hash (buff 32)))
  (match (map-get? MintSessions { owner: owner, hash: hash })
    session (ok (get phase-id session))
    ERR-NOT-FOUND
  )
)

(define-private (sum-session-mint-price
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
)
  (let ((res (fold sum-session-mint-price-step items { owner: owner, total: u0 })))
    (get total res)
  )
)

(define-private (sum-session-mint-price-step
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { owner: principal, total: uint })
)
  (let (
    (session (unwrap-panic (map-get? MintSessions {
      owner: (get owner acc),
      hash: (get hash item)
    })))
  )
    {
      owner: (get owner acc),
      total: (+ (get total acc) (get mint-price session))
    }
  )
)

(define-private (validate-batch-phase
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
  (phase-id uint)
)
  (let ((res (fold validate-batch-phase-item items { ok: true, owner: owner, phase-id: phase-id })))
    (get ok res)
  )
)

(define-private (validate-batch-phase-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, owner: principal, phase-id: uint })
)
  (if (get ok acc)
    (match (map-get? MintSessions { owner: (get owner acc), hash: (get hash item) })
      session (if (is-eq (get phase-id session) (get phase-id acc))
        acc
        { ok: false, owner: (get owner acc), phase-id: (get phase-id acc) }
      )
      { ok: false, owner: (get owner acc), phase-id: (get phase-id acc) }
    )
    acc
  )
)

(define-private (clear-mint-sessions
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
  (owner principal)
)
  (begin
    (fold clear-mint-session items owner)
    true
  )
)

(define-private (clear-mint-session
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (owner principal)
)
  (begin
    (map-delete MintSessions { owner: owner, hash: (get hash item) })
    owner
  )
)

(define-private (calc-splits (amount uint))
  (let (
    (artist (/ (* amount (var-get artist-bps)) BASIS-POINTS))
    (market (/ (* amount (var-get marketplace-bps)) BASIS-POINTS))
    (operator (/ (* amount (var-get operator-bps)) BASIS-POINTS))
    (assigned (+ artist market operator))
    (remainder (- amount assigned))
  )
    {
      artist: artist,
      market: market,
      operator: (+ operator remainder)
    }
  )
)

(define-private (pay-if-positive-split (amount uint) (recipient principal))
  (if (and (> amount u0) (not (is-eq recipient tx-sender)))
    (stx-transfer? amount tx-sender recipient)
    (ok true)
  )
)

(define-private (pay-splits (amount uint))
  (if (> amount u0)
    (let ((splits (calc-splits amount)))
      (begin
        (try! (pay-if-positive-split (get artist splits) (var-get artist-recipient)))
        (try! (pay-if-positive-split (get market splits) (var-get marketplace-recipient)))
        (try! (pay-if-positive-split (get operator splits) (var-get operator-recipient)))
        (ok true)
      )
    )
    (ok true)
  )
)

(define-private (resolve-token-uri-for-hash (hash (buff 32)) (fallback-uri (string-ascii 256)))
  (match (map-get? RegisteredTokenUris { hash: hash })
    entry (get token-uri entry)
    (let ((default-uri (var-get default-token-uri)))
      (if (> (len default-uri) u0)
        default-uri
        fallback-uri
      )
    )
  )
)

(define-private (record-minted-token (token-id uint) (owner principal) (phase-id uint))
  (let ((index (var-get minted-index-count)))
    (begin
      (map-set MintedIndex { index: index } { token-id: token-id })
      (map-set
        TokenMintContext
        { token-id: token-id }
        { owner: owner, phase-id: phase-id, minted-at: stacks-block-height }
      )
      (var-set minted-index-count (+ index u1))
      true
    )
  )
)

(define-private (resolve-batch-token-uri-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (let (
    (hash (get hash item))
    (resolved-uri (resolve-token-uri-for-hash hash (get token-uri item)))
  )
    (unwrap-panic (as-max-len? (append acc { hash: hash, token-uri: resolved-uri }) u50))
  )
)

(define-private (record-batch-minted-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { next-token-id: uint, next-index: uint, owner: principal, phase-id: uint })
)
  (begin
    (map-set
      MintedIndex
      { index: (get next-index acc) }
      { token-id: (get next-token-id acc) }
    )
    (map-set
      TokenMintContext
      { token-id: (get next-token-id acc) }
      {
        owner: (get owner acc),
        phase-id: (get phase-id acc),
        minted-at: stacks-block-height
      }
    )
    {
      next-token-id: (+ (get next-token-id acc) u1),
      next-index: (+ (get next-index acc) u1),
      owner: (get owner acc),
      phase-id: (get phase-id acc)
    }
  )
)

(define-public (set-operator-admin (operator principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set operator-admin operator)
    (ok true)
  )
)

(define-public (set-finance-admin (finance principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set finance-admin finance)
    (ok true)
  )
)

(define-public (initiate-contract-ownership-transfer (new-owner principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR-PENDING-OWNER)
    (var-set pending-owner (some new-owner))
    (ok true)
  )
)

(define-public (cancel-contract-ownership-transfer)
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set pending-owner none)
    (ok true)
  )
)

(define-public (accept-contract-ownership)
  (begin
    (try! (assert-not-finalized))
    (match (var-get pending-owner)
      pending (begin
        (asserts! (is-eq tx-sender pending) ERR-NOT-AUTHORIZED)
        (var-set contract-owner tx-sender)
        (var-set operator-admin tx-sender)
        (var-set finance-admin tx-sender)
        (var-set pending-owner none)
        (ok true)
      )
      ERR-NO-PENDING-OWNER
    )
  )
)

;; Backwards-compatible alias; now uses two-step transfer semantics.
(define-public (transfer-contract-ownership (new-owner principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR-PENDING-OWNER)
    (var-set pending-owner (some new-owner))
    (ok true)
  )
)

(define-public (set-collection-metadata
  (name (string-ascii 64))
  (symbol (string-ascii 16))
  (base-uri (string-ascii 256))
  (description (string-ascii 256))
  (reveal-at uint)
)
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set collection-name name)
    (var-set collection-symbol symbol)
    (var-set collection-base-uri base-uri)
    (var-set collection-description description)
    (var-set reveal-block reveal-at)
    (ok true)
  )
)

(define-public (set-reservation-expiry-blocks (expiry uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set reservation-expiry-blocks expiry)
    (ok true)
  )
)

(define-public (set-default-token-uri (token-uri (string-ascii 256)))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set default-token-uri token-uri)
    (ok true)
  )
)

(define-public (set-default-dependencies (dependencies (list 50 uint)))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set default-dependencies dependencies)
    (ok true)
  )
)

(define-public (set-registered-token-uri (hash (buff 32)) (token-uri (string-ascii 256)))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (map-set RegisteredTokenUris { hash: hash } { token-uri: token-uri })
    (ok true)
  )
)

(define-public (clear-registered-token-uri (hash (buff 32)))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (map-delete RegisteredTokenUris { hash: hash })
    (ok true)
  )
)

(define-public (set-registered-token-uri-batch
  (entries (list 200 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (fold set-registered-token-uri-entry entries true)
    (ok true)
  )
)

(define-private (set-registered-token-uri-entry
  (entry { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc bool)
)
  (begin
    (map-set
      RegisteredTokenUris
      { hash: (get hash entry) }
      { token-uri: (get token-uri entry) }
    )
    acc
  )
)

(define-public (set-phase
  (phase-id uint)
  (enabled bool)
  (start-block uint)
  (end-block uint)
  (phase-price uint)
  (phase-max-per-wallet uint)
  (phase-max-supply uint)
  (allowlist-mode uint)
)
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (asserts! (> phase-id u0) ERR-INVALID-PHASE)
    (asserts! (or (is-eq end-block u0) (<= start-block end-block)) ERR-INVALID-PHASE)
    (asserts! (is-valid-allowlist-mode allowlist-mode) ERR-INVALID-ALLOWLIST-MODE)
    (map-set
      Phases
      { phase-id: phase-id }
      {
        enabled: enabled,
        start-block: start-block,
        end-block: end-block,
        mint-price: phase-price,
        max-per-wallet: phase-max-per-wallet,
        max-supply: phase-max-supply,
        allowlist-mode: allowlist-mode
      }
    )
    (ok true)
  )
)

(define-public (clear-phase (phase-id uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (asserts! (> phase-id u0) ERR-INVALID-PHASE)
    (map-delete Phases { phase-id: phase-id })
    (if (is-eq (var-get active-phase-id) phase-id)
      (var-set active-phase-id u0)
      true
    )
    (ok true)
  )
)

(define-public (set-active-phase (phase-id uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (if (> phase-id u0)
      (asserts! (is-some (map-get? Phases { phase-id: phase-id })) ERR-INVALID-PHASE)
      true
    )
    (var-set active-phase-id phase-id)
    (ok true)
  )
)

(define-public (set-mint-price (amount uint))
  (begin
    (try! (assert-finance-admin))
    (try! (assert-not-finalized))
    (var-set mint-price amount)
    (ok true)
  )
)

(define-public (set-max-supply (amount uint))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (asserts! (> amount u0) ERR-INVALID-PRICE)
    (asserts! (is-eq (var-get max-supply) u0) ERR-ALREADY-SET)
    (var-set max-supply amount)
    (ok true)
  )
)

(define-public (set-allowlist-enabled (value bool))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set allowlist-enabled value)
    (ok true)
  )
)

(define-public (set-max-per-wallet (amount uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set max-per-wallet amount)
    (ok true)
  )
)

(define-public (set-allowlist (owner principal) (allowance uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (map-set Allowlist { owner: owner } { allowance: allowance })
    (ok true)
  )
)

(define-public (clear-allowlist (owner principal))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (map-delete Allowlist { owner: owner })
    (ok true)
  )
)

(define-public (set-allowlist-batch (entries (list 200 { owner: principal, allowance: uint })))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (fold set-allowlist-entry entries true)
    (ok true)
  )
)

(define-private (set-allowlist-entry (entry { owner: principal, allowance: uint }) (acc bool))
  (begin
    (map-set Allowlist { owner: (get owner entry) } { allowance: (get allowance entry) })
    acc
  )
)

(define-public (set-phase-allowlist (phase-id uint) (owner principal) (allowance uint))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (asserts! (> phase-id u0) ERR-INVALID-PHASE)
    (asserts! (is-some (map-get? Phases { phase-id: phase-id })) ERR-INVALID-PHASE)
    (map-set PhaseAllowlist { phase-id: phase-id, owner: owner } { allowance: allowance })
    (ok true)
  )
)

(define-public (clear-phase-allowlist (phase-id uint) (owner principal))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (asserts! (> phase-id u0) ERR-INVALID-PHASE)
    (map-delete PhaseAllowlist { phase-id: phase-id, owner: owner })
    (ok true)
  )
)

(define-public (set-phase-allowlist-batch
  (phase-id uint)
  (entries (list 200 { owner: principal, allowance: uint }))
)
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (asserts! (> phase-id u0) ERR-INVALID-PHASE)
    (asserts! (is-some (map-get? Phases { phase-id: phase-id })) ERR-INVALID-PHASE)
    (fold set-phase-allowlist-entry entries { phase-id: phase-id })
    (ok true)
  )
)

(define-private (set-phase-allowlist-entry
  (entry { owner: principal, allowance: uint })
  (acc { phase-id: uint })
)
  (begin
    (map-set
      PhaseAllowlist
      { phase-id: (get phase-id acc), owner: (get owner entry) }
      { allowance: (get allowance entry) }
    )
    acc
  )
)

(define-public (set-recipient-editor-access
  (xtrata-contract <xtrata-trait>)
  (editor principal)
  (can-marketplace bool)
  (can-operator bool)
)
  (begin
    (try! (assert-main-xtrata-admin xtrata-contract))
    (try! (assert-not-finalized))
    (if (or can-marketplace can-operator)
      (map-set
        RecipientEditors
        { editor: editor }
        { marketplace: can-marketplace, operator: can-operator }
      )
      (map-delete RecipientEditors { editor: editor })
    )
    (ok true)
  )
)

(define-public (set-artist-recipient (artist principal))
  (begin
    (try! (assert-owner))
    (try! (assert-not-finalized))
    (var-set artist-recipient artist)
    (ok true)
  )
)

(define-public (set-marketplace-recipient (marketplace principal))
  (begin
    (try! (assert-marketplace-recipient-editor))
    (try! (assert-not-finalized))
    (var-set marketplace-recipient marketplace)
    (ok true)
  )
)

(define-public (set-operator-recipient (operator principal))
  (begin
    (try! (assert-operator-recipient-editor))
    (try! (assert-not-finalized))
    (var-set operator-recipient operator)
    (ok true)
  )
)

(define-public (set-recipients (artist principal) (marketplace principal) (operator principal))
  (let (
    (current-artist (var-get artist-recipient))
    (current-marketplace (var-get marketplace-recipient))
    (current-operator (var-get operator-recipient))
  )
    (begin
      (try! (assert-not-finalized))
      (if (not (is-eq artist current-artist))
        (try! (assert-owner))
        true
      )
      (if (not (is-eq marketplace current-marketplace))
        (try! (assert-marketplace-recipient-editor))
        true
      )
      (if (not (is-eq operator current-operator))
        (try! (assert-operator-recipient-editor))
        true
      )
      (var-set artist-recipient artist)
      (var-set marketplace-recipient marketplace)
      (var-set operator-recipient operator)
      (ok true)
    )
  )
)

(define-public (set-splits (artist uint) (marketplace uint) (operator uint))
  (begin
    (try! (assert-finance-admin))
    (try! (assert-not-finalized))
    (asserts! (<= (+ artist marketplace operator) BASIS-POINTS) ERR-INVALID-BPS)
    (var-set artist-bps artist)
    (var-set marketplace-bps marketplace)
    (var-set operator-bps operator)
    (ok true)
  )
)

(define-public (set-paused (value bool))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (var-set paused value)
    (ok true)
  )
)

(define-public (release-reservation (owner principal) (hash (buff 32)))
  (let ((session (map-get? MintSessions { owner: owner, hash: hash })))
    (begin
      (try! (assert-config-admin))
      (try! (assert-not-finalized))
      (asserts! (is-some session) ERR-NOT-FOUND)
      (map-delete MintSessions { owner: owner, hash: hash })
      (var-set reserved-count (- (var-get reserved-count) u1))
      (release-reservation-for owner (get phase-id (unwrap-panic session)))
      (ok true)
    )
  )
)

(define-public (release-expired-reservation (owner principal) (hash (buff 32)))
  (begin
    (try! (assert-config-admin))
    (try! (assert-not-finalized))
    (match (map-get? MintSessions { owner: owner, hash: hash })
      session (let ((expiry (var-get reservation-expiry-blocks)))
        (begin
          (asserts! (> expiry u0) ERR-RESERVATION-NOT-EXPIRED)
          (asserts! (>= stacks-block-height (+ (get created-at session) expiry)) ERR-RESERVATION-NOT-EXPIRED)
          (map-delete MintSessions { owner: owner, hash: hash })
          (var-set reserved-count (- (var-get reserved-count) u1))
          (release-reservation-for owner (get phase-id session))
          (ok true)
        )
      )
      ERR-NOT-FOUND
    )
  )
)

(define-public (cancel-reservation (hash (buff 32)))
  (begin
    (try! (assert-not-finalized))
    (match (map-get? MintSessions { owner: tx-sender, hash: hash })
      session (begin
        (map-delete MintSessions { owner: tx-sender, hash: hash })
        (var-set reserved-count (- (var-get reserved-count) u1))
        (release-reservation-for tx-sender (get phase-id session))
        (ok true)
      )
      ERR-NOT-FOUND
    )
  )
)

(define-private (ensure-mint-session (expected-hash (buff 32)))
  (let (
    (session (map-get? MintSessions { owner: tx-sender, hash: expected-hash }))
    (active (+ (var-get minted-count) (var-get reserved-count)))
    (phase-id (var-get active-phase-id))
  )
    (begin
      (if (is-none session)
        (if (> phase-id u0)
          (let ((phase (try! (assert-phase-active phase-id))))
            (begin
              (asserts! (< active (var-get max-supply)) ERR-MAX-SUPPLY)
              (try! (check-phase-cap phase-id (get max-supply phase)))
              (try! (check-wallet-limit tx-sender))
              (try! (check-phase-wallet-limit tx-sender phase-id (get max-per-wallet phase)))
              (try! (check-allowlist tx-sender phase-id (get allowlist-mode phase)))
              (var-set reserved-count (+ (var-get reserved-count) u1))
              (record-reservation tx-sender phase-id)
              (map-insert
                MintSessions
                { owner: tx-sender, hash: expected-hash }
                {
                  fee-paid: true,
                  phase-id: phase-id,
                  mint-price: (get mint-price phase),
                  created-at: stacks-block-height
                }
              )
              true
            )
          )
          (let ((mode (if (var-get allowlist-enabled) ALLOWLIST-GLOBAL ALLOWLIST-PUBLIC)))
            (begin
              (asserts! (< active (var-get max-supply)) ERR-MAX-SUPPLY)
              (try! (check-wallet-limit tx-sender))
              (try! (check-allowlist tx-sender u0 mode))
              (var-set reserved-count (+ (var-get reserved-count) u1))
              (record-reservation tx-sender u0)
              (map-insert
                MintSessions
                { owner: tx-sender, hash: expected-hash }
                {
                  fee-paid: true,
                  phase-id: u0,
                  mint-price: (var-get mint-price),
                  created-at: stacks-block-height
                }
              )
              true
            )
          )
        )
        true
      )
      (match (map-get? MintSessions { owner: tx-sender, hash: expected-hash })
        stored (ok stored)
        ERR-NOT-FOUND
      )
    )
  )
)

(define-public (mint-begin
  (xtrata-contract <xtrata-trait>)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
)
  (begin
    (try! (assert-core-contract xtrata-contract))
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (try! (ensure-mint-session expected-hash))
    (contract-call? xtrata-contract begin-inscription expected-hash mime total-size total-chunks)
  )
)

(define-public (mint-add-chunk-batch
  (xtrata-contract <xtrata-trait>)
  (hash (buff 32))
  (chunks (list 50 (buff 16384)))
)
  (begin
    (try! (assert-core-contract xtrata-contract))
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (asserts! (is-some (map-get? MintSessions { owner: tx-sender, hash: hash })) ERR-NOT-FOUND)
    (contract-call? xtrata-contract add-chunk-batch hash chunks)
  )
)

(define-public (mint-seal
  (xtrata-contract <xtrata-trait>)
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
)
  (begin
    (try! (assert-core-contract xtrata-contract))
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (match (map-get? MintSessions { owner: tx-sender, hash: expected-hash })
      session (let (
        (resolved-token-uri (resolve-token-uri-for-hash expected-hash token-uri-string))
        (dependencies (var-get default-dependencies))
        (token-id (if (> (len dependencies) u0)
          (try! (contract-call? xtrata-contract seal-recursive expected-hash resolved-token-uri dependencies))
          (try! (contract-call? xtrata-contract seal-inscription expected-hash resolved-token-uri))
        ))
      )
        (begin
          (try! (pay-splits (get mint-price session)))
          (map-delete MintSessions { owner: tx-sender, hash: expected-hash })
          (var-set reserved-count (- (var-get reserved-count) u1))
          (var-set minted-count (+ (var-get minted-count) u1))
          (record-mint-for tx-sender (get phase-id session))
          (record-minted-token token-id tx-sender (get phase-id session))
          (ok token-id)
        )
      )
      ERR-NOT-FOUND
    )
  )
)

(define-public (mint-seal-batch
  (xtrata-contract <xtrata-trait>)
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (begin
    (try! (assert-core-contract xtrata-contract))
    (try! (assert-not-finalized))
    (try! (assert-not-paused))
    (asserts! (is-eq (len (var-get default-dependencies)) u0) ERR-DEFAULT-DEPENDENCIES-BATCH)
    (asserts! (> (len items) u0) ERR-INVALID-BATCH)
    (asserts! (validate-batch-uniqueness items) ERR-INVALID-BATCH)
    (asserts! (validate-batch-sessions items tx-sender) ERR-NOT-FOUND)
    (let (
      (first-item (unwrap! (element-at items u0) ERR-INVALID-BATCH))
      (phase-id (try! (get-session-phase tx-sender (get hash first-item))))
      (total-mint-price (sum-session-mint-price items tx-sender))
      (resolved-items (fold resolve-batch-token-uri-item items (list)))
    )
      (begin
        (asserts! (validate-batch-phase items tx-sender phase-id) ERR-INVALID-BATCH)
        (let ((result (try! (contract-call? xtrata-contract seal-inscription-batch resolved-items))))
          (begin
            (asserts! (is-eq (get count result) (len items)) ERR-INVALID-BATCH)
            (try! (pay-splits total-mint-price))
            (clear-mint-sessions items tx-sender)
            (var-set reserved-count (- (var-get reserved-count) (len items)))
            (var-set minted-count (+ (var-get minted-count) (len items)))
            (try! (record-mint-batch tx-sender phase-id (len items)))
            (let ((index-state (fold record-batch-minted-item resolved-items {
              next-token-id: (get start result),
              next-index: (var-get minted-index-count),
              owner: tx-sender,
              phase-id: phase-id
            })))
              (var-set minted-index-count (get next-index index-state))
            )
            (ok result)
          )
        )
      )
    )
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
  (let (
    (chunk-count (len chunks))
    (resolved-token-uri (resolve-token-uri-for-hash expected-hash token-uri-string))
  )
    (begin
      (try! (assert-core-contract xtrata-contract))
      (try! (assert-not-finalized))
      (try! (assert-not-paused))
      (try! (assert-small-upload-shape total-size chunk-count))
      (let ((session (try! (ensure-mint-session expected-hash))))
        (match (try! (contract-call? xtrata-contract begin-or-get expected-hash mime total-size chunk-count))
          existing-id ERR-DUPLICATE-HASH
          (begin
            (try! (contract-call? xtrata-contract add-chunk-batch expected-hash chunks))
            (let ((token-id (match dependencies
              deps
                (try! (contract-call? xtrata-contract seal-recursive expected-hash resolved-token-uri deps))
              (try! (contract-call? xtrata-contract seal-inscription expected-hash resolved-token-uri))
            )))
              (begin
                (try! (pay-splits (get mint-price session)))
                (map-delete MintSessions { owner: tx-sender, hash: expected-hash })
                (var-set reserved-count (- (var-get reserved-count) u1))
                (var-set minted-count (+ (var-get minted-count) u1))
                (record-mint-for tx-sender (get phase-id session))
                (record-minted-token token-id tx-sender (get phase-id session))
                (ok token-id)
              )
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
  (let ((defaults (var-get default-dependencies)))
    (if (> (len defaults) u0)
      (mint-small-single-tx-internal
        xtrata-contract
        expected-hash
        mime
        total-size
        chunks
        token-uri-string
        (some defaults)
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
  (let ((defaults (var-get default-dependencies)))
    (begin
      (asserts! (is-eq (len defaults) u0) ERR-DEFAULT-DEPENDENCIES-BATCH)
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
  )
)

(define-public (finalize)
  (begin
    (try! (assert-owner))
    (asserts! (not (var-get finalized)) ERR-FINALIZED)
    (asserts! (> (var-get max-supply) u0) ERR-NOT-FINALIZABLE)
    (asserts! (is-eq (var-get reserved-count) u0) ERR-NOT-FINALIZABLE)
    (asserts! (is-eq (var-get minted-count) (var-get max-supply)) ERR-NOT-FINALIZABLE)
    (var-set finalized true)
    (ok true)
  )
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-pending-owner)
  (ok (var-get pending-owner))
)

(define-read-only (get-operator-admin)
  (ok (var-get operator-admin))
)

(define-read-only (get-finance-admin)
  (ok (var-get finance-admin))
)

(define-read-only (get-mint-price)
  (ok (var-get mint-price))
)

(define-read-only (get-max-supply)
  (ok (var-get max-supply))
)

(define-read-only (get-minted-count)
  (ok (var-get minted-count))
)

(define-read-only (get-reserved-count)
  (ok (var-get reserved-count))
)

(define-read-only (get-finalized)
  (ok (var-get finalized))
)

(define-read-only (get-allowlist-enabled)
  (ok (var-get allowlist-enabled))
)

(define-read-only (get-max-per-wallet)
  (ok (var-get max-per-wallet))
)

(define-read-only (get-active-phase)
  (ok (var-get active-phase-id))
)

(define-read-only (get-phase (phase-id uint))
  (map-get? Phases { phase-id: phase-id })
)

(define-read-only (get-phase-stats (phase-id uint))
  (ok (get-phase-stats-internal phase-id))
)

(define-read-only (get-allowlist-entry (owner principal))
  (map-get? Allowlist { owner: owner })
)

(define-read-only (get-phase-allowlist-entry (phase-id uint) (owner principal))
  (map-get? PhaseAllowlist { phase-id: phase-id, owner: owner })
)

(define-read-only (get-wallet-stats (owner principal))
  (ok (get-wallet-stats-internal owner))
)

(define-read-only (get-phase-wallet-stats (phase-id uint) (owner principal))
  (ok (get-phase-wallet-stats-internal phase-id owner))
)

(define-read-only (get-reservation (owner principal) (hash (buff 32)))
  (map-get? MintSessions { owner: owner, hash: hash })
)

(define-read-only (get-reservation-expiry-blocks)
  (ok (var-get reservation-expiry-blocks))
)

(define-read-only (get-default-token-uri)
  (ok (var-get default-token-uri))
)

(define-read-only (get-default-dependencies)
  (ok (var-get default-dependencies))
)

(define-read-only (get-registered-token-uri (hash (buff 32)))
  (map-get? RegisteredTokenUris { hash: hash })
)

(define-read-only (get-recipients)
  (ok {
    artist: (var-get artist-recipient),
    marketplace: (var-get marketplace-recipient),
    operator: (var-get operator-recipient)
  })
)

(define-read-only (get-recipient-editor-access (editor principal))
  (ok (get-recipient-editor-access-internal editor))
)

(define-read-only (get-splits)
  (ok {
    artist: (var-get artist-bps),
    marketplace: (var-get marketplace-bps),
    operator: (var-get operator-bps)
  })
)

(define-read-only (get-collection-metadata)
  (ok {
    name: (var-get collection-name),
    symbol: (var-get collection-symbol),
    base-uri: (var-get collection-base-uri),
    description: (var-get collection-description),
    reveal-block: (var-get reveal-block)
  })
)

(define-read-only (get-minted-index-count)
  (ok (var-get minted-index-count))
)

(define-read-only (get-minted-id (index uint))
  (map-get? MintedIndex { index: index })
)

(define-read-only (get-token-mint-context (token-id uint))
  (map-get? TokenMintContext { token-id: token-id })
)

(define-read-only (get-locked-core-contract)
  (ok ALLOWED-XTRATA-CONTRACT)
)

(define-read-only (get-max-small-mint-chunks)
  (ok MAX-SMALL-MINT-CHUNKS)
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
