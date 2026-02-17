#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SDK_DIR="$ROOT_DIR/packages/xtrata-sdk"
RECON_DIR="$ROOT_DIR/packages/xtrata-reconstruction"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/sdk"
NPM_CACHE_DIR="$ARTIFACT_DIR/npm-cache"

mkdir -p "$ARTIFACT_DIR"
mkdir -p "$NPM_CACHE_DIR"
export npm_config_cache="$NPM_CACHE_DIR"
export LC_ALL=C

echo "[sdk:release:dry-run] Generating changelog"
npm --prefix "$ROOT_DIR" run sdk:changelog:generate

echo "[sdk:release:dry-run] Running release gates"
npm --prefix "$ROOT_DIR" run sdk:docs:validate
npm --prefix "$ROOT_DIR" run sdk:typecheck
npm --prefix "$ROOT_DIR" run sdk:build
npm --prefix "$ROOT_DIR" run sdk:test
npm --prefix "$ROOT_DIR" run sdk:pack:smoke
npm --prefix "$ROOT_DIR" run sdk:examples:smoke
npm --prefix "$ROOT_DIR" run sdk:examples:tarball:smoke
npm --prefix "$ROOT_DIR" run sdk:version:check

echo "[sdk:release:dry-run] Publishing dry-run checks"
(
  cd "$SDK_DIR"
  npm publish --dry-run >"$ARTIFACT_DIR/xtrata-sdk.publish.dry-run.txt"
)
(
  cd "$RECON_DIR"
  npm publish --dry-run >"$ARTIFACT_DIR/xtrata-reconstruction.publish.dry-run.txt"
)

echo "[sdk:release:dry-run] Packing release artifacts"
(
  cd "$SDK_DIR"
  npm pack --pack-destination "$ARTIFACT_DIR" >/dev/null
)
(
  cd "$RECON_DIR"
  npm pack --pack-destination "$ARTIFACT_DIR" >/dev/null
)

echo "[sdk:release:dry-run] PASS"
echo "[sdk:release:dry-run] Artifacts: $ARTIFACT_DIR"
