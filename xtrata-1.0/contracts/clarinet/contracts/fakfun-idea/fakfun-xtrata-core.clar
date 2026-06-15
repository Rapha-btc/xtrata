;; fakfun-xtrata-core
;; Thin indexing wrapper over the per-collection xtrata registries
;; (leo-fakfun-xtrata and every registry built from it onward).
;;
;; The frontend calls inscribe / swap-* HERE, passing the target registry as a
;; trait. We forward each call unchanged and emit ONE unified print tagged with
;; the registry principal, so a single chainhook on this contract indexes every
;; registry's forever + escrow events -- no per-registry watcher, no new indexer
;; each time we ship a collection.
;;
;; tx-sender is preserved through `contract-call?`, so the registry still charges
;; the fee, checks the canonical hash, and binds against the real user exactly as
;; if called directly. This layer adds only the unified event; it holds no funds
;; and has no privileged state.
;;
;; Note: the already-deployed pepe-4ever-fakfun uses pepe-specific swap names and
;; predates this core, so it is indexed on its own dedicated feed; every registry
;; from leo onward conforms to the single trait below and routes through here.

(define-trait registry-trait
  (
    ;; (inscribe token-id expected-hash mime total-size chunks token-uri) -> xtrata-id
    (inscribe
      (uint (buff 32) (string-ascii 64) uint (list 32 (buff 16384)) (string-ascii 256))
      (response uint uint)
    )
    ;; escrow the NFT to take custody of the twin, and back
    (swap-nft-for-xtrata (uint) (response bool uint))
    (swap-xtrata-for-nft (uint) (response bool uint))
    ;; running total of inscriptions, for the unified print
    (get-inscribed-count () (response uint uint))
  )
)

(define-public (inscribe
    (registry <registry-trait>)
    (token-id uint)
    (expected-hash (buff 32))
    (mime (string-ascii 64))
    (total-size uint)
    (chunks (list 32 (buff 16384)))
    (token-uri (string-ascii 256))
  )
  (let ((xtrata-id (try! (contract-call? registry inscribe
      token-id expected-hash mime total-size chunks token-uri
    ))))
    (print {
      event: "inscribed",
      registry: (contract-of registry),
      token-id: token-id,
      xtrata-id: xtrata-id,
      content-hash: expected-hash,
      inscriber: tx-sender,
      inscribed-count: (try! (contract-call? registry get-inscribed-count)),
    })
    (ok xtrata-id)
  )
)

;; Escrow your NFT with the registry, take custody of the Xtrata twin.
(define-public (swap-nft-for-xtrata
    (registry <registry-trait>)
    (token-id uint)
  )
  (begin
    (try! (contract-call? registry swap-nft-for-xtrata token-id))
    (print {
      event: "swap-nft-for-xtrata",
      registry: (contract-of registry),
      token-id: token-id,
      holder: tx-sender,
    })
    (ok true)
  )
)

;; Return the Xtrata twin to the registry, take your NFT back.
(define-public (swap-xtrata-for-nft
    (registry <registry-trait>)
    (token-id uint)
  )
  (begin
    (try! (contract-call? registry swap-xtrata-for-nft token-id))
    (print {
      event: "swap-xtrata-for-nft",
      registry: (contract-of registry),
      token-id: token-id,
      holder: tx-sender,
    })
    (ok true)
  )
)
