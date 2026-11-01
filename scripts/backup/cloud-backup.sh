#!/usr/bin/env bash
# Scheduled logical backup of the production Supabase database.
# Keeps every copy (no automatic deletion): each run is ~48 MB.
# Credentials come from the Supabase CLI keyring; no secret is written here.
set -euo pipefail

ROOT="${AQAR_BACKUP_ROOT:-/d/Backups}"
CLI="${SUPABASE_CLI:-$HOME/scoop/shims/supabase.exe}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$ROOT/scheduled/$STAMP"
LOG_DIR="$ROOT/logs"

mkdir -p "$DEST" "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/backup-$STAMP.log") 2>&1

cd "$REPO_ROOT"
echo "== backup start $(date -u +%FT%TZ) -> $DEST"
"$CLI" db dump --schema public -f "$DEST/public_schema.sql"
"$CLI" db dump --data-only --schema public -f "$DEST/public_data.sql"
"$CLI" db dump --schema auth -f "$DEST/auth_schema.sql"
"$CLI" db dump --data-only --schema auth -f "$DEST/auth_data.sql"
"$CLI" db dump --role-only -f "$DEST/roles.sql"

( cd "$DEST" && sha256sum *.sql > SHA256SUMS.txt )

test -s "$DEST/public_schema.sql"
test -s "$DEST/public_data.sql"
test -s "$DEST/auth_data.sql"
echo "== backup ok $(date -u +%FT%TZ)"
