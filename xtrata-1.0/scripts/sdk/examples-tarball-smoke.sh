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

echo "[sdk:examples:tarball:smoke] Building SDK packages"
npm --prefix "$SDK_DIR" run build >/dev/null
npm --prefix "$RECON_DIR" run build >/dev/null

echo "[sdk:examples:tarball:smoke] Packing SDK tarballs"
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

run_example_smoke() {
  local example_dir="$1"
  local label="$2"
  local temp_example_dir="$TMP_DIR/$label"

  mkdir -p "$temp_example_dir"
  cp -R "$example_dir/src" "$temp_example_dir/src"
  cp "$example_dir/package.json" "$temp_example_dir/package.json"
  if [[ -f "$example_dir/.env.example" ]]; then
    cp "$example_dir/.env.example" "$temp_example_dir/.env.example"
  fi

  mkdir -p "$temp_example_dir/node_modules/@xtrata"
  ln -s "$ROOT_DIR/node_modules/@stacks" "$temp_example_dir/node_modules/@stacks"
  ln -s "$ROOT_DIR/node_modules/@noble" "$temp_example_dir/node_modules/@noble"
  extract_tarball "$SDK_DIR/$SDK_TARBALL" "$temp_example_dir/node_modules/@xtrata/sdk"
  extract_tarball "$RECON_DIR/$RECON_TARBALL" "$temp_example_dir/node_modules/@xtrata/reconstruction"

  echo "[sdk:examples:tarball:smoke] Running smoke in $label"
  (
    cd "$temp_example_dir"
    XTRATA_OFFLINE=1 node src/index.js >/dev/null
  )
}

run_example_smoke "$ROOT_DIR/examples/xtrata-example-marketplace" "xtrata-example-marketplace"
run_example_smoke "$ROOT_DIR/examples/xtrata-example-campaign-engine" "xtrata-example-campaign-engine"

echo "[sdk:examples:tarball:smoke] PASS"
