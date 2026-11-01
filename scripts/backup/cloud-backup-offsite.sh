#!/usr/bin/env bash
# Encrypt the newest scheduled backup and copy it off the machine.
# The passphrase is read from a file (never from the command line or logs):
#   ~/.aqar-secrets/backup-passphrase
# Destination defaults to the user's OneDrive folder, which syncs off-device.
# Keep the passphrase somewhere safe: without it the archives cannot be opened.
set -euo pipefail

ROOT="${AQAR_BACKUP_ROOT:-/d/Backups}"
DEST_DIR="${AQAR_OFFSITE_DIR:-$HOME/OneDrive/AqarBooks-Backups}"
PASS_FILE="${AQAR_BACKUP_PASSPHRASE_FILE:-$HOME/.aqar-secrets/backup-passphrase}"
KEEP="${AQAR_OFFSITE_KEEP:-7}"

[ -r "$PASS_FILE" ] || { echo "missing passphrase file: $PASS_FILE" >&2; exit 2; }
# openssl here is a Windows build: hand it a Windows path for -pass file:
PASS_ARG="$(cygpath -w "$PASS_FILE" 2>/dev/null || printf '%s' "$PASS_FILE")"
mkdir -p "$DEST_DIR"

SRC="$(ls -1dt "$ROOT"/scheduled/*/ 2>/dev/null | head -1)"
[ -n "$SRC" ] || { echo "no scheduled backup found" >&2; exit 2; }
SRC="${SRC%/}"
STAMP="$(basename "$SRC")"
OUT="$DEST_DIR/backup-$STAMP.tar.gz.enc"

# 7.8 GB of headroom: the archive is written to the destination folder once.
tar -czf - -C "$SRC" . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS_ARG" -out "$OUT.partial"
mv "$OUT.partial" "$OUT"

# Verify the archive decrypts and matches the source before calling it done.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$PASS_ARG" -in "$OUT" | tar -xzf - -C "$TMP"
( cd "$TMP" && sha256sum -c SHA256SUMS.txt >/dev/null )
echo "offsite_ok $OUT ($(du -h "$OUT" | cut -f1))"

ls -1t "$DEST_DIR"/backup-*.tar.gz.enc 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
