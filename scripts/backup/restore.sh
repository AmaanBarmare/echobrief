#!/usr/bin/env bash
# Manual restore of an encrypted EchoBrief DB backup.
#
# Usage:
#   BACKUP_PASSPHRASE=... scripts/backup/restore.sh <backup.tar.gz.enc> <target-database-url> [--i-really-mean-it]
#
# Example (throwaway local Postgres 17):
#   docker run -d --name eb-restore -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17
#   BACKUP_PASSPHRASE=... scripts/backup/restore.sh \
#     echobrief-db-2026-08-31.tar.gz.enc \
#     "postgresql://postgres:pw@127.0.0.1:55432/postgres"
#
# What it does, in order:
#   1. Decrypts the blob (AES-256-CBC, PBKDF2, 200k iterations) with
#      $BACKUP_PASSPHRASE and unpacks public.sql + auth_users.sql.
#   2. Creates minimal auth/extensions stubs on the target (auth.uid() etc.)
#      so the Supabase-flavoured dump applies to a vanilla Postgres.
#      Skip with --no-stubs when restoring into a real Supabase project,
#      which already has the auth schema.
#   3. Restores auth_users.sql, then public.sql (public FKs into auth.users).
#   4. Prints row counts for the core tables so you can see it worked.
#
# Safety: refuses to touch the production host unless --i-really-mean-it is
# passed. Restoring over prod REPLACES NOTHING automatically (the dump has no
# DROPs), but duplicate-key errors on existing rows will make the output
# noisy and partial — prefer a fresh database.
#
# Get a backup:  gh release download backup-YYYY-MM-DD \
#                  --repo Oltaflock-AI/echobrief-backups --pattern '*.enc'
set -euo pipefail

PROD_HOST="db.lekkpfpojlspbuwrtmzt.supabase.co"
PROD_REF="lekkpfpojlspbuwrtmzt"

usage() {
  echo "Usage: BACKUP_PASSPHRASE=... $0 <backup.tar.gz.enc> <postgres-url> [--i-really-mean-it] [--no-stubs]" >&2
  exit 2
}

[ "$#" -ge 2 ] || usage
ENC_FILE="$1"
DB_URL="$2"
shift 2
MEAN_IT=false
STUBS=true
for arg in "$@"; do
  case "$arg" in
    --i-really-mean-it) MEAN_IT=true ;;
    --no-stubs) STUBS=false ;;
    *) usage ;;
  esac
done

[ -f "$ENC_FILE" ] || { echo "ERROR: no such file: $ENC_FILE" >&2; exit 1; }
[ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "ERROR: BACKUP_PASSPHRASE env var is not set." >&2; exit 1; }
command -v psql > /dev/null || { echo "ERROR: psql not found on PATH." >&2; exit 1; }
command -v openssl > /dev/null || { echo "ERROR: openssl not found on PATH." >&2; exit 1; }

case "$DB_URL" in
  *"$PROD_HOST"* | *"$PROD_REF"*)
    if [ "$MEAN_IT" != true ]; then
      echo "ERROR: target URL points at PRODUCTION ($PROD_HOST)." >&2
      echo "If you are certain (e.g. restoring into a freshly reset project), re-run with --i-really-mean-it." >&2
      exit 1
    fi
    echo "WARNING: restoring against PRODUCTION because --i-really-mean-it was passed."
    ;;
esac

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Decrypting $ENC_FILE"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_PASSPHRASE -in "$ENC_FILE" -out "$WORKDIR/backup.tar.gz" \
  || { echo "ERROR: decryption failed — wrong BACKUP_PASSPHRASE, or corrupt file." >&2; exit 1; }

echo "==> Unpacking"
tar -xzf "$WORKDIR/backup.tar.gz" -C "$WORKDIR"
for f in public.sql auth_users.sql; do
  [ -s "$WORKDIR/$f" ] || { echo "ERROR: $f missing/empty in archive." >&2; exit 1; }
  echo "    $f: $(wc -c < "$WORKDIR/$f") bytes"
done

if [ "$STUBS" = true ]; then
  echo "==> Creating auth/extensions stubs on target (skip with --no-stubs)"
  psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$ SELECT NULL::jsonb $$;
SQL
fi

echo "==> Restoring auth.users (errors on Supabase-managed statements are expected and logged)"
psql "$DB_URL" -f "$WORKDIR/auth_users.sql" 2> "$WORKDIR/auth_errors.log" || true
echo "    $(grep -c '^ERROR' "$WORKDIR/auth_errors.log" || true) error lines (see below if any)"

echo "==> Restoring public schema"
psql "$DB_URL" -f "$WORKDIR/public.sql" 2> "$WORKDIR/public_errors.log" || true
echo "    $(grep -c '^ERROR' "$WORKDIR/public_errors.log" || true) error lines (see below if any)"

for log in auth_errors.log public_errors.log; do
  if [ -s "$WORKDIR/$log" ]; then
    echo "---- $log ----"
    cat "$WORKDIR/$log"
  fi
done

echo "==> Row counts on target:"
for t in public.meetings public.transcripts public.meeting_insights public.profiles auth.users; do
  count=$(psql "$DB_URL" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "MISSING")
  echo "    $t: $count"
done

echo "Done. If any table above says MISSING or 0, read the error logs printed above."
