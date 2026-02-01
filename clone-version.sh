#!/usr/bin/env bash
set -euo pipefail

# Directory where this script lives (repo root)
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Fixed source directory
SRC="$ROOT_DIR/xtrata-1.0"

if [ ! -d "$SRC" ]; then
  echo "Source folder not found: $SRC" >&2
  exit 1
fi

PREFIX="xtrata-0"
next=1

while :; do
  DEST="$ROOT_DIR/${PREFIX}.$(printf "%02d" "$next")"
  if [ ! -e "$DEST" ]; then
    break
  fi
  next=$((next + 1))
done

rsync -a "$SRC/" "$DEST/"

printf "Cloned %s -> %s\n" "$(basename "$SRC")" "$(basename "$DEST")"
