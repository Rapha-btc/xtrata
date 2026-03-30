;; xtrata-v3.0.0
;;
;; Core posture (v3.0.0):
;; 1) Open participation: anyone can inscribe once unpaused.
;; 2) No on-chain dedupe enforcement: repeated identical content can mint more than once.
;; 3) Advisory hash lookup remains available via first-seen hash -> token-id.
;; 4) Dependencies and parents are stored separately.
;; 5) Parents are ownership-gated at seal time; dependencies are not.
;; 6) Fee policy is byte-aware and policy-aware:
;;    - staged begin fee
;;    - staged seal fee
;;    - single-tx fee
;;    - byte-proportional upload fee
;;    - extra batch fee for > 50 chunks
;;    - wallet/caller basis-point overrides
;; 7) Core-native single-tx mint path exists for <= 50 chunks.
;; 8) Upload sessions remain start-or-resume and expire after inactivity.
;; 9) Legacy migration supports v1.1.1, v2.1.0, and v2.1.1 into the v3 NFT line.
;; 10) Admin can set an initial next-id offset once for continuity.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 TRAIT ---
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
;; --- ASSET ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-non-fungible-token xtrata-inscription uint)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ERRORS ---
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
(define-constant ERR-PARENT-MISSING     (err u116))
(define-constant ERR-PARENT-NOT-OWNED   (err u117))
(define-constant ERR-INVALID-MODE       (err u118))
(define-constant ERR-INVALID-BPS        (err u119))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CONSTANTS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant MAX-BATCH-SIZE u50)
(define-constant MAX-SEAL-BATCH-SIZE u50)
(define-constant MAX-RELATIONSHIP-SIZE u50)
(define-constant CHUNK-SIZE u16384)
(define-constant MAX-TOTAL-CHUNKS u2048)
(define-constant MAX-TOTAL-SIZE (* MAX-TOTAL-CHUNKS CHUNK-SIZE))
(define-constant UPLOAD-EXPIRY-BLOCKS u4320)
(define-constant FEE-MIN u1)
(define-constant FEE-MAX u1000000)
(define-constant BPS-MAX u10000)
(define-constant MODE-STAGED u1)
(define-constant MODE-SINGLE-TX u2)
(define-constant POLICY-SOURCE-DEFAULT u0)
(define-constant POLICY-SOURCE-CALLER u1)
(define-constant POLICY-SOURCE-WALLET u2)
(define-constant CONTRACT-PRINCIPAL (as-contract tx-sender))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SVG ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant SVG-STATIC
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><circle cx='25' cy='25' r='20' fill='none' stroke='#6366f1' stroke-width='4'/><circle cx='25' cy='25' r='12' fill='none' stroke='#ec4899' stroke-width='4'/><circle cx='25' cy='25' r='5' fill='#f97316'/></svg>"
)

(define-constant SVG-STATIC-B64
  "PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA1MCA1MCc+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMjAnIGZpbGw9J25vbmUnIHN0cm9rZT0nIzYzNjZmMScgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nMTInIGZpbGw9J25vbmUnIHN0cm9rZT0nI2VjNDg5OScgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMjUnIGN5PScyNScgcj0nNScgZmlsbD0nI2Y5NzMxNicvPjwvc3ZnPg=="
)

(define-constant SVG-DATAURI-PREFIX "data:image/svg+xml;base64,")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN + FEES ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-data-var contract-owner principal tx-sender)
(define-data-var next-id uint u0)
(define-data-var offset-set bool false)
(define-data-var minted-count uint u0)
(define-data-var max-minted-id uint u0)
(define-data-var fee-recipient principal tx-sender)

(define-data-var staged-begin-fee-unit uint u100000)
(define-data-var staged-seal-fee-unit uint u100000)
(define-data-var single-tx-fee-unit uint u100000)
(define-data-var upload-byte-fee-unit uint u2000)
(define-data-var extra-batch-fee-unit uint u100000)

(define-data-var paused bool true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- STORAGE ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-map TokenURIs uint (string-ascii 256))
(define-map HashToId (buff 32) uint)
(define-map AllowedCallers principal bool)
(define-map MintedIndex uint uint)
(define-map MintOrigin uint principal)

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
(define-map ParentChildCount uint uint)
(define-map ParentChildIndex { parent: uint, index: uint } uint)
(define-map MigrationSource uint { source-contract: principal, source-id: uint })

(define-map WalletFeeBps { wallet: principal } { bps: uint })
(define-map CallerFeeBps { caller: principal } { bps: uint })

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

(define-private (ceil-div (num uint) (den uint))
  (if (is-eq (mod num den) u0)
    (/ num den)
    (+ (/ num den) u1)
  )
)

(define-private (assert-valid-bps (bps uint))
  (begin
    (asserts! (<= bps BPS-MAX) ERR-INVALID-BPS)
    (ok true)
  )
)

(define-private (assert-valid-mode (mode uint))
  (begin
    (asserts! (or (is-eq mode MODE-STAGED) (is-eq mode MODE-SINGLE-TX)) ERR-INVALID-MODE)
    (ok true)
  )
)

(define-private (assert-valid-fee-update (old uint) (new-fee uint))
  (begin
    (asserts! (>= new-fee FEE-MIN) ERR-INVALID-FEE)
    (asserts! (<= new-fee FEE-MAX) ERR-INVALID-FEE)
    (asserts! (<= new-fee (* old u2)) ERR-INVALID-FEE)
    (asserts! (>= new-fee (/ old u10)) ERR-INVALID-FEE)
    (ok true)
  )
)

(define-private (apply-bps (amount uint) (bps uint))
  (if (or (is-eq amount u0) (is-eq bps u0))
    u0
    (ceil-div (* amount bps) BPS-MAX)
  )
)

(define-private (num-batches (total-chunks uint))
  (let ((q (/ total-chunks MAX-BATCH-SIZE)) (r (mod total-chunks MAX-BATCH-SIZE)))
    (if (is-eq r u0) q (+ q u1))
  )
)

(define-private (additional-batches (total-chunks uint))
  (if (<= total-chunks MAX-BATCH-SIZE)
    u0
    (num-batches (- total-chunks MAX-BATCH-SIZE))
  )
)

(define-private (size-fee-for-bytes (total-size uint))
  (if (is-eq total-size u0)
    u0
    (ceil-div (* total-size (var-get upload-byte-fee-unit)) CHUNK-SIZE)
  )
)

(define-private (extra-batch-fee-for-chunks (total-chunks uint))
  (* (additional-batches total-chunks) (var-get extra-batch-fee-unit))
)

(define-private (resolve-fee-policy (payer principal) (caller (optional principal)))
  (match (map-get? WalletFeeBps { wallet: payer })
    wallet-policy
      { bps: (get bps wallet-policy), source: POLICY-SOURCE-WALLET }
    (match caller
      caller-principal
        (if (is-eq caller-principal payer)
          { bps: BPS-MAX, source: POLICY-SOURCE-DEFAULT }
          (match (map-get? CallerFeeBps { caller: caller-principal })
            caller-policy
              { bps: (get bps caller-policy), source: POLICY-SOURCE-CALLER }
            { bps: BPS-MAX, source: POLICY-SOURCE-DEFAULT }
          )
        )
      { bps: BPS-MAX, source: POLICY-SOURCE-DEFAULT }
    )
  )
)

(define-private (staged-begin-fee (payer principal) (caller (optional principal)))
  (let ((policy (resolve-fee-policy payer caller)))
    { amount: (apply-bps (var-get staged-begin-fee-unit) (get bps policy)), source: (get source policy), bps: (get bps policy) }
  )
)

(define-private (staged-seal-fee (payer principal) (caller (optional principal)) (total-size uint) (total-chunks uint))
  (let (
    (policy (resolve-fee-policy payer caller))
    (raw (+ (var-get staged-seal-fee-unit) (+ (size-fee-for-bytes total-size) (extra-batch-fee-for-chunks total-chunks))))
  )
    { amount: (apply-bps raw (get bps policy)), source: (get source policy), bps: (get bps policy) }
  )
)

(define-private (single-tx-fee (payer principal) (caller (optional principal)) (total-size uint) (total-chunks uint))
  (let (
    (policy (resolve-fee-policy payer caller))
    (raw (+ (var-get single-tx-fee-unit) (+ (size-fee-for-bytes total-size) (extra-batch-fee-for-chunks total-chunks))))
  )
    { amount: (apply-bps raw (get bps policy)), source: (get source policy), bps: (get bps policy) }
  )
)

(define-private (maybe-pay (amount uint))
  (if (> amount u0)
    (stx-transfer? amount tx-sender (var-get fee-recipient))
    (ok true)
  )
)

(define-private (dep-exists? (id uint))
  (is-some (map-get? InscriptionMeta id))
)

(define-private (parent-exists? (id uint))
  (is-some (map-get? InscriptionMeta id))
)

(define-private (parent-owned-by-sender? (id uint))
  (is-eq (some tx-sender) (nft-get-owner? xtrata-inscription id))
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

(define-private (uint-in-list? (value uint) (items (list 50 uint)))
  (let ((res (fold uint-in-list-step items { target: value, found: false })))
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

(define-private (validate-parents (parents (list 50 uint)))
  (begin
    (asserts! (validate-parent-uniqueness parents) ERR-DUPLICATE)
    (let ((res (fold validate-parent parents { missing: false, unowned: false })))
      (if (get missing res)
        ERR-PARENT-MISSING
        (if (get unowned res)
          ERR-PARENT-NOT-OWNED
          (ok true)
        )
      )
    )
  )
)

(define-private (validate-parent (id uint) (acc { missing: bool, unowned: bool }))
  (if (or (get missing acc) (get unowned acc))
    acc
    (if (not (parent-exists? id))
      { missing: true, unowned: false }
      (if (parent-owned-by-sender? id)
        { missing: false, unowned: false }
        { missing: false, unowned: true }
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

(define-private (record-parent-child (parent uint) (ctx { child: uint }))
  (let (
    (count (default-to u0 (map-get? ParentChildCount parent)))
  )
    (begin
      (map-set ParentChildIndex { parent: parent, index: count } (get child ctx))
      (map-set ParentChildCount parent (+ count u1))
      ctx
    )
  )
)

(define-private (record-parent-links (child uint) (parents (list 50 uint)))
  (fold record-parent-child parents { child: child })
)

(define-private (advance-next-id-if-needed (id uint))
  (if (>= id (var-get next-id))
    (var-set next-id (+ id u1))
    true
  )
)

(define-private (record-advisory-hash (hash (buff 32)) (id uint))
  (if (is-none (map-get? HashToId hash))
    (map-set HashToId hash id)
    true
  )
)

(define-private (record-mint-origin (id uint))
  (if (is-eq contract-caller tx-sender)
    true
    (map-set MintOrigin id contract-caller)
  )
)

(define-private (store-relationships (id uint) (dependencies (list 50 uint)) (parents (list 50 uint)))
  (begin
    (if (> (len dependencies) u0)
      (map-set InscriptionDependencies id dependencies)
      true
    )
    (if (> (len parents) u0)
      (begin
        (map-set InscriptionParents id parents)
        (let ((ignored (record-parent-links id parents)))
          true
        )
      )
      true
    )
    true
  )
)

(define-private (commit-inscription
  (new-id uint)
  (expected-hash (buff 32))
  (creator principal)
  (mime-type (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
  (final-hash (buff 32))
  (token-uri-string (string-ascii 256))
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

    (map-set TokenURIs new-id token-uri-string)
    (store-relationships new-id dependencies parents)
    (record-mint-origin new-id)
    (record-advisory-hash expected-hash new-id)
    (var-set next-id (+ (var-get next-id) u1))
    (record-mint new-id)
    (ok new-id)
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

(define-private (assert-single-tx-shape (total-size uint) (chunk-count uint))
  (begin
    (asserts! (> chunk-count u0) ERR-INVALID-BATCH)
    (asserts! (<= chunk-count MAX-BATCH-SIZE) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* chunk-count CHUNK-SIZE)) ERR-INVALID-BATCH)
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- SIP-009 REQUIRED ---
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
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (some sender) (nft-get-owner? xtrata-inscription id)) ERR-NOT-AUTHORIZED)
    (try! (nft-transfer? xtrata-inscription id sender recipient))
    (let ((meta (unwrap! (map-get? InscriptionMeta id) ERR-NOT-FOUND)))
      (map-set InscriptionMeta id (merge meta { owner: recipient }))
    )
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- OPTIONAL VIEWERS ---
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

(define-read-only (get-id-by-hash (hash (buff 32)))
  (map-get? HashToId hash)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (var-set fee-recipient recipient)
    (ok true)
  )
)

(define-public (set-royalty-recipient (recipient principal))
  (set-fee-recipient recipient)
)

(define-public (set-staged-begin-fee-unit (new-fee uint))
  (let ((old (var-get staged-begin-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set staged-begin-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-staged-seal-fee-unit (new-fee uint))
  (let ((old (var-get staged-seal-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set staged-seal-fee-unit new-fee)
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

(define-public (set-upload-byte-fee-unit (new-fee uint))
  (let ((old (var-get upload-byte-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set upload-byte-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-extra-batch-fee-unit (new-fee uint))
  (let ((old (var-get extra-batch-fee-unit)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update old new-fee))
      (var-set extra-batch-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-fee-unit (new-fee uint))
  (let ((scaled (if (>= (/ new-fee u50) FEE-MIN) (/ new-fee u50) FEE-MIN)))
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
      (try! (assert-valid-fee-update (var-get staged-seal-fee-unit) new-fee))
      (var-set staged-begin-fee-unit new-fee)
      (var-set staged-seal-fee-unit new-fee)
      (var-set single-tx-fee-unit new-fee)
      (var-set upload-byte-fee-unit scaled)
      (var-set extra-batch-fee-unit new-fee)
      (ok true)
    )
  )
)

(define-public (set-wallet-fee-bps (wallet principal) (bps uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (try! (assert-valid-bps bps))
    (map-set WalletFeeBps { wallet: wallet } { bps: bps })
    (ok true)
  )
)

(define-public (clear-wallet-fee-bps (wallet principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (map-delete WalletFeeBps { wallet: wallet })
    (ok true)
  )
)

(define-private (set-wallet-fee-bps-step (entry { wallet: principal, bps: uint }) (acc bool))
  (begin
    (map-set WalletFeeBps { wallet: (get wallet entry) } { bps: (get bps entry) })
    acc
  )
)

(define-private (validate-wallet-fee-bps-step (entry { wallet: principal, bps: uint }) (acc bool))
  (if acc
    (is-ok (assert-valid-bps (get bps entry)))
    false
  )
)

(define-public (set-wallet-fee-bps-batch (entries (list 200 { wallet: principal, bps: uint })))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (fold validate-wallet-fee-bps-step entries true) ERR-INVALID-BPS)
    (fold set-wallet-fee-bps-step entries true)
    (ok true)
  )
)

(define-public (set-caller-fee-bps (caller principal) (bps uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (try! (assert-valid-bps bps))
    (map-set CallerFeeBps { caller: caller } { bps: bps })
    (ok true)
  )
)

(define-public (clear-caller-fee-bps (caller principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (map-delete CallerFeeBps { caller: caller })
    (ok true)
  )
)

(define-private (set-caller-fee-bps-step (entry { caller: principal, bps: uint }) (acc bool))
  (begin
    (map-set CallerFeeBps { caller: (get caller entry) } { bps: (get bps entry) })
    acc
  )
)

(define-private (validate-caller-fee-bps-step (entry { caller: principal, bps: uint }) (acc bool))
  (if acc
    (is-ok (assert-valid-bps (get bps entry)))
    false
  )
)

(define-public (set-caller-fee-bps-batch (entries (list 200 { caller: principal, bps: uint })))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (fold validate-caller-fee-bps-step entries true) ERR-INVALID-BPS)
    (fold set-caller-fee-bps-step entries true)
    (ok true)
  )
)

(define-public (set-next-id (value uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get offset-set)) ERR-ALREADY-SET)
    (asserts! (is-eq (var-get next-id) u0) ERR-ALREADY-SET)
    (asserts! (is-eq (var-get minted-count) u0) ERR-ALREADY-SET)
    (var-set next-id value)
    (var-set offset-set true)
    (ok true)
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
;; --- MIGRATION ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-private (record-migration-source (token-id uint) (source-contract principal) (source-id uint))
  (map-set MigrationSource token-id { source-contract: source-contract, source-id: source-id })
)

(define-public (migrate-from-v1 (token-id uint))
  (let (
    (v1-meta (unwrap! (contract-call? .xtrata-v1-1-1 get-inscription-meta token-id) ERR-NOT-FOUND))
    (v1-uri (contract-call? .xtrata-v1-1-1 get-token-uri-raw token-id))
    (v1-deps (contract-call? .xtrata-v1-1-1 get-dependencies token-id))
    (hash (get final-hash v1-meta))
    (fee (staged-begin-fee tx-sender none))
  )
    (begin
      (try! (assert-inscription-allowed))
      (asserts! (is-none (nft-get-owner? xtrata-inscription token-id)) ERR-DUPLICATE)
      (try! (maybe-pay (get amount fee)))
      (try! (contract-call? .xtrata-v1-1-1 transfer token-id tx-sender CONTRACT-PRINCIPAL))
      (try! (nft-mint? xtrata-inscription token-id tx-sender))
      (map-insert InscriptionMeta token-id {
        owner: tx-sender,
        creator: (get creator v1-meta),
        mime-type: (get mime-type v1-meta),
        total-size: (get total-size v1-meta),
        total-chunks: (get total-chunks v1-meta),
        sealed: true,
        final-hash: hash
      })
      (match v1-uri
        uri (map-set TokenURIs token-id uri)
        true
      )
      (if (> (len v1-deps) u0)
        (map-set InscriptionDependencies token-id v1-deps)
        true
      )
      (record-advisory-hash hash token-id)
      (record-migration-source token-id .xtrata-v1-1-1 token-id)
      (advance-next-id-if-needed token-id)
      (record-mint token-id)
      (ok token-id)
    )
  )
)

(define-public (migrate-from-v2-1-0 (token-id uint))
  (let (
    (meta (unwrap! (contract-call? .xtrata-v2-1-0 get-inscription-meta token-id) ERR-NOT-FOUND))
    (uri (contract-call? .xtrata-v2-1-0 get-token-uri-raw token-id))
    (deps (contract-call? .xtrata-v2-1-0 get-dependencies token-id))
    (hash (get final-hash meta))
    (fee (staged-begin-fee tx-sender none))
  )
    (begin
      (try! (assert-inscription-allowed))
      (asserts! (is-none (nft-get-owner? xtrata-inscription token-id)) ERR-DUPLICATE)
      (try! (maybe-pay (get amount fee)))
      (try! (contract-call? .xtrata-v2-1-0 transfer token-id tx-sender CONTRACT-PRINCIPAL))
      (try! (nft-mint? xtrata-inscription token-id tx-sender))
      (map-insert InscriptionMeta token-id {
        owner: tx-sender,
        creator: (get creator meta),
        mime-type: (get mime-type meta),
        total-size: (get total-size meta),
        total-chunks: (get total-chunks meta),
        sealed: true,
        final-hash: hash
      })
      (match uri
        token-uri (map-set TokenURIs token-id token-uri)
        true
      )
      (if (> (len deps) u0)
        (map-set InscriptionDependencies token-id deps)
        true
      )
      (record-advisory-hash hash token-id)
      (record-migration-source token-id .xtrata-v2-1-0 token-id)
      (advance-next-id-if-needed token-id)
      (record-mint token-id)
      (ok token-id)
    )
  )
)

(define-public (migrate-from-v2-1-1 (token-id uint))
  (let (
    (meta (unwrap! (contract-call? .xtrata-v2-1-1 get-inscription-meta token-id) ERR-NOT-FOUND))
    (uri (contract-call? .xtrata-v2-1-1 get-token-uri-raw token-id))
    (deps (contract-call? .xtrata-v2-1-1 get-dependencies token-id))
    (hash (get final-hash meta))
    (fee (staged-begin-fee tx-sender none))
  )
    (begin
      (try! (assert-inscription-allowed))
      (asserts! (is-none (nft-get-owner? xtrata-inscription token-id)) ERR-DUPLICATE)
      (try! (maybe-pay (get amount fee)))
      (try! (contract-call? .xtrata-v2-1-1 transfer token-id tx-sender CONTRACT-PRINCIPAL))
      (try! (nft-mint? xtrata-inscription token-id tx-sender))
      (map-insert InscriptionMeta token-id {
        owner: tx-sender,
        creator: (get creator meta),
        mime-type: (get mime-type meta),
        total-size: (get total-size meta),
        total-chunks: (get total-chunks meta),
        sealed: true,
        final-hash: hash
      })
      (match uri
        token-uri (map-set TokenURIs token-id token-uri)
        true
      )
      (if (> (len deps) u0)
        (map-set InscriptionDependencies token-id deps)
        true
      )
      (record-advisory-hash hash token-id)
      (record-migration-source token-id .xtrata-v2-1-1 token-id)
      (advance-next-id-if-needed token-id)
      (record-mint token-id)
      (ok token-id)
    )
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- CORE LOGIC ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (begin-or-get
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
)
  (begin
    (try! (begin-inscription expected-hash mime total-size total-chunks))
    (ok none)
  )
)

(define-public (begin-inscription
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (total-chunks uint)
)
  (begin
    (try! (assert-inscription-allowed))
    (asserts! (> total-chunks u0) ERR-INVALID-BATCH)
    (asserts! (<= total-chunks MAX-TOTAL-CHUNKS) ERR-INVALID-BATCH)
    (asserts! (<= total-size MAX-TOTAL-SIZE) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* total-chunks CHUNK-SIZE)) ERR-INVALID-BATCH)

    (match (map-get? UploadState { owner: tx-sender, hash: expected-hash })
      state
        (begin
          (try! (assert-not-expired state))
          (asserts! (is-eq (get mime-type state) mime) ERR-INVALID-BATCH)
          (asserts! (is-eq (get total-size state) total-size) ERR-INVALID-BATCH)
          (asserts! (is-eq (get total-chunks state) total-chunks) ERR-INVALID-BATCH)
          (map-set UploadState
            { owner: tx-sender, hash: expected-hash }
            (merge state { last-touched: stacks-block-height })
          )
          (ok true)
        )
      (let ((fee (staged-begin-fee tx-sender (some contract-caller))))
        (begin
          (try! (maybe-pay (get amount fee)))
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
)

(define-public (abandon-upload (expected-hash (buff 32)))
  (let (
    (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: expected-hash }) ERR-NOT-FOUND))
    (expired-height (if (>= stacks-block-height UPLOAD-EXPIRY-BLOCKS)
      (- stacks-block-height UPLOAD-EXPIRY-BLOCKS)
      u0))
  )
    (begin
      (try! (assert-inscription-allowed))
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

(define-private (seal-validate
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
)
  (let (
    (state (unwrap! (map-get? UploadState { owner: tx-sender, hash: expected-hash }) ERR-NOT-FOUND))
    (final-hash (get running-hash state))
    (chunks (get total-chunks state))
  )
    (begin
      (try! (assert-not-expired state))
      (asserts! (is-eq (get current-index state) chunks) ERR-INVALID-BATCH)
      (asserts! (is-eq final-hash expected-hash) ERR-HASH-MISMATCH)
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (ok state)
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
      (state (try! (seal-validate expected-hash token-uri-string)))
      (fee (staged-seal-fee tx-sender (some contract-caller) (get total-size state) (get total-chunks state)))
    )
      (try! (maybe-pay (get amount fee)))
      (map-delete UploadState { owner: tx-sender, hash: expected-hash })
      (commit-inscription
        new-id
        expected-hash
        tx-sender
        (get mime-type state)
        (get total-size state)
        (get total-chunks state)
        (get running-hash state)
        token-uri-string
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
    (state (try! (seal-validate (get hash item) (get token-uri item))))
    (fee (staged-seal-fee tx-sender (some contract-caller) (get total-size state) (get total-chunks state)))
  )
    (ok (+ current (get amount fee)))
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
    (state (try! (seal-validate hash token-uri)))
    (new-id (+ (get start current) (get idx current)))
  )
    (begin
      (map-delete UploadState { owner: tx-sender, hash: hash })
      (try! (commit-inscription
        new-id
        hash
        tx-sender
        (get mime-type state)
        (get total-size state)
        (get total-chunks state)
        (get running-hash state)
        token-uri
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

(define-public (seal-recursive
  (expected-hash (buff 32))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
)
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

(define-private (mint-single-tx-internal
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (let (
    (chunk-count (len chunks))
  )
    (begin
      (try! (assert-inscription-allowed))
      (try! (assert-single-tx-shape total-size chunk-count))
      (asserts! (> (len token-uri-string) u0) ERR-INVALID-URI)
      (asserts! (validate-dependencies dependencies) ERR-DEPENDENCY-MISSING)
      (try! (validate-parents parents))
      (let (
        (fee (single-tx-fee tx-sender (some contract-caller) total-size chunk-count))
        (result (fold process-chunk chunks {
          idx: u0,
          run-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
          target-hash: expected-hash,
          creator: tx-sender
        }))
      )
        (begin
          (asserts! (is-eq (get run-hash result) expected-hash) ERR-HASH-MISMATCH)
          (try! (maybe-pay (get amount fee)))
          (commit-inscription
            (var-get next-id)
            expected-hash
            tx-sender
            mime
            total-size
            chunk-count
            (get run-hash result)
            token-uri-string
            dependencies
            parents
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
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string (list) (list))
)

(define-public (mint-single-tx-recursive
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string dependencies (list))
)

(define-public (mint-single-tx-with-relationships
  (expected-hash (buff 32))
  (mime (string-ascii 64))
  (total-size uint)
  (chunks (list 50 (buff 16384)))
  (token-uri-string (string-ascii 256))
  (dependencies (list 50 uint))
  (parents (list 50 uint))
)
  (mint-single-tx-internal expected-hash mime total-size chunks token-uri-string dependencies parents)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- READ ONLY ---
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

(define-read-only (get-parents (id uint))
  (match (map-get? InscriptionParents id)
    parents parents
    (list)
  )
)

(define-read-only (get-parent-child-count (parent uint))
  (ok (default-to u0 (map-get? ParentChildCount parent)))
)

(define-read-only (get-parent-child (parent uint) (index uint))
  (map-get? ParentChildIndex { parent: parent, index: index })
)

(define-read-only (get-migration-source (id uint))
  (map-get? MigrationSource id)
)

(define-read-only (get-mint-origin (id uint))
  (map-get? MintOrigin id)
)

(define-read-only (get-upload-state (expected-hash (buff 32)) (owner principal))
  (map-get? UploadState { owner: owner, hash: expected-hash })
)

(define-read-only (get-pending-chunk (hash (buff 32)) (creator principal) (index uint))
  (map-get? Chunks { context: hash, creator: creator, index: index })
)

(define-read-only (quote-inscription-fee
  (payer principal)
  (caller (optional principal))
  (total-size uint)
  (total-chunks uint)
  (mode uint)
)
  (begin
    (try! (assert-valid-mode mode))
    (asserts! (> total-chunks u0) ERR-INVALID-BATCH)
    (asserts! (<= total-chunks MAX-TOTAL-CHUNKS) ERR-INVALID-BATCH)
    (asserts! (<= total-size MAX-TOTAL-SIZE) ERR-INVALID-BATCH)
    (asserts! (<= total-size (* total-chunks CHUNK-SIZE)) ERR-INVALID-BATCH)
    (let (
      (policy (resolve-fee-policy payer caller))
      (size-fee (size-fee-for-bytes total-size))
      (extra-batches (additional-batches total-chunks))
      (extra-batch-fee (extra-batch-fee-for-chunks total-chunks))
      (begin-fee (apply-bps (var-get staged-begin-fee-unit) (get bps policy)))
      (seal-fee (apply-bps (+ (var-get staged-seal-fee-unit) (+ size-fee extra-batch-fee)) (get bps policy)))
      (single-fee (apply-bps (+ (var-get single-tx-fee-unit) (+ size-fee extra-batch-fee)) (get bps policy)))
      (total-fee (if (is-eq mode MODE-STAGED) (+ begin-fee seal-fee) single-fee))
    )
      (ok {
        resolved-bps: (get bps policy),
        policy-source: (get source policy),
        begin-fee: begin-fee,
        seal-fee: seal-fee,
        single-tx-fee: single-fee,
        size-fee: size-fee,
        extra-batches: extra-batches,
        extra-batch-fee: extra-batch-fee,
        total-fee: total-fee
      })
    )
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; --- ADMIN READERS ---
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-admin)
  (ok (var-get contract-owner))
)

(define-read-only (is-allowed-caller (caller principal))
  (ok (is-some (map-get? AllowedCallers caller)))
)

(define-read-only (get-fee-recipient)
  (ok (var-get fee-recipient))
)

(define-read-only (get-royalty-recipient)
  (get-fee-recipient)
)

(define-read-only (get-fee-unit)
  (ok (var-get extra-batch-fee-unit))
)

(define-read-only (get-begin-fee-unit)
  (ok (var-get staged-begin-fee-unit))
)

(define-read-only (get-upload-chunk-fee-unit)
  (ok (var-get upload-byte-fee-unit))
)

(define-read-only (get-upload-batch-fee-unit)
  (ok (var-get extra-batch-fee-unit))
)

(define-read-only (get-seal-fee-unit)
  (ok (var-get staged-seal-fee-unit))
)

(define-read-only (get-single-tx-fee-unit)
  (ok (var-get single-tx-fee-unit))
)

(define-read-only (get-upload-byte-fee-unit)
  (ok (var-get upload-byte-fee-unit))
)

(define-read-only (get-extra-batch-fee-unit)
  (ok (var-get extra-batch-fee-unit))
)

(define-read-only (get-wallet-fee-bps (wallet principal))
  (match (map-get? WalletFeeBps { wallet: wallet })
    policy (some (get bps policy))
    none
  )
)

(define-read-only (get-caller-fee-bps (caller principal))
  (match (map-get? CallerFeeBps { caller: caller })
    policy (some (get bps policy))
    none
  )
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
