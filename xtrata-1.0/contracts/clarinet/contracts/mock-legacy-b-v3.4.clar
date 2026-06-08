(define-non-fungible-token legacy-nft uint)
(define-map Hashes uint (buff 32))
(define-constant ERR-NA (err u100))

;; test-only: mint a legacy token to tx-sender with a recorded final-hash
(define-public (test-mint (id uint) (final-hash (buff 32)))
  (begin
    (try! (nft-mint? legacy-nft id tx-sender))
    (map-set Hashes id final-hash)
    (ok id)))

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? legacy-nft id)))

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NA)
    (asserts! (is-eq (some sender) (nft-get-owner? legacy-nft id)) ERR-NA)
    (nft-transfer? legacy-nft id sender recipient)))

(define-read-only (get-inscription-hash (id uint))
  (map-get? Hashes id))
