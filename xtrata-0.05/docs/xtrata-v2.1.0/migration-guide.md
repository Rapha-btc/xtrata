# v1.1.1 to v2.1.0 Migration Guide

This guide explains how to continue IDs in v2.1.0 and optionally migrate
existing v1.1.1 tokens.

## Goals
- Keep the collection on a single ID sequence forever.
- Allow users to migrate legacy tokens if they want v2.1.0 features.
- Preserve v1.1.1 tokens as valid and tradable even without migration.

## Step 1: Set the v2.1.0 ID offset (one-time)

1) Read the last minted ID from v1.1.1:
   - Call `get-last-token-id()` on v1.1.1.
2) Set the next ID on v2.1.0:
   - Call `set-next-id(last-id + 1)`.

Constraints:
- `set-next-id` can only be called once.
- It must be called before any v2 mint or migration.

## Step 2: Optional migration per token

Users may migrate a v1.1.1 token into v2.1.0 using `migrate-from-v1(token-id)`.

What happens:
- v2.1.0 reads v1.1.1 metadata and token-uri.
- v2.1.0 charges the standard fee-unit once.
- v1.1.1 token is transferred into escrow (owned by v2.1.0 contract).
- v2.1.0 mints a new token with the same ID to the user.

Requirements:
- The caller must own the v1.1.1 token.
- If v2.1.0 is paused, the caller must be the owner or an allowlisted
  contract-caller.

## Content location after migration
- v2.1.0 does not copy chunk data from v1.1.1.
- For migrated tokens, chunk data remains in v1.1.1.
- Clients should read chunks from v1.1.1 when v2 chunk reads are empty.

## Notes on trading and ownership
- Users can keep tokens in v1.1.1 forever without migrating.
- Migrated tokens appear as v2.1.0 NFTs with the same ID.
- v1.1.1 tokens are escrowed by v2.1.0 and are not intended to return.

## Recommended user flow
- User selects token to migrate.
- UI confirms fee-unit and warns that v1 token will be escrowed.
- User calls `migrate-from-v1(token-id)`.
- UI displays v2 ownership and uses v1 content for rendering if needed.
