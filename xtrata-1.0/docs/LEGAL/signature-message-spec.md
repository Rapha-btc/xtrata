# Signature Message Specification

This spec defines the exact off-chain message format users sign once per wallet.

## Signature schema

- `schema`: `xtrata-legal-signature-v1`
- `policy_version`: `legal-consent-v1`
- `scope`: one or more of:
  - `public-mint`
  - `collection-deploy`
- `domain`: current app domain (example: `xtrata.pages.dev`, `xtrata.xyz`)
- `network`: `mainnet` or `testnet`
- `chain_id`:
  - mainnet: `1`
  - testnet: `2147483648`
- `app_version`: frontend release string
- `address`: signer wallet address
- `nonce`: server-generated unique nonce
- `issued_at`: UTC ISO string
- `expires_at`: UTC ISO string (recommended max: 5 minutes)
- `tos_hash`: SHA-256 hash of current terms document
- `statement_hash`: SHA-256 hash of `docs/LEGAL/consent-statement-v1.md`

## Canonical message template

Wallets currently sign plain text reliably across providers, so use a strict multiline template generated server-side.

```text
Xtrata Legal Consent
Schema: xtrata-legal-signature-v1
Policy Version: legal-consent-v1
Domain: {domain}
Network: {network}
Chain ID: {chain_id}
App Version: {app_version}
Scope: {scope_csv}
Wallet: {address}
Nonce: {nonce}
Issued At: {issued_at}
Expires At: {expires_at}
Terms Hash: {tos_hash}
Statement Hash: {statement_hash}

By signing this message, I confirm:
- I control this wallet address.
- I understand I am responsible for inscriptions and contract actions initiated with this wallet.
- I will not upload or publish unlawful, infringing, malicious, or unauthorized content.
- I understand Xtrata is a neutral protocol and does not curate content.
- I understand blockchain transactions are irreversible.
- I understand inscription data cannot be modified once written.
- I understand Xtrata does not custody my assets or keys.
```

## Message normalization rules

- Server builds the exact message string and returns it to client.
- Client must sign the exact returned message byte-for-byte.
- Backend stores:
  - full message
  - SHA-256 of message (`message_hash`)
  - signature + recovered public key
- Do not rebuild message on client from partial fields.

## Scope strategy

Default (low-friction):

- one signature includes both scopes: `public-mint,collection-deploy`.
- user signs once and is covered for both flows.

Alternative (strict):

- separate signature per scope.
- only recommended if legal counsel requires it.
