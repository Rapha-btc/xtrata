# Data Model and Retention

This document defines how legal signatures are stored, queried, and retained.

## D1 tables

### `legal_signature_challenges`

Purpose: one-time nonce challenges with short TTL.

Recommended columns:

- `challenge_id` TEXT PRIMARY KEY
- `nonce` TEXT NOT NULL UNIQUE
- `address` TEXT NOT NULL
- `network` TEXT NOT NULL
- `chain_id` INTEGER NOT NULL
- `domain` TEXT NOT NULL
- `app_version` TEXT NOT NULL
- `policy_version` TEXT NOT NULL
- `tos_hash` TEXT NOT NULL
- `statement_hash` TEXT NOT NULL
- `scope_csv` TEXT NOT NULL
- `message` TEXT NOT NULL
- `message_hash` TEXT NOT NULL
- `issued_at` INTEGER NOT NULL
- `expires_at` INTEGER NOT NULL
- `consumed_at` INTEGER
- `created_at` INTEGER NOT NULL

### `legal_signatures`

Purpose: durable audit records of accepted signatures.

Recommended columns:

- `signature_id` TEXT PRIMARY KEY
- `challenge_id` TEXT NOT NULL
- `address` TEXT NOT NULL
- `network` TEXT NOT NULL
- `chain_id` INTEGER NOT NULL
- `domain` TEXT NOT NULL
- `scope` TEXT NOT NULL
- `policy_version` TEXT NOT NULL
- `tos_hash` TEXT NOT NULL
- `statement_hash` TEXT NOT NULL
- `app_version` TEXT NOT NULL
- `message_hash` TEXT NOT NULL
- `signature` TEXT NOT NULL
- `public_key` TEXT NOT NULL
- `accepted_at` INTEGER NOT NULL
- `created_at` INTEGER NOT NULL

Uniqueness policy:

- `UNIQUE(address, network, scope, policy_version, tos_hash)`

This enforces "ask once per address" while still allowing re-consent when policy/TOS changes.

### `legal_signature_events` (optional but recommended)

Purpose: operational debugging and compliance traces.

Recommended fields:

- `event_id`, `challenge_id`, `address`, `scope`, `event_type`, `detail`, `created_at`

Example `event_type` values:

- `challenge_issued`
- `challenge_expired`
- `verify_success`
- `verify_failed_signature`
- `verify_failed_mismatch`

## Retention

- Accepted signatures (`legal_signatures`): retain indefinitely for legal audit.
- Challenges (`legal_signature_challenges`): keep 30-90 days, then purge.
- Events (`legal_signature_events`): keep 90-180 days (or longer if required).

## Privacy and minimization

- Required: address, signature, public key, legal policy metadata.
- Optional: IP/user-agent for abuse detection.
- If logging IP/user-agent, hash or truncate where possible.
- Do not store wallet secrets (not available and not needed).

## Migration note

Create a new migration under `functions/migrations/` (for example `002_legal_signatures.sql`) and apply it in every environment with D1:

- local dev
- preview
- production
