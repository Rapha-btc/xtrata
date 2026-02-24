#!/usr/bin/env bash
set -euo pipefail

# Directory where this script lives (repo root)
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Fixed source directory
SRC="$ROOT_DIR/xtrata-1.0"
BACKUP_DIR="$ROOT_DIR/backups"

if [ ! -d "$SRC" ]; then
  echo "Source folder not found: $SRC" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

PREFIX="xtrata-0"
next=1

while :; do
  DEST="$BACKUP_DIR/${PREFIX}.$(printf "%02d" "$next")"
  if [ ! -e "$DEST" ]; then
    break
  fi
  next=$((next + 1))
done

rsync -a "$SRC/" "$DEST/"

printf "Cloned %s -> %s\n" "$(basename "$SRC")" "${DEST#$ROOT_DIR/}"


// USE ./clone-version.sh xtrata-1.0 to clone the xtrata-1.0 folder to a new backup folder with an incremented name (e.g., xtrata-0.01, xtrata-0.02, etc.) in the backups directory.