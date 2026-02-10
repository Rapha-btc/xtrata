# Cloudflare Setup Checklist

The collection manager backend uses Cloudflare Pages Functions plus the `DB` (D1) and `ASSETS` (R2) bindings described below. This checklist reminds you what still requires manual verification after the bindings were created.

## Existing resources
- **Pages project binding** – runs in the `xtrata-manage-functions` project bound to the `xtrata-1.0` site. The Pages build already exposes the following bindings: `context.env.DB` (D1) and `context.env.ASSETS` (R2).
- **D1 database** – `xtrata-manage`, bound as `DB`. Migrations live under `functions/migrations`; run `wrangler d1 migrations apply xtrata-manage --config functions/wrangler.toml` anytime the schema changes.
- **R2 bucket** – `xtrata-manage-assets`, bound as `ASSETS`. The `/upload-url` function issues 5-minute PUT URLs pointing to keys scoped by `collectionId`.

## Env vars you need to keep in sync
1. `VITE_ARTIST_ALLOWLIST` – comma-separated, uppercase Stacks addresses; both the gate and any future allowlist-checking functions use it.
2. `MAX_COLLECTION_STORAGE_BYTES` – maximum per-collection upload bytes (default `524288000` for 500 MB). Lower this if you want aggressive caps (100 MB = `104857600`).
3. `COLLECTION_ASSET_TTL_MS` – how long staged assets remain `draft` (default `259200000` for 3 days); after this TTL we mark them `expired` so they no longer contribute toward the storage cap.
4. (Optional) `VITE_MANAGE_FEATURE_FLAG_...` – add other feature flags here if you expose new gating options.

## Deployment steps after code changes
1. Run `wrangler d1 migrations apply xtrata-manage --config functions/wrangler.toml` locally (or `--remote` for the live D1) to ensure schema drift is addressed before deploying.
2. Confirm the Pages Functions build can read the bindings by checking `wrangler pages dev` locally or `wrangler preview` logs for `DB`/`ASSETS` initialization errors.
3. Update the Pages project `Environment variables` section for both Production and Preview to include the values above; mismatched allowlists or missing TTL overrides will manifest as blocked uploads/reservations.
4. When adding new env vars, propagate them to `functions/.env` if you rely on that file for local dev, and re-run `npm run dev` to verify.

## Storage safety guard summary
- **TTL** – each asset row records `expires_at = Date.now() + COLLECTION_ASSET_TTL_MS`. The read path auto-expired drafts whose TTL has passed, preventing stale blobs from counting toward the cap.
- **Cap** – `POST /collections/:id/assets` sums `total_bytes` for all non-`sold-out` assets and rejects uploads that would exceed `MAX_COLLECTION_STORAGE_BYTES`. The backend uses `functions/lib/collections.ts` helpers and throws a `400` error describing the active limit.
- **Reservation lifetime** – `POST /collections/:id/reserve` records `expires_at = now + durationMs (default 20m)` so the UI can show countdowns and release expired reservations manually.

## What we still need you to do on the Cloudflare side
1. Confirm the `ASSETS` bucket lifecycle (if you have a lifecycle policy, keep it aligned with `COLLECTION_ASSET_TTL_MS` so the bucket doesn’t grow unbounded).
2. Ensure the `DB` binding points to `xtrata-manage` in each environment you deploy (if you copy the Pages project for preview, double-check the binding names).
3. Provide the `VITE_ARTIST_ALLOWLIST`, `MAX_COLLECTION_STORAGE_BYTES`, and `COLLECTION_ASSET_TTL_MS` env vars in both Production and Preview; the code reads them via `import.meta.env` & `context.env` and will fall back to defaults otherwise.
4. After deploying, open the Pages Functions logs and verify that `/collections`, `/assets`, and `/reserve` return 200s; if you see missing bindings, the env section needs adjustment.

## Verification commands
- Local dev: `wrangler pages dev --bindings "{\"DB\":\"xtrata-manage\",\"ASSETS\":\"xtrata-manage-assets\"}" functions` (replace with actual command your environment uses).
- Migration: `wrangler d1 migrations apply xtrata-manage --config functions/wrangler.toml` (run this after schema updates).
- Testing: `npm run test:app` runs both frontend/unit tests and the Functions helpers (`functions/**/*.test.ts`).
