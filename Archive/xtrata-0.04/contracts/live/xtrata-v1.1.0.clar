;; xtrata-v1.1.0
;;
;; Core posture (v1.1.0):
;; 1) Open participation: anyone can inscribe (fees apply) once unpaused.
;; 2) Content-addressed + canonical: a given final-hash can be sealed at most once.
;;    - HashToId provides on-chain lookup (final-hash -> canonical token-id)
;;    - begin-inscription rejects already-sealed hashes (early duplicate detection)
;;    - seal rejects already-sealed hashes (race-safety)
;; 3) Content is immutable once sealed (no post-mint edits, no mutable pointers tied to an id).
;; 4) Creator is immutable provenance; owner can transfer.
;; 5) SIP-009 compatible: standard NFT interfaces for wallet/indexer interoperability.
;; 6) Admin can: set fee unit (bounded), set royalty recipient, pause/unpause, transfer admin ownership.
;; 7) Sealing requires ALL declared chunks uploaded (current-index == total-chunks) and hash verified.
;; 8) Upload sessions are start-or-resume and expire after inactivity (stacks-block-height based):
;;    - begin-inscription starts/resumes {uploader, file-hash} uploads
;;    - begin-or-get returns canonical token-id if already sealed, else starts/resumes upload
;;    - expired uploads can be permissionlessly purged in batches
;;    - abandon-upload marks the session expired so chunks can be purged immediately
;; 9) Dependencies must already exist at seal time (no forward refs).
;; 10) Pause is a safety brake on inscription writes only:
;;     - pause stops begin-inscription, begin-or-get, add-chunk-batch, sealing
;;     - pause does NOT stop transfers or read-only access
;; 11) Hard caps: total-chunks <= 2048 and total-size <= 32 MiB.
;; 12) Read-only batch chunk reader speeds client reconstruction.
;; 13) Default paused on deploy; only the contract owner can inscribe while paused.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 TRAIT (IMPLEMENT FOR WALLET/INDEXER COMPATIBILITY) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; [LOCAL / CLARINET]
 ;; (impl-trait .sip009-nft-trait.nft-trait)
 ;; (use-trait nft-trait .sip009-nft-trait.nft-trait)

;; [TESTNET]
;; (impl-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.nft-trait.nft-trait)
;; (use-trait nft-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.nft-trait.nft-trait)

;; [MAINNET]
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ASSET DEFINITION ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-non-fungible-token xtrata-inscription uint)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ERROR CODES ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-NOT-AUTHORIZED     (err u100))
(define-constant ERR-NOT-FOUND          (err u101))
(define-constant ERR-INVALID-BATCH      (err u102))
(define-constant ERR-HASH-MISMATCH      (err u103))
(define-constant ERR-INVALID-URI        (err u107))
(define-constant ERR-PAUSED             (err u109))
(define-constant ERR-INVALID-FEE        (err u110))
(define-constant ERR-DEPENDENCY-MISSING (err u111))
(define-constant ERR-EXPIRED            (err u112))
(define-constant ERR-NOT-EXPIRED        (err u113))
(define-constant ERR-DUPLICATE          (err u114))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CONSTANTS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant MAX-BATCH-SIZE u50)
(define-constant MAX-SEAL-BATCH-SIZE u50)
(define-constant CHUNK-SIZE u16384)
;; Hard caps to keep uploads finishable within expiry windows.
(define-constant MAX-TOTAL-CHUNKS u2048)
(define-constant MAX-TOTAL-SIZE (* MAX-TOTAL-CHUNKS CHUNK-SIZE))

;; Fee bounds (microSTX): 0.001 STX .. 1.0 STX
(define-constant FEE-MIN u1000)
(define-constant FEE-MAX u1000000)

;; Upload expiry (~30 days at 10-min block cadence)
(define-constant UPLOAD-EXPIRY-BLOCKS u4320)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SVG (COMPATIBLE / SAFE) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant SVG-STATIC
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><circle cx='25' cy='25' r='20' fill='none' stroke='#6366f1' stroke-width='4'/><circle cx='25' cy='25' r='12' fill='none' stroke='#ec4899' stroke-width='4'/><circle cx='25' cy='25' r='5' fill='#f97316'/></svg>"
)

;; Precomputed base64(SVG-STATIC) - MUST be single line in Clarity
(define-constant SVG-STATIC-B64
  "PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA1MCA1MCc+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMjAnIGZpbGw9J25vbmUnIHN0cm9rZT0nIzYzNjZmMScgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMTInIGZpbGw9J25vbmUnIHN0cm9rZT0nI2VjNDg5OScgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nNScgZmlsbD0nI2Y5NzMxNicvPjwvc3ZnPg=="
)

(define-constant SVG-DATAURI-PREFIX "data:image/svg+xml;base64,")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- DATA VARS (ADMIN + FEES + PAUSE) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-data-var contract-owner principal tx-sender)

(define-data-var next-id uint u0)
(define-data-var royalty-recipient principal tx-sender)

;; Single pricing "knob" (microSTX), bounded for predictability
;; Baseline 0.1 STX = 100_000 microSTX
(define-data-var fee-unit uint u100000)

;; Pause switch (admin adjustable)
;; IMPORTANT: pause blocks inscription writes for non-owners; transfers and reads remain available.
;; Default is paused so the owner can gate initial inscriptions.
(define-data-var paused bool true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- TOKEN URI STORAGE ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-map TokenURIs uint (string-ascii 256))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- DEDUPE INDEX (NEW) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Canonical mapping: sealed content hash -> token-id
(define-map HashToId (buff 32) uint)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- STORAGE ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-map InscriptionMeta uint
  {
    owner: principal,
    creator: principal,
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    sealed: bool,
    final-hash: (buff 32)
  }
)

(define-map InscriptionDependencies uint (list 50 uint))

(define-map UploadState
  { owner: principal, hash: (buff 32) }
  {
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    current-index: uint,
    running-hash: (buff 32),
    last-touched: uint,
    purge-index: uint
  }
)

(define-map Chunks { context: (buff 32), creator: principal, index: uint } (buff 16384))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- INTERNAL HELPERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-private (assert-inscription-allowed)
  (begin
    (asserts!
      (or (not (var-get paused)) (is-eq tx-sender (var-get contract-owner)))
      ERR-PAUSED
    )
    (ok true)
  )
)

(define-private (upload-expired?
  (state {
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    current-index: uint,
    running-hash: (buff 32),
    last-touched: uint,
    purge-index: uint
  })
)
  (>= stacks-block-height (+ (get last-touched state) UPLOAD-EXPIRY-BLOCKS))
)

(define-private (assert-not-expired
  (state {
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    current-index: uint,
    running-hash: (buff 32),
    last-touched: uint,
    purge-index: uint
  })
)
  (begin
    (asserts! (not (upload-expired? state)) ERR-EXPIRED)
    (ok true)
  )
)

(define-private (validate-purge-indexes (indexes (list 50 uint)) (start uint) (total uint))
  (let ((res (fold validate-purge-index indexes { ok: true, expected: start, total: total })))
    (get ok res)
  )
)

(define-private (validate-purge-index (index uint) (acc { ok: bool, expected: uint, total: uint }))
  (if (get ok acc)
    (if (and (is-eq index (get expected acc)) (< index (get total acc)))
      { ok: true, expected: (+ index u1), total: (get total acc) }
      { ok: false, expected: (get expected acc), total: (get total acc) }
    )
    acc
  )
)

(define-private (purge-expired-chunk (index uint) (ctx { owner: principal, hash: (buff 32) }))
  (begin
    (map-delete Chunks { context: (get hash ctx), creator: (get owner ctx), index: index })
    ctx
  )
)

;; Return type MUST be consistent: (response bool uint)
(define-private (maybe-pay (amount uint))
  (if (> amount u0)
    (if (is-eq tx-sender (var-get royalty-recipient))
      (ok true)
      (stx-transfer? amount tx-sender (var-get royalty-recipient))
    )
    (ok true)
  )
)

;; Cheaper "existence" rule for sequential IDs (no burns):
;; Dependency exists iff dep-id < next-id at the time of sealing.
(define-private (dep-exists? (id uint))
  (< id (var-get next-id))
)

(define-private (validate-dependencies (deps (list 50 uint)))
  (let ((res (fold validate-dep deps { ok: true })))
    (get ok res)
  )
)

(define-private (validate-dep (id uint) (acc { ok: bool }))
  (if (get ok acc)
    (if (dep-exists? id)
      { ok: true }
      { ok: false }
    )
    acc
  )
)

(define-private (append-chunk-batch
  (index uint)
  (acc {
    context: (buff 32),
    creator: principal,
    chunks: (list 50 (optional (buff 16384)))
  })
)
  (let (
    (chunk (map-get? Chunks {
      context: (get context acc),
      creator: (get creator acc),
      index: index
    }))
    (next (default-to (get chunks acc) (as-max-len? (append (get chunks acc) chunk) u50)))
  )
    {
      context: (get context acc),
      creator: (get creator acc),
      chunks: next
    }
  )
)

;; ceil(total-chunks / MAX-BATCH-SIZE)
(define-private (num-batches (total-chunks uint))
  (let (
    (q (/ total-chunks MAX-BATCH-SIZE))
    (r (mod total-chunks MAX-BATCH-SIZE))
  )
    (if (is-eq r u0) q (+ q u1))
  )
)

(define-private (hash-in-list? (hash (buff 32)) (items (list 50 (buff 32))))
  (let ((res (fold hash-in-list-step items { hash: hash, found: false })))
    (get found res)
  )
)

(define-private (hash-in-list-step (item (buff 32)) (acc { hash: (buff 32), found: bool }))
  (if (get found acc)
    acc
    { hash: (get hash acc), found: (is-eq item (get hash acc)) }
  )
)

(define-private (collect-unique-hash
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc { ok: bool, seen: (list 50 (buff 32)) })
)
  (if (get ok acc)
    (let ((hash (get hash item)) (seen (get seen acc)))
      (if (hash-in-list? hash seen)
        { ok: false, seen: seen }
        {
          ok: true,
          seen: (unwrap-panic (as-max-len? (append seen hash) u50))
        }
      )
    )
    acc
  )
)

(define-private (validate-batch-uniqueness
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (let ((res (fold collect-unique-hash items { ok: true, seen: (list) })))
    (get ok res)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 REQUIRED FUNCTIONS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-last-token-id)
  (if (is-eq (var-get next-id) u0)
    (ok u0)
    (ok (- (var-get next-id) u1))
  )
)

(define-read-only (get-next-token-id)
  (ok (var-get next-id))
)

(define-read-only (get-token-uri (id uint))
  (if (is-some (nft-get-owner? xtrata-inscription id))
    (ok (match (map-get? TokenURIs id)
          uri (some uri)
          none))
    (ok none)
  )
)

(define-read-only (get-token-uri-raw (id uint))
  (map-get? TokenURIs id)
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? xtrata-inscription id))
)

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    ;; IMPORTANT: transfers are NOT paused
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (some sender) (nft-get-owner? xtrata-inscription id)) ERR-NOT-AUTHORIZED)

    (try! (nft-transfer? xtrata-inscription id sender recipient))

    ;; meta should exist for minted tokens; enforce (safer than silently ignoring)
    (let ((meta (unwrap! (map-get? InscriptionMeta id) ERR-NOT-FOUND)))
      (map-set InscriptionMeta id (merge meta { owner: recipient }))
    )

    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- OPTIONAL READ-ONLY HELPERS (ON-CHAIN SVG ACCESS) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-svg (id uint))
  (if (is-some (nft-get-owner? xtrata-inscription id))
    (ok (some SVG-STATIC))
    (ok none)
  )
)

(define-read-only (get-svg-data-uri (id uint))
  (if (is-some (nft-get-owner? xtrata-inscription id))
    (ok (some (concat SVG-DATAURI-PREFIX SVG-STATIC-B64)))
    (ok none)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- DEDUPE READ-ONLY (NEW) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Returns (some token-id) if this hash is already sealed, else none.
(define-read-only (get-id-by-hash (hash (buff 32)))
  (map-get? HashToId hash)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN FUNCTIONS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (set-royalty-recipient (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set royalty-recipient recipient)
    (ok true)
  )
)

;; One-knob fee model:
;; - begin fee  = fee-unit
;; - seal fee   = fee-unit * (1 + ceil(total-chunks / 50))
;;
;; Governance constraints:
;; - absolute bounds: [0.001, 1.0] STX
;; - bounded change per update:
;;    * increases: new <= old*2
;;    * decreases: new >= old/10
(define-public (set-fee-unit (new-fee uint))
  (let ((old (var-get fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (asserts! (>= new-fee FEE-MIN) ERR-INVALID-FEE)
      (asserts! (<= new-fee FEE-MAX) ERR-INVALID-FEE)

      ;; bounded change
      (asserts! (<= new-fee (* old u2)) ERR-INVALID-FEE)   ;; max 2x up
      (asserts! (>= new-fee (/ old u10)) ERR-INVALID-FEE)  ;; max 10x down

      (var-set fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-paused (value bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set paused value)
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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CORE LOGIC ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; begin-or-get (NEW):
;; - If hash is already sealed: return (ok (some canonical-id))
;; - Else: start/resume upload (via begin-inscription) and return (ok none)
;;
;; This gives third parties a single call to either start/resume OR get canonical id.
(define-public (begin-or-get
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
)
  (begin
    (try! (assert-inscription-allowed))
    (match (map-get? HashToId expected-hash)
      existing-id (ok (some existing-id))
      (begin
        (try! (begin-inscription expected-hash mime total-size total-chunks))
        (ok none)
      )
    )
  )
)

;; Start-or-resume:
;; - If no UploadState exists for {tx-sender, expected-hash}, create it and charge begin fee.
;; - If it already exists, treat as resume:
;;   - do NOT charge begin fee again
;;   - require parameters match the original declaration
;;
;; v1.0.2: hard dedupe early detection:
;; - reject begin if hash is already sealed (HashToId exists)
(define-public (begin-inscription (expected-hash (buff 32)) (mime (string-ascii 64)) (total-size uint) (total-chunks uint))
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (> total-chunks u0) ERR-INVALID-BATCH)
    (asserts! (<= total-chunks MAX-TOTAL-CHUNKS) ERR-INVALID-BATCH)
    (asserts! (<= total-size MAX-TOTAL-SIZE) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* total-chunks CHUNK-SIZE)) ERR-INVALID-BATCH)

    ;; NEW: prevent wasted uploads / spam duplicates
    (asserts! (is-none (map-get? HashToId expected-hash)) ERR-DUPLICATE)

    (match (map-get? UploadState { owner: tx-sender, hash: expected-hash })
      state
        (begin
          (try! (assert-not-expired state))
          ;; Resume path: parameters must match original session (no silent mutation)
          (asserts! (is-eq (get mime-type state) mime) ERR-INVALID-BATCH)
          (asserts! (is-eq (get total-size state) total-size) ERR-INVALID-BATCH)
          (asserts! (is-eq (get total-chunks state) total-chunks) ERR-INVALID-BATCH)
          (map-set UploadState
            { owner: tx-sender, hash: expected-hash }
            (merge state { last-touched: stacks-block-height })
          )
          (ok true)
        )
      (begin
        ;; New session path: pay begin fee once
        (try! (maybe-pay (var-get fee-unit)))

        (map-insert UploadState
          { owner: tx-sender, hash: expected-hash }
          {
            mime-type: mime,
            total-size: total-size,
            total-chunks: total-chunks,
            current-index: u0,
            running-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
            last-touched: stacks-block-height,
            purge-index: u0
          }
        )
        (ok true)
      )
    )
  )
)

;; Optional uploader-only cleanup (not required for correctness).
;; Marks upload expired so anyone can purge chunks immediately.
(define-public (abandon-upload (expected-hash (buff 32)))
  (let (
    (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: expected-hash }) ERR-NOT-FOUND))
    (expired-height (if (>= stacks-block-height UPLOAD-EXPIRY-BLOCKS)
      (- stacks-block-height UPLOAD-EXPIRY-BLOCKS)
      u0))
  )
    (begin
      (try! (assert-inscription-allowed))
      ;; Mark expired so anyone can purge immediately.
      (map-set UploadState
        { owner: tx-sender, hash: expected-hash }
        (merge state { last-touched: expired-height, purge-index: u0 })
      )
      (ok true)
    )
  )
)

(define-public (purge-expired-chunk-batch (hash (buff 32)) (owner principal) (indexes (list 50 uint)))
  (let (
    (state (unwrap! (map-get? UploadState { owner: owner, hash: hash }) ERR-NOT-FOUND))
    (batch-len (len indexes))
    (start (get purge-index state))
    (total (get total-chunks state))
  )
    (begin
      (asserts! (upload-expired? state) ERR-NOT-EXPIRED)
      (asserts! (> batch-len u0) ERR-INVALID-BATCH)
      (asserts! (<= batch-len MAX-BATCH-SIZE) ERR-INVALID-BATCH)
      (asserts! (validate-purge-indexes indexes start total) ERR-INVALID-BATCH)

      (fold purge-expired-chunk indexes { owner: owner, hash: hash })

      (let ((next (+ start batch-len)))
        (if (>= next total)
          (begin
            (map-delete UploadState { owner: owner, hash: hash })
            (ok true)
          )
          (begin
            (map-set UploadState
              { owner: owner, hash: hash }
              (merge state { purge-index: next })
            )
            (ok true)
          )
        )
      )
    )
  )
)

(define-public (add-chunk-batch (hash (buff 32)) (chunks (list 50 (buff 16384))))
  (begin
    (try! (assert-inscription-allowed))
    (let (
      (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: hash }) ERR-NOT-FOUND))
      (start-idx (get current-index state))
      (start-hash (get running-hash state))
      (batch-len (len chunks))
      (total (get total-chunks state))
    )
      (begin
        (try! (assert-not-expired state))
        (asserts! (> batch-len u0) ERR-INVALID-BATCH)
        (asserts! (<= batch-len MAX-BATCH-SIZE) ERR-INVALID-BATCH)
        (asserts! (<= (+ start-idx batch-len) total) ERR-INVALID-BATCH)

        (let ((result (fold process-chunk chunks
          { idx: start-idx, run-hash: start-hash, target-hash: hash, creator: tx-sender })))
          (map-set UploadState
            { owner: tx-sender, hash: hash }
            (merge state {
              current-index: (get idx result),
              running-hash: (get run-hash result),
              last-touched: stacks-block-height
            })
          )
          (ok true)
        )
      )
    )
  )
)

(define-private (process-chunk
  (data (buff 16384))
  (ctx { idx: uint, run-hash: (buff 32), target-hash: (buff 32), creator: principal })
)
  (let (
    (current-idx (get idx ctx))
    (current-hash (get run-hash ctx))
    (target-hash (get target-hash ctx))
    (creator (get creator ctx))
    (next-hash (sha256 (concat current-hash data)))
  )
    (map-set Chunks { context: target-hash, creator: creator, index: current-idx } data)
    { idx: (+ current-idx u1), run-hash: next-hash, target-hash: target-hash, creator: creator }
  )
)

(define-private (seal-validate
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
)
  (let (
    (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: expected-hash }) ERR-NOT-FOUND))
    (final-hash (get running-hash state))
    (chunks (get total-chunks state))
    (batches (num-batches chunks))
    ;; seal fee = fee-unit * (1 + batches)
    (seal-fee (* (var-get fee-unit) (+ u1 batches)))
  )
    (begin
      (try! (assert-not-expired state))
      (asserts! (is-eq (get current-index state) chunks) ERR-INVALID-BATCH)
      (asserts! (is-eq final-hash expected-hash) ERR-HASH-MISMATCH)
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (asserts! (is-none (map-get? HashToId expected-hash)) ERR-DUPLICATE)
      (ok { state: state, fee: seal-fee })
    )
  )
)

(define-private (seal-commit
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (new-id uint)
  (state {
    mime-type: (string-ascii 64),
    total-size: uint,
    total-chunks: uint,
    current-index: uint,
    running-hash: (buff 32),
    last-touched: uint,
    purge-index: uint
  })
)
  (begin
    (asserts! (is-none (map-get? HashToId expected-hash)) ERR-DUPLICATE)
    (try! (nft-mint? xtrata-inscription new-id tx-sender))

    (map-insert InscriptionMeta new-id {
      owner: tx-sender,
      creator: tx-sender,
      mime-type: (get mime-type state),
      total-size: (get total-size state),
      total-chunks: (get total-chunks state),
      sealed: true,
      final-hash: (get running-hash state)
    })

    (map-insert HashToId expected-hash new-id)

    (map-set TokenURIs new-id token-uri-string)

    (map-delete UploadState { owner: tx-sender, hash: expected-hash })
    (var-set next-id (+ new-id u1))

    (ok new-id)
  )
)

(define-private (seal-internal
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (new-id uint)
)
  (begin
    (try! (assert-inscription-allowed))
    (let (
      (validation (try! (seal-validate expected-hash token-uri-string)))
      (state (get state validation))
      (seal-fee (get fee validation))
    )
      (try! (maybe-pay seal-fee))
      (seal-commit expected-hash token-uri-string new-id state)
    )
  )
)

(define-private (calc-batch-fee
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc (response uint uint))
)
  (let (
    (current (try! acc))
    (validation (try! (seal-validate (get hash item) (get token-uri item))))
  )
    (ok (+ current (get fee validation)))
  )
)

(define-private (seal-batch-item
  (item { hash: (buff 32), token-uri: (string-ascii 256) })
  (acc (response { idx: uint, start: uint } uint))
)
  (let (
    (current (try! acc))
    (hash (get hash item))
    (token-uri (get token-uri item))
    (validation (try! (seal-validate hash token-uri)))
    (state (get state validation))
    (new-id (+ (get start current) (get idx current)))
  )
    (begin
      (try! (seal-commit hash token-uri new-id state))
      (ok { idx: (+ (get idx current) u1), start: (get start current) })
    )
  )
)

(define-public (seal-inscription (expected-hash (buff 32)) (token-uri-string (string-ascii 256)))
  (seal-internal expected-hash token-uri-string (var-get next-id))
)

(define-public (seal-inscription-batch
  (items (list 50 { hash: (buff 32), token-uri: (string-ascii 256) }))
)
  (begin
    (try! (assert-inscription-allowed))
    (let ((count (len items)))
      (asserts! (> count u0) ERR-INVALID-BATCH)
      (asserts! (<= count MAX-SEAL-BATCH-SIZE) ERR-INVALID-BATCH)
      (asserts! (validate-batch-uniqueness items) ERR-DUPLICATE)
      (let (
        (start-id (var-get next-id))
        (total-fee (try! (fold calc-batch-fee items (ok u0))))
      )
        (try! (maybe-pay total-fee))
        (let ((result (try! (fold seal-batch-item items (ok { idx: u0, start: start-id }))))) 
          (ok { start: start-id, count: (get idx result) })
        )
      )
    )
  )
)

(define-public (seal-recursive (expected-hash (buff 32)) (token-uri-string (string-ascii 256)) (dependencies (list 50 uint)))
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (validate-dependencies dependencies) ERR-DEPENDENCY-MISSING)
    (let ((new-id (var-get next-id)))
      (map-set InscriptionDependencies new-id dependencies)
      (seal-internal expected-hash token-uri-string new-id)
    )
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- READERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-inscription-meta (id uint))
  (map-get? InscriptionMeta id)
)

(define-read-only (inscription-exists (id uint))
  (ok (is-some (nft-get-owner? xtrata-inscription id)))
)

(define-read-only (get-inscription-hash (id uint))
  (match (map-get? InscriptionMeta id)
    meta (some (get final-hash meta))
    none
  )
)

(define-read-only (get-inscription-creator (id uint))
  (match (map-get? InscriptionMeta id)
    meta (some (get creator meta))
    none
  )
)

(define-read-only (get-inscription-size (id uint))
  (match (map-get? InscriptionMeta id)
    meta (some (get total-size meta))
    none
  )
)

(define-read-only (get-inscription-chunks (id uint))
  (match (map-get? InscriptionMeta id)
    meta (some (get total-chunks meta))
    none
  )
)

(define-read-only (is-inscription-sealed (id uint))
  (match (map-get? InscriptionMeta id)
    meta (some (get sealed meta))
    none
  )
)

(define-read-only (get-chunk (id uint) (index uint))
  (match (map-get? InscriptionMeta id)
    meta
      (map-get? Chunks {
        context: (get final-hash meta),
        creator: (get creator meta),
        index: index
      })
    none
  )
)

(define-read-only (get-chunk-batch (id uint) (indexes (list 50 uint)))
  (match (map-get? InscriptionMeta id)
    meta
      (let ((acc (fold append-chunk-batch indexes {
        context: (get final-hash meta),
        creator: (get creator meta),
        chunks: (list)
      })))
        (get chunks acc)
      )
    (list)
  )
)

(define-read-only (get-dependencies (id uint))
  (match (map-get? InscriptionDependencies id)
    deps deps
    (list)
  )
)

(define-read-only (get-upload-state (expected-hash (buff 32)) (owner principal))
  (map-get? UploadState { owner: owner, hash: expected-hash })
)

(define-read-only (get-pending-chunk (hash (buff 32)) (creator principal) (index uint))
  (map-get? Chunks { context: hash, creator: creator, index: index })
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN READERS (OPTIONAL) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-admin)
  (ok (var-get contract-owner))
)

(define-read-only (get-royalty-recipient)
  (ok (var-get royalty-recipient))
)

(define-read-only (get-fee-unit)
  (ok (var-get fee-unit))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
