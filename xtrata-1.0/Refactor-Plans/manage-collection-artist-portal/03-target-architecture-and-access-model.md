# Target Architecture and Access Model

## Primary UX outcome

An allowlisted artist opens a dedicated management page and can:

1. create/deploy a collection-mint contract,
2. configure collection settings end-to-end,
3. upload a folder of mintable assets,
4. publish a buyer-facing collection page.

Buyers can mint from staged assets through the existing on-chain mint flow.

## Architecture overview

### Frontend surfaces

1. Artist management app/page (new)
- route example: `/manage` (or `/admin/collections` if kept inside admin shell).
- sections:
  - collections list,
  - create collection wizard,
  - collection settings,
  - asset staging,
  - publish and monitoring.

2. Buyer collection page (new or integrated into public app)
- route example: `/c/:slug`.
- displays collection metadata and mintable assets.

### Backend services (Pages Functions)

1. Collection Registry API
- stores collection metadata and ownership mapping.

2. Asset Staging API
- accepts uploads, computes/validates hashes/chunks, writes manifest rows.

3. Publish API
- atomically flips a collection from draft to published.

4. Mint State API (MVP off-chain state)
- tracks staged-asset availability/edition counters to prevent oversell.

### Storage

1. Object storage for staged files and derived chunk payloads.
2. Metadata store for collections/assets/editions.
3. Optional cache layer for hot reads.

## Access control model

### Gate 1: Platform manager allowlist

1. Add dedicated env allowlist (separate from full admin allowlist).
2. Block entry at page gate if wallet address is not allowlisted.

### Gate 2: Collection owner authorization

1. For any mutating action on a collection contract:
- read `get-owner` from target collection contract,
- require connected wallet equals owner.

2. Registry updates enforce the same owner identity.

### Gate 3: Action-level permissions

1. Draft metadata edits: owner only.
2. Upload/publish/unpublish: owner only.
3. Buyer mint endpoints: public, but inventory checks and caps enforced.

## Core flow design

### A) Create collection

1. Artist enters display name + slug + contract name.
2. Deploy wizard preloads `xtrata-collection-mint-v1.0` source.
3. On deploy success, registry record is created in draft state.

### B) Configure contract

1. Setup wizard executes in explicit order:
- set max supply,
- set recipients,
- set splits,
- set mint price,
- set allowlist mode/max-per-wallet,
- set paused false when ready.
2. Optional core allowlist call for collection contract (`set-allowed-caller` on v2 core).

### C) Upload and publish assets

1. Artist uploads folder.
2. Backend computes expected hash/chunks and writes asset manifest rows.
3. Artist sets per-asset token URI and edition settings.
4. Publish action makes collection visible to buyers.

### D) Buyer mint

1. Buyer chooses published asset.
2. App fetches manifest + staged bytes/chunks.
3. Existing collection mint flow runs on buyer wallet:
- `mint-begin`,
- `mint-add-chunk-batch` (chunked),
- `mint-seal` or `mint-seal-batch`.
4. Buyer sees minted token in viewer/wallet.

## Safety controls

1. Strict network checks (wallet network must match contract network).
2. Preflight checks before every mutating tx.
3. Retry + resume support for upload and mint steps.
4. Reservation recovery tools using `release-reservation`.
5. Explicit irreversible warnings for `set-max-supply` and `finalize`.

## Non-goal boundary for MVP

No protocol change required. MVP remains compatible with current
`xtrata-collection-mint-v1.0` and existing core mint order.
