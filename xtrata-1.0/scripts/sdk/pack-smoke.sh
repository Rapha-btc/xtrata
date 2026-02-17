#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SDK_DIR="$ROOT_DIR/packages/xtrata-sdk"
RECON_DIR="$ROOT_DIR/packages/xtrata-reconstruction"
TMP_DIR="$(mktemp -d)"
NPM_CACHE_DIR="$TMP_DIR/npm-cache"
SDK_TARBALL=""
RECON_TARBALL=""

cleanup() {
  rm -rf "$TMP_DIR"
  if [[ -n "$SDK_TARBALL" && -f "$SDK_DIR/$SDK_TARBALL" ]]; then
    rm -f "$SDK_DIR/$SDK_TARBALL"
  fi
  if [[ -n "$RECON_TARBALL" && -f "$RECON_DIR/$RECON_TARBALL" ]]; then
    rm -f "$RECON_DIR/$RECON_TARBALL"
  fi
}
trap cleanup EXIT

mkdir -p "$NPM_CACHE_DIR"
export npm_config_cache="$NPM_CACHE_DIR"
export LC_ALL=C

parse_pack_filename() {
  node -e "const fs=require('fs');const input=fs.readFileSync(0,'utf8').trim();if(!input){process.exit(1);}let data;try{data=JSON.parse(input);}catch(error){console.error(input);process.exit(1);}if(!Array.isArray(data)||data.length===0||!data[0]||!data[0].filename){console.error(input);process.exit(1);}console.log(data[0].filename);"
}

echo "[sdk:pack:smoke] Building SDK packages"
npm --prefix "$SDK_DIR" run build >/dev/null
npm --prefix "$RECON_DIR" run build >/dev/null

echo "[sdk:pack:smoke] Creating tarballs"
SDK_TARBALL="$(
  cd "$SDK_DIR" &&
    npm pack --json | parse_pack_filename
)"
RECON_TARBALL="$(
  cd "$RECON_DIR" &&
    npm pack --json | parse_pack_filename
)"

extract_tarball() {
  local tarball_path="$1"
  local destination_dir="$2"
  mkdir -p "$destination_dir"
  tar -xzf "$tarball_path" -C "$destination_dir" --strip-components=1 package
}

echo "[sdk:pack:smoke] Assembling clean import sandbox"
mkdir -p "$TMP_DIR/smoke-app"
mkdir -p "$TMP_DIR/smoke-app/node_modules/@xtrata"
ln -s "$ROOT_DIR/node_modules/@stacks" "$TMP_DIR/smoke-app/node_modules/@stacks"
ln -s "$ROOT_DIR/node_modules/@noble" "$TMP_DIR/smoke-app/node_modules/@noble"
extract_tarball "$SDK_DIR/$SDK_TARBALL" "$TMP_DIR/smoke-app/node_modules/@xtrata/sdk"
extract_tarball "$RECON_DIR/$RECON_TARBALL" "$TMP_DIR/smoke-app/node_modules/@xtrata/reconstruction"

echo "[sdk:pack:smoke] Verifying package imports"
(
  cd "$TMP_DIR/smoke-app"
  node -e "import('@xtrata/sdk').then(() => console.log('sdk-ok'))"
  node -e "import('@xtrata/sdk/simple').then(() => console.log('sdk-simple-ok'))"
  node -e "import('@xtrata/sdk/workflows').then(() => console.log('sdk-workflows-ok'))"
  node -e "import('@xtrata/reconstruction').then(() => console.log('reconstruction-ok'))"
)

echo "[sdk:pack:smoke] PASS"
