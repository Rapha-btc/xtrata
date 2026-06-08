;; xtrata-v3.4.0  (dependency-free core, trait-based migration)
;;
;; A self-contained core with NO STATIC dependency on any other xtrata contract.
;; It still supports MIGRATION of v1/v2 inscriptions, but via a TRAIT parameter
;; (legacy-inscription-trait) instead of hardcoded .xtrata-* references. That keeps
;; the contract deployable on its own while letting any caller port a legacy token
;; from any contract implementing the trait (e.g. xtrata-v1-1-1, xtrata-v2-1-0).
;;
;; Compared to v3.2.1 this core removes the small-mint helper (single-tx minting is
;; core-native; use mint-single-tx) and replaces the static migrate-from-v1/v2 calls
;; and the (as-contract tx-sender) escrow constant. The escrow recipient is the
;; contract's own principal via the Clarity 4 keyword `current-contract`.
;;
;; MIGRATION MODEL (faithful, same-id):
;;   - caller re-supplies the inscription content; the core recomputes the rolling
;;     hash and verifies it equals the caller-declared expected-hash
;;   - caller must own the legacy token; the legacy NFT is escrowed into this contract
;;   - the source contract must be explicitly approved by the contract owner
;;   - a v3 token is minted at the SAME id, content stored locally, provenance recorded
;;   - migrated tokens are first-class: usable as parents and fully reconstructable
;;   - one-shot set-next-id sets the native-mint start ABOVE the legacy id range so
;;     native mints never collide with same-id migrated tokens
;; Native (non-migrated) token ids start at the configured offset and increment by one.
;;
;; Core posture (v3.3.0):
;; 1) Open participation: anyone can inscribe (fees apply) once unpaused.
;; 2) Content-addressed + advisory lookup: duplicate content can mint new tokens.
;;    - HashToId records the first sealed/minted token for a final-hash
;;    - get-id-by-hash returns that first-seen token-id
;;    - begin/seal/mint/migration never block or return an existing token only
;;      because the hash already exists
;; 3) Content is immutable once sealed (no post-mint edits, no mutable pointers tied to an id).
;; 4) Creator is immutable provenance; owner can transfer.
;; 5) SIP-009 compatible: standard NFT interfaces for wallet/indexer interoperability.
;; 6) Admin can: set split fees (bounded), set royalty recipient, pause/unpause, transfer admin ownership.
;; 7) Sealing requires ALL declared chunks uploaded (current-index == total-chunks) and hash verified.
;; 8) Upload sessions are start-or-resume and expire after inactivity (stacks-block-height based):
;;    - begin-inscription starts/resumes {uploader, file-hash} uploads
;;    - begin-or-get starts/resumes upload and does not canonicalize duplicates
;;    - expired uploads can be permissionlessly purged in batches
;;    - abandon-upload marks the session expired so chunks can be purged immediately
;; 9) Dependencies must already exist at seal time (no forward refs).
;; 10) Pause is a safety brake on inscription writes only:
;;     - pause stops begin-inscription, begin-or-get, add-chunk-batch, sealing
;;     - pause does NOT stop transfers or read-only access
;; 11) Hard caps: total-chunks <= 2048 and total-size <= 32 MiB.
;; 12) Read-only batch chunk reader speeds client reconstruction.
;; 13) Default paused on deploy; allowlisted contract callers can inscribe while paused.
;; 16) Chunking is fixed at 16 KiB. Upload payload batches are capped at 32 chunks.
;; 17) Small-file single-tx minting is core-native and capped at one upload batch.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 TRAIT (IMPLEMENT FOR WALLET/INDEXER COMPATIBILITY) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; [LOCAL / CLARINET]
;; (impl-trait .sip009-nft-trait.nft-trait)

;; [TESTNET]
(impl-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.nft-trait.nft-trait)

;; [MAINNET]
;; (impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

;; --- LEGACY MIGRATION TRAIT (passed as a parameter; NOT a static dependency) ---
;; Implemented by xtrata-v1-1-1, xtrata-v2-1-0, and any compatible legacy core.
(define-trait legacy-inscription-trait
  (
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)

;; The contract's own principal (escrow destination for migrated legacy NFTs).
;; [MAINNET / Clarity 4] current-contract is the Clarity 4 keyword for self-principal.
(define-constant SELF current-contract)
;; [LOCAL TEST / Clarity 3] swap the line above for the next one to test on a
;; Clarity 3 toolchain (as-contract was removed in Clarity 4):
;; (define-constant SELF (as-contract tx-sender))

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
(define-constant ERR-ALREADY-SET        (err u115))
(define-constant ERR-MIGRATION-SOURCE   (err u116))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CONSTANTS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant MAX-UPLOAD-BATCH-SIZE u32)
(define-constant MAX-GENERAL-LIST-SIZE u50)
(define-constant MAX-SEAL-BATCH-SIZE u50)
(define-constant MAX-SINGLE-TX-CHUNKS u32)
(define-constant CHUNK-SIZE u16384)
(define-constant MAX-UPLOAD-PAYLOAD (* MAX-UPLOAD-BATCH-SIZE CHUNK-SIZE))
;; Hard caps to keep uploads finishable within expiry windows.
(define-constant MAX-TOTAL-CHUNKS u2048)
(define-constant MAX-TOTAL-SIZE (* MAX-TOTAL-CHUNKS CHUNK-SIZE))

;; Fee bounds (microSTX): 0.001 STX .. 1.0 STX
(define-constant FEE-MIN u1)
(define-constant FEE-MAX u1000000)

;; Upload expiry (~30 days at 10-min block cadence)
(define-constant UPLOAD-EXPIRY-BLOCKS u4320)


(define-constant MODE-STAGED u1)
(define-constant MODE-SINGLE-TX u2)

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
(define-data-var offset-set bool false)
(define-data-var minted-count uint u0)
(define-data-var max-minted-id uint u0)
(define-data-var royalty-recipient principal tx-sender)

;; Split fee controls (microSTX), bounded for predictability.
;; Defaults preserve prior pricing at 50+ chunks while pro-rating the first batch.
;; - begin-fee-unit: charged once per new upload session
;; - upload-chunk-fee-unit: charged per chunk for the first upload batch only (up to 32 chunks)
;; - upload-batch-fee-unit: charged per full upload batch after the first
;; - seal-fee-unit: fixed extra fee charged at seal
;; - single-tx-fee-unit: one fixed fee for the core-native small-file route
(define-data-var begin-fee-unit uint u100000)
(define-data-var upload-chunk-fee-unit uint u2000)
(define-data-var upload-batch-fee-unit uint u100000)
(define-data-var seal-fee-unit uint u100000)
(define-data-var single-tx-fee-unit uint u100000)

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

;; Advisory first-seen mapping: sealed content hash -> first token-id.
(define-map HashToId (buff 32) uint)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CALLER + MINT INDEX ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-map AllowedCallers principal bool)
(define-map AllowedMigrationSources principal bool)
(define-map MintedIndex uint uint)

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
(define-map InscriptionParents uint (list 50 uint))
(define-map MigrationSource uint { source-contract: principal, source-id: uint })

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
  (let ((caller contract-caller))
    (begin
      (asserts!
        (or
          (not (var-get paused))
          (is-eq tx-sender (var-get contract-owner))
          (is-some (map-get? AllowedCallers caller))
        )
        ERR-PAUSED
      )
      (ok true)
    )
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

(define-private (valid-total-shape? (total-size uint) (total-chunks uint))
  (if (is-eq total-chunks u0)
    false
    (and
      (> total-size u0)
      (<= total-chunks MAX-TOTAL-CHUNKS)
      (<= total-size MAX-TOTAL-SIZE)
      (<= total-size (* total-chunks CHUNK-SIZE))
      (> total-size (* (- total-chunks u1) CHUNK-SIZE))
    )
  )
)

(define-private (expected-chunk-length (index uint) (total-size uint) (total-chunks uint))
  (if (< index (- total-chunks u1))
    CHUNK-SIZE
    (- total-size (* index CHUNK-SIZE))
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
  (is-some (map-get? InscriptionMeta id))
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

(define-private (uint-in-list? (target uint) (items (list 50 uint)))
  (let ((res (fold uint-in-list-step items { target: target, found: false })))
    (get found res)
  )
)

(define-private (uint-in-list-step (item uint) (acc { target: uint, found: bool }))
  (if (get found acc)
    acc
    { target: (get target acc), found: (is-eq item (get target acc)) }
  )
)

(define-private (collect-unique-uint (item uint) (acc { ok: bool, seen: (list 50 uint) }))
  (if (get ok acc)
    (let ((seen (get seen acc)))
      (if (uint-in-list? item seen)
        { ok: false, seen: seen }
        { ok: true, seen: (unwrap-panic (as-max-len? (append seen item) u50)) }
      )
    )
    acc
  )
)

(define-private (validate-parent-uniqueness (parents (list 50 uint)))
  (let ((res (fold collect-unique-uint parents { ok: true, seen: (list) })))
    (get ok res)
  )
)

(define-private (validate-parent (id uint) (acc { missing: bool, unowned: bool }))
  (if (or (get missing acc) (get unowned acc))
    acc
    (match (nft-get-owner? xtrata-inscription id)
      owner
        (if (is-eq owner tx-sender)
          { missing: false, unowned: false }
          { missing: false, unowned: true }
        )
      { missing: true, unowned: false }
    )
  )
)

(define-private (validate-parents (parents (list 50 uint)))
  (begin
    (asserts! (validate-parent-uniqueness parents) ERR-DUPLICATE)
    (let ((res (fold validate-parent parents { missing: false, unowned: false })))
      (begin
        (asserts! (not (get missing res)) ERR-DEPENDENCY-MISSING)
        (asserts! (not (get unowned res)) ERR-NOT-AUTHORIZED)
        (ok true)
      )
    )
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

;; ceil(total-chunks / MAX-UPLOAD-BATCH-SIZE)
(define-private (num-batches (total-chunks uint))
  (let (
    (q (/ total-chunks MAX-UPLOAD-BATCH-SIZE))
    (r (mod total-chunks MAX-UPLOAD-BATCH-SIZE))
  )
    (if (is-eq r u0) q (+ q u1))
  )
)

(define-private (first-batch-chunks (total-chunks uint))
  (if (> total-chunks MAX-UPLOAD-BATCH-SIZE)
    MAX-UPLOAD-BATCH-SIZE
    total-chunks
  )
)

(define-private (additional-batches (total-chunks uint))
  (if (<= total-chunks MAX-UPLOAD-BATCH-SIZE)
    u0
    (num-batches (- total-chunks MAX-UPLOAD-BATCH-SIZE))
  )
)

(define-private (seal-fee-for-chunks (total-chunks uint))
  (let (
    (first-chunks (first-batch-chunks total-chunks))
    (extra-batches (additional-batches total-chunks))
    (first-fee (* first-chunks (var-get upload-chunk-fee-unit)))
    (extra-fee (* extra-batches (var-get upload-batch-fee-unit)))
  )
    (+ (var-get seal-fee-unit) (+ first-fee extra-fee))
  )
)

(define-private (single-tx-fee-for-chunks (total-chunks uint))
  (+ (var-get single-tx-fee-unit) (* total-chunks (var-get upload-chunk-fee-unit)))
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

(define-private (record-mint (id uint))
  (let (
    (count (var-get minted-count))
    (current-max (var-get max-minted-id))
  )
    (begin
      (map-set MintedIndex count id)
      (var-set minted-count (+ count u1))
      (if (> id current-max)
        (var-set max-minted-id id)
        true
      )
      id
    )
  )
)

(define-private (advance-next-id-if-needed (id uint))
  (if (>= id (var-get next-id))
    (var-set next-id (+ id u1))
    true
  )
)

(define-private (record-migration-source (token-id uint) (source-contract principal) (source-id uint))
  (map-set MigrationSource token-id { source-contract: source-contract, source-id: source-id })
)



(define-private (record-hash-first-seen (hash (buff 32)) (token-id uint))
  (begin
    ;; map-insert preserves the original token-id when duplicate content mints later.
    (map-insert HashToId hash token-id)
    true
  )
)

(define-private (store-relationships (id uint) (dependencies (list 50 uint)) (parents (list 50 uint)))
  (begin
    (if (> (len dependencies) u0)
      (map-set InscriptionDependencies id dependencies)
      true
    )
    (if (> (len parents) u0)
      (map-set InscriptionParents id parents)
      true
    )
    true
  )
)

(define-private (commit-inscription
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (new-id uint)
  (creator principal)
  (mime-type (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
  (final-hash (buff 32))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (begin
    (try! (nft-mint? xtrata-inscription new-id tx-sender))

    (map-insert InscriptionMeta new-id {
      owner: tx-sender,
      creator: creator,
      mime-type: mime-type,
      total-size: total-size,
      total-chunks: total-chunks,
      sealed: true,
      final-hash: final-hash
    })

    (record-hash-first-seen expected-hash new-id)
    (map-set TokenURIs new-id token-uri-string)
    (store-relationships new-id dependencies parents)
    (var-set next-id (+ new-id u1))
    (record-mint new-id)
    (print {
      event: "inscription-sealed",
      token-id: new-id,
      owner: tx-sender,
      token-uri: token-uri-string,
      final-hash: final-hash,
      chunk-size: CHUNK-SIZE,
      total-size: total-size,
      total-chunks: total-chunks,
      dependencies: dependencies,
      parents: parents
    })
    (ok new-id)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 REQUIRED FUNCTIONS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-last-token-id)
  (if (is-eq (var-get minted-count) u0)
    (ok u0)
    (ok (var-get max-minted-id))
  )
)

(define-read-only (get-next-token-id)
  (ok (var-get next-id))
)

(define-read-only (get-minted-count)
  (ok (var-get minted-count))
)

(define-read-only (get-minted-id (index uint))
  (map-get? MintedIndex index)
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

;; Returns the first token-id sealed/minted for this hash, if any.
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

;; Split fee model:
;; - begin fee = begin-fee-unit
;; - staged seal fee  = seal-fee-unit
;;                    + upload-chunk-fee-unit * min(total-chunks, 32)
;;                    + upload-batch-fee-unit * ceil(max(total-chunks - 32, 0) / 32)
;; - single-tx fee = single-tx-fee-unit + upload-chunk-fee-unit * total-chunks
;;
;; Governance constraints:
;; - absolute bounds: [0.001, 1.0] STX
;; - bounded change per update:
;;    * increases: new <= old*2
;;    * decreases: new >= old/10

(define-private (assert-valid-fee-update (old uint) (new-fee uint))
  (begin
    (asserts! (>= new-fee FEE-MIN) ERR-INVALID-FEE)
    (asserts! (<= new-fee FEE-MAX) ERR-INVALID-FEE)
    (asserts! (<= new-fee (* old u2)) ERR-INVALID-FEE)
    (asserts! (>= new-fee (/ old u10)) ERR-INVALID-FEE)
    (ok true)
  )
)

(define-public (set-begin-fee-unit (new-fee uint))
  (let ((old (var-get begin-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set begin-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-upload-chunk-fee-unit (new-fee uint))
  (let ((old (var-get upload-chunk-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set upload-chunk-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-upload-batch-fee-unit (new-fee uint))
  (let ((old (var-get upload-batch-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set upload-batch-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-seal-fee-unit (new-fee uint))
  (let ((old (var-get seal-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set seal-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-single-tx-fee-unit (new-fee uint))
  (let ((old (var-get single-tx-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set single-tx-fee-unit new-fee)
      (ok true)
    )
  )
)

;; Backwards-compatible one-knob setter.
;; Applies a legacy profile:
;; - begin = unit
;; - upload-chunk = max(FEE-MIN, floor(unit / 32))
;; - upload-batch = unit
;; - seal = unit
;; - single-tx = unit
(define-public (set-fee-unit (new-fee uint))
  (let (
    (old (var-get upload-batch-fee-unit))
    (raw-chunk (/ new-fee MAX-UPLOAD-BATCH-SIZE))
    (chunk-fee (if (>= raw-chunk FEE-MIN) raw-chunk FEE-MIN))
  )
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set begin-fee-unit new-fee)
      (var-set upload-chunk-fee-unit chunk-fee)
      (var-set upload-batch-fee-unit new-fee)
      (var-set seal-fee-unit new-fee)
      (var-set single-tx-fee-unit new-fee)
      (ok true)
    )
  )
)


(define-public (set-next-id (value uint))
  (let ((caller tx-sender))
    (begin
      (asserts! (is-eq caller (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (asserts! (not (var-get offset-set)) ERR-ALREADY-SET)
      (asserts! (is-eq (var-get next-id) u0) ERR-ALREADY-SET)
      (asserts! (is-eq (var-get minted-count) u0) ERR-ALREADY-SET)
      (var-set next-id value)
      (var-set offset-set true)
      (ok value)
    )
  )
)

(define-public (set-allowed-caller (caller principal) (allowed bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (if allowed
      (map-set AllowedCallers caller true)
      (map-delete AllowedCallers caller)
    )
    (ok true)
  )
)

(define-public (set-migration-source (source principal) (allowed bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (if allowed
      (map-set AllowedMigrationSources source true)
      (map-delete AllowedMigrationSources source)
    )
    (ok true)
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
;; --- MIGRATION (LEGACY -> V3.2) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;




;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CORE LOGIC ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; begin-or-get:
;; - Start/resume upload (via begin-inscription) and return (ok none)
;; - Existing HashToId entries stay advisory and do not canonicalize duplicates
;;
;; This gives third parties a single call to start/resume while keeping a stable ABI.
(define-public (begin-or-get
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
)
  (begin
    (try! (assert-inscription-allowed))
    (try! (begin-inscription expected-hash mime total-size total-chunks))
    (ok none)
  )
)

;; Start-or-resume:
;; - If no UploadState exists for {tx-sender, expected-hash}, create it and charge begin fee.
;; - If it already exists, treat as resume:
;;   - do NOT charge begin fee again
;;   - require parameters match the original declaration
;;
;; Existing HashToId entries are advisory only and do not block duplicate uploads.
(define-public (begin-inscription (expected-hash (buff 32)) (mime (string-ascii 64)) (total-size uint) (total-chunks uint))
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (valid-total-shape? total-size total-chunks) ERR-INVALID-BATCH)

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
        (try! (maybe-pay (var-get begin-fee-unit)))

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
        (print {
          event: "upload-started",
          owner: tx-sender,
          hash: expected-hash,
          total-size: total-size,
          total-chunks: total-chunks
        })
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
      (asserts! (<= batch-len MAX-GENERAL-LIST-SIZE) ERR-INVALID-BATCH)
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

(define-public (add-chunk-batch (hash (buff 32)) (chunks (list 32 (buff 16384))))
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
        (asserts! (<= batch-len MAX-UPLOAD-BATCH-SIZE) ERR-INVALID-BATCH)
        (asserts! (<= (+ start-idx batch-len) total) ERR-INVALID-BATCH)

        (let ((result (fold process-chunk chunks
          {
            ok: true,
            idx: start-idx,
            run-hash: start-hash,
            target-hash: hash,
            creator: tx-sender,
            total-size: (get total-size state),
            total-chunks: total
          })))
          (asserts! (get ok result) ERR-INVALID-BATCH)
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
  (ctx {
    ok: bool,
    idx: uint,
    run-hash: (buff 32),
    target-hash: (buff 32),
    creator: principal,
    total-size: uint,
    total-chunks: uint
  })
)
  (if (get ok ctx)
    (let (
      (current-idx (get idx ctx))
      (current-hash (get run-hash ctx))
      (target-hash (get target-hash ctx))
      (creator (get creator ctx))
      (total-size (get total-size ctx))
      (total-chunks (get total-chunks ctx))
      (expected-len (expected-chunk-length current-idx total-size total-chunks))
      (next-hash (sha256 (concat current-hash data)))
    )
      (if (is-eq (len data) expected-len)
        (begin
          (map-set Chunks { context: target-hash, creator: creator, index: current-idx } data)
          {
            ok: true,
            idx: (+ current-idx u1),
            run-hash: next-hash,
            target-hash: target-hash,
            creator: creator,
            total-size: total-size,
            total-chunks: total-chunks
          }
        )
        (merge ctx { ok: false })
      )
    )
    ctx
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
    (seal-fee (seal-fee-for-chunks chunks))
  )
    (begin
      (try! (assert-not-expired state))
      (asserts! (is-eq (get current-index state) chunks) ERR-INVALID-BATCH)
      (asserts! (is-eq final-hash expected-hash) ERR-HASH-MISMATCH)
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (ok { state: state, fee: seal-fee })
    )
  )
)

(define-private (seal-internal
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
  (new-id uint)
)
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (validate-dependencies dependencies) ERR-DEPENDENCY-MISSING)
    (try! (validate-parents parents))
    (let (
      (validation (try! (seal-validate expected-hash token-uri-string)))
      (state (get state validation))
      (seal-fee (get fee validation))
    )
      (try! (maybe-pay seal-fee))
      (map-delete UploadState { owner: tx-sender, hash: expected-hash })
      (commit-inscription
        expected-hash
        token-uri-string
        new-id
        tx-sender
        (get mime-type state)
        (get total-size state)
        (get total-chunks state)
        (get running-hash state)
        dependencies
        parents
      )
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
      (map-delete UploadState { owner: tx-sender, hash: hash })
      (try! (commit-inscription
        hash
        token-uri
        new-id
        tx-sender
        (get mime-type state)
        (get total-size state)
        (get total-chunks state)
        (get running-hash state)
        (list)
        (list)
      ))
      (ok { idx: (+ (get idx current) u1), start: (get start current) })
    )
  )
)

(define-public (seal-inscription (expected-hash (buff 32)) (token-uri-string (string-ascii 256)))
  (seal-internal expected-hash token-uri-string (list) (list) (var-get next-id))
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
  (seal-internal expected-hash token-uri-string dependencies (list) (var-get next-id))
)

(define-public (seal-with-relationships
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (seal-internal expected-hash token-uri-string dependencies parents (var-get next-id))
)

(define-private (assert-single-tx-shape (total-size uint) (chunk-count uint))
  (begin
    (asserts! (valid-total-shape? total-size chunk-count) ERR-INVALID-BATCH)
    (asserts! (<= chunk-count MAX-SINGLE-TX-CHUNKS) ERR-INVALID-BATCH)
    (ok true)
  )
)

(define-private (mint-single-tx-internal
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (let ((chunk-count (len chunks)))
    (begin
      (try! (assert-inscription-allowed))
      (try! (assert-single-tx-shape total-size chunk-count))
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (asserts! (is-none (map-get? UploadState { owner: tx-sender, hash: expected-hash })) ERR-DUPLICATE)
      (asserts! (validate-dependencies dependencies) ERR-DEPENDENCY-MISSING)
      (try! (validate-parents parents))
      (let (
        (result (fold process-chunk chunks {
          ok: true,
          idx: u0,
          run-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
          target-hash: expected-hash,
          creator: tx-sender,
          total-size: total-size,
          total-chunks: chunk-count
        }))
        (fee (single-tx-fee-for-chunks chunk-count))
      )
        (begin
          (asserts! (get ok result) ERR-INVALID-BATCH)
          (asserts! (is-eq (get idx result) chunk-count) ERR-INVALID-BATCH)
          (asserts! (is-eq (get run-hash result) expected-hash) ERR-HASH-MISMATCH)
          (try! (maybe-pay fee))
          (let ((new-id (try! (commit-inscription
            expected-hash
            token-uri-string
            (var-get next-id)
            tx-sender
            mime
            total-size
            chunk-count
            (get run-hash result)
            dependencies
            parents
          ))))
            (ok { token-id: new-id, existed: false })
          )
        )
      )
    )
  )
)

(define-public (mint-single-tx
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string (list) (list))
)

(define-public (mint-single-tx-recursive
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string dependencies (list))
)

(define-public (mint-single-tx-with-relationships
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string dependencies parents)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- MIGRATION (trait-based, faithful, same-id) ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Mint a v3 token at the legacy id after content + ownership + hash are verified,
;; escrow the legacy NFT into this contract, and record provenance. Does NOT touch
;; next-id except to keep it above the migrated id (so future native mints are safe).
(define-private (migrate-mint
  (legacy <legacy-inscription-trait>)
  (legacy-id uint)
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
  (final-hash (buff 32))
  (token-uri-string (string-ascii 256))
)
  (let (
    (source-contract (contract-of legacy))
    (legacy-owner (unwrap! (try! (contract-call? legacy get-owner legacy-id)) ERR-NOT-FOUND))
  )
    (begin
      (asserts! (is-some (map-get? AllowedMigrationSources source-contract)) ERR-MIGRATION-SOURCE)
      ;; caller must own the legacy token being ported
      (asserts! (is-eq legacy-owner tx-sender) ERR-NOT-AUTHORIZED)
      ;; destination id must be free in v3
      (asserts! (is-none (nft-get-owner? xtrata-inscription legacy-id)) ERR-DUPLICATE)
      ;; escrow the legacy NFT into this contract (legacy transfer asserts tx-sender == sender)
      (try! (contract-call? legacy transfer legacy-id tx-sender SELF))
      ;; mint the v3 token at the SAME id
      (try! (nft-mint? xtrata-inscription legacy-id tx-sender))
      (map-insert InscriptionMeta legacy-id {
        owner: tx-sender,
        creator: tx-sender,
        mime-type: mime,
        total-size: total-size,
        total-chunks: total-chunks,
        sealed: true,
        final-hash: final-hash
      })
      (record-hash-first-seen final-hash legacy-id)
      (map-set TokenURIs legacy-id token-uri-string)
      (record-migration-source legacy-id source-contract legacy-id)
      (record-mint legacy-id)
      (advance-next-id-if-needed legacy-id)
      (print {
        event: "inscription-migrated",
        token-id: legacy-id,
        owner: tx-sender,
        source-contract: source-contract,
        source-id: legacy-id,
        final-hash: final-hash,
        total-size: total-size,
        total-chunks: total-chunks,
        token-uri: token-uri-string
      })
      (ok legacy-id)
    )
  )
)

;; Single-tx migration: re-supply the whole inscription (<= 32 chunks / 512 KiB) inline.
(define-public (migrate-single-tx
  (legacy <legacy-inscription-trait>)
  (legacy-id uint)
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 32 (buff 16384)))
  (token-uri-string (string-ascii 256))
)
  (let ((chunk-count (len chunks)))
    (begin
      (try! (assert-inscription-allowed))
      (try! (assert-single-tx-shape total-size chunk-count))
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (let (
        (result (fold process-chunk chunks {
          ok: true,
          idx: u0,
          run-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
          target-hash: expected-hash,
          creator: tx-sender,
          total-size: total-size,
          total-chunks: chunk-count
        }))
      )
        (begin
          (asserts! (get ok result) ERR-INVALID-BATCH)
          (asserts! (is-eq (get idx result) chunk-count) ERR-INVALID-BATCH)
          (asserts! (is-eq (get run-hash result) expected-hash) ERR-HASH-MISMATCH)
          (try! (maybe-pay (single-tx-fee-for-chunks chunk-count)))
          (migrate-mint legacy legacy-id mime total-size chunk-count expected-hash token-uri-string)
        )
      )
    )
  )
)

;; Staged migration: content already uploaded via begin-or-get + add-chunk-batch for
;; {tx-sender, expected-hash}; this verifies, escrows, mints at the legacy id, and
;; clears the upload session. Use for inscriptions larger than one upload batch.
(define-public (migrate-staged
  (legacy <legacy-inscription-trait>)
  (legacy-id uint)
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
)
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
    (let (
      (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: expected-hash }) ERR-NOT-FOUND))
    )
      (begin
        (try! (assert-not-expired state))
        (asserts! (is-eq (get current-index state) (get total-chunks state)) ERR-INVALID-BATCH)
        (asserts! (is-eq (get running-hash state) expected-hash) ERR-HASH-MISMATCH)
        (try! (maybe-pay (seal-fee-for-chunks (get total-chunks state))))
        (map-delete UploadState { owner: tx-sender, hash: expected-hash })
        (migrate-mint legacy legacy-id (get mime-type state) (get total-size state)
                      (get total-chunks state) expected-hash token-uri-string)
      )
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
      (match (map-get? Chunks {
          context: (get final-hash meta),
          creator: (get creator meta),
          index: index
        })
        chunk (some chunk)
        none
      )
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
        (get chunks acc))
    (list)
  )
)

(define-read-only (get-dependencies (id uint))
  (match (map-get? InscriptionDependencies id)
    deps deps
    (list)
  )
)

(define-read-only (get-parents (id uint))
  (match (map-get? InscriptionParents id)
    parents parents
    (list)
  )
)

(define-read-only (get-migration-source (id uint))
  (map-get? MigrationSource id)
)


(define-read-only (get-chunk-size)
  (ok CHUNK-SIZE)
)

(define-read-only (get-contract-info)
  (ok {
    version: "xtrata-v3.4.0",
    chunk-size: CHUNK-SIZE,
    upload-batch-limit: MAX-UPLOAD-BATCH-SIZE,
    upload-payload-limit: MAX-UPLOAD-PAYLOAD,
    single-tx-chunk-limit: MAX-SINGLE-TX-CHUNKS,
    single-tx-payload-limit: MAX-UPLOAD-PAYLOAD,
    general-list-limit: MAX-GENERAL-LIST-SIZE,
    seal-batch-limit: MAX-SEAL-BATCH-SIZE,
    max-total-chunks: MAX-TOTAL-CHUNKS,
    max-total-size: MAX-TOTAL-SIZE
  })
)

(define-read-only (get-inscription-summary (id uint))
  (match (map-get? InscriptionMeta id)
    meta
      (ok (some {
        owner: (get owner meta),
        creator: (get creator meta),
        mime-type: (get mime-type meta),
        total-size: (get total-size meta),
        total-chunks: (get total-chunks meta),
        chunk-size: CHUNK-SIZE,
        sealed: (get sealed meta),
        final-hash: (get final-hash meta),
        token-uri: (map-get? TokenURIs id),
        dependencies: (get-dependencies id),
        parents: (get-parents id),
        migration-source: (map-get? MigrationSource id)
      }))
    (ok none)
  )
)

(define-read-only (quote-inscription-fee (total-size uint) (total-chunks uint) (mode uint))
  (begin
    (asserts! (or (is-eq mode MODE-STAGED) (is-eq mode MODE-SINGLE-TX)) ERR-INVALID-BATCH)
    (asserts! (valid-total-shape? total-size total-chunks) ERR-INVALID-BATCH)
    (asserts!
      (or
        (is-eq mode MODE-STAGED)
        (<= total-chunks MAX-SINGLE-TX-CHUNKS)
      )
      ERR-INVALID-BATCH
    )
    (let (
      (begin-fee (var-get begin-fee-unit))
      (seal-fee (seal-fee-for-chunks total-chunks))
      (single-fee (single-tx-fee-for-chunks total-chunks))
      (upload-batches (num-batches total-chunks))
    )
      (ok {
        mode: mode,
        chunk-size: CHUNK-SIZE,
        upload-batch-limit: MAX-UPLOAD-BATCH-SIZE,
        upload-batches: upload-batches,
        single-tx-eligible: (<= total-chunks MAX-SINGLE-TX-CHUNKS),
        begin-fee: begin-fee,
        seal-fee: seal-fee,
        single-tx-fee: single-fee,
        total-fee: (if (is-eq mode MODE-STAGED) (+ begin-fee seal-fee) single-fee)
      })
    )
  )
)

(define-read-only (quote-staged-fee (total-size uint) (total-chunks uint))
  (quote-inscription-fee total-size total-chunks MODE-STAGED)
)

(define-read-only (quote-single-tx-fee (total-size uint) (total-chunks uint))
  (quote-inscription-fee total-size total-chunks MODE-SINGLE-TX)
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

(define-read-only (is-allowed-caller (caller principal))
  (ok (is-some (map-get? AllowedCallers caller)))
)

(define-read-only (is-migration-source (source principal))
  (ok (is-some (map-get? AllowedMigrationSources source)))
)

(define-read-only (get-royalty-recipient)
  (ok (var-get royalty-recipient))
)

;; Backwards-compatible fee-unit reader (maps to upload-batch fee unit).
(define-read-only (get-fee-unit)
  (ok (var-get upload-batch-fee-unit))
)

(define-read-only (get-begin-fee-unit)
  (ok (var-get begin-fee-unit))
)

(define-read-only (get-upload-chunk-fee-unit)
  (ok (var-get upload-chunk-fee-unit))
)

(define-read-only (get-upload-batch-fee-unit)
  (ok (var-get upload-batch-fee-unit))
)

(define-read-only (get-seal-fee-unit)
  (ok (var-get seal-fee-unit))
)

(define-read-only (get-single-tx-fee-unit)
  (ok (var-get single-tx-fee-unit))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
