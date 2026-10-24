#!/usr/bin/env bash
# Encrypted, restore-verified logical backup of the Xroga Supabase database.
#
# Order matters and each step must pass before the next:
#   1. dump      supabase db dump (roles, schema, data) from the source database
#   2. manifest  per-table row counts read from the dump itself (deterministic, no extra production query)
#   3. restore   into a disposable local Supabase database, using Supabase's documented restore command
#   4. verify    every table's restored row count equals the manifest
#   5. encrypt   CMS AuthEnvelopedData, AES-256-GCM, to the founder's RSA public certificate (the private key is never in CI)
#   6. upload    to the private R2 bucket with SigV4; read the object back and compare its SHA-256
#   7. cleanup   plaintext removed; the runner is discarded after the job
#
# Prints sizes and the ciphertext digest only: no URL, credential, table name or row count reaches the log.
# Required environment:
#   DUMP_ARGS            how to reach the source, e.g. '--db-url <url>' (CI) or '--local --workdir <dir>' (self-test)
#   RESTORE_CONTAINER    docker container name of the disposable restore database (a local `supabase start` db)
#   BACKUP_RECIPIENT_CERT  PEM certificate holding the RSA (>= 3072 bit) public key backups are encrypted to
#   S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY [S3_REGION=auto] [BACKUP_PREFIX=db/xroga-ai]
# Optional: SUPABASE (default "npx --no-install supabase"), SUMMARY_FILE (non-sensitive JSON summary is written there).
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows would rewrite "/CN=..." and "container:/tmp/..." arguments; no effect elsewhere
umask 077
: "${DUMP_ARGS:?}" "${RESTORE_CONTAINER:?}" "${BACKUP_RECIPIENT_CERT:?}" "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"
# the disposable target is a local supabase/postgres image, where only supabase_admin may set the role parameters a roles dump contains
RESTORE_USER="${RESTORE_USER:-supabase_admin}"
S3_REGION="${S3_REGION:-auto}"; BACKUP_PREFIX="${BACKUP_PREFIX:-db/xroga-ai}"; SUPABASE="${SUPABASE:-npx --no-install supabase}"
work="$(d=$(mktemp -d); cygpath -m "$d" 2>/dev/null || echo "$d")"; trap 'rm -rf "$work"' EXIT
log() { printf '[backup] %s\n' "$*"; }
fail() { printf '[backup] FAILED: %s\n' "$*" >&2; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
size() { wc -c < "$1" | tr -d ' '; }

# 0. the recipient must be a real, strong public key; refuse anything else before touching data
printf '%s\n' "$BACKUP_RECIPIENT_CERT" > "$work/recipient.pem"
bits=$(openssl x509 -in "$work/recipient.pem" -noout -text 2>/dev/null | sed -n 's/.*Public-Key: (\([0-9]*\) bit).*/\1/p' | head -1)
openssl x509 -in "$work/recipient.pem" -noout -text 2>/dev/null | grep -q 'rsaEncryption' || fail "recipient certificate is not an RSA certificate"
[ "${bits:-0}" -ge 3072 ] || fail "recipient key is ${bits:-unknown} bits; at least 3072 required"

# 1. dump (CLI output kept out of the log: it can echo connection details)
started=$(date -u +%Y-%m-%dT%H:%M:%SZ); stamp=$(date -u +%Y%m%dT%H%M%SZ)
for part in "roles.sql --role-only" "schema.sql" "data.sql --use-copy --data-only"; do
  set -- $part
  # shellcheck disable=SC2086
  $SUPABASE db dump $DUMP_ARGS -f "$work/$1" "${@:2}" > "$work/dump-$1.log" 2>&1 || fail "dump of $1 failed (CLI output withheld from the log)"
  [ -s "$work/$1" ] || [ "$1" = roles.sql ] || fail "dump of $1 is empty"
done
log "dumped: roles $(size "$work/roles.sql") B, schema $(size "$work/schema.sql") B, data $(size "$work/data.sql") B"

# 2. manifest: rows per COPY block in the data dump
awk '
  /^COPY [^ ]+ .*FROM stdin;$/ { t=$2; n=0; inblock=1; next }
  inblock && /^\\\.$/ { print t "\t" n; inblock=0; next }
  inblock { n++ }
' "$work/data.sql" | sort > "$work/manifest.tsv"   # names stay quoted exactly as pg_dump wrote them
tables=$(wc -l < "$work/manifest.tsv" | tr -d ' ')
[ "$tables" -gt 0 ] || fail "the data dump contains no tables"

# 3. restore with Supabase's documented command, into the disposable database only
docker exec "$RESTORE_CONTAINER" true 2>/dev/null || fail "restore container $RESTORE_CONTAINER is not running"
docker exec "$RESTORE_CONTAINER" psql -U "$RESTORE_USER" -d postgres -Atc "select current_database()" >/dev/null || fail "restore database is not reachable"
for f in roles.sql schema.sql data.sql; do docker cp "$work/$f" "$RESTORE_CONTAINER:/tmp/$f" >/dev/null; done
docker exec "$RESTORE_CONTAINER" psql -U "$RESTORE_USER" -d postgres --single-transaction --variable ON_ERROR_STOP=1 \
  --file /tmp/roles.sql --file /tmp/schema.sql --command 'SET session_replication_role = replica' --file /tmp/data.sql > "$work/restore.log" 2>&1 \
  || { docker exec "$RESTORE_CONTAINER" rm -f /tmp/roles.sql /tmp/schema.sql /tmp/data.sql; fail "restore into the disposable database failed: $(grep -m1 -o 'ERROR: [^\"]*' "$work/restore.log" | cut -c1-120)"; }
docker exec "$RESTORE_CONTAINER" rm -f /tmp/roles.sql /tmp/schema.sql /tmp/data.sql

# 4. verify every table
mismatch=0
while IFS=$'\t' read -r t n; do
  got=$(docker exec "$RESTORE_CONTAINER" psql -U "$RESTORE_USER" -d postgres -Atc "select count(*) from $t" 2>/dev/null || echo ERR)
  [ "$got" = "$n" ] || mismatch=$((mismatch + 1))
done < "$work/manifest.tsv"
[ "$mismatch" -eq 0 ] || fail "$mismatch of $tables tables differ after restore"
log "restore verified: $tables of $tables tables match the dump"

# 5. encrypt (bundle then CMS AES-256-GCM to the recipient)
# --force-local: GNU tar would read a Windows path "C:/..." as a remote host
TAR_LOCAL=$(tar --help 2>/dev/null | grep -q -- --force-local && echo --force-local || true)
tar $TAR_LOCAL -C "$work" -cf "$work/bundle.tar" roles.sql schema.sql data.sql manifest.tsv || fail "bundling failed"
plain_sha=$(sha "$work/bundle.tar")
openssl cms -encrypt -binary -aes-256-gcm -outform DER -in "$work/bundle.tar" -out "$work/bundle.tar.cms" "$work/recipient.pem" || fail "encryption failed"
rm -f "$work/roles.sql" "$work/schema.sql" "$work/data.sql" "$work/bundle.tar"
cipher_sha=$(sha "$work/bundle.tar.cms"); cipher_size=$(size "$work/bundle.tar.cms")
cat > "$work/bundle.json" <<JSON
{"started":"$started","format":"supabase-db-dump roles+schema+data, tar, CMS AuthEnvelopedData AES-256-GCM (RSA recipient)","cipherSha256":"$cipher_sha","cipherBytes":$cipher_size,"plainTarSha256":"$plain_sha","tablesVerified":$tables,"recipientSha256":"$(openssl x509 -in "$work/recipient.pem" -noout -fingerprint -sha256 | cut -d= -f2)"}
JSON

# 6. upload and read back
key="$BACKUP_PREFIX/${stamp:0:4}/${stamp:4:2}/$stamp-${cipher_sha:0:12}.tar.cms"
s3() { curl -fsS --retry 3 --aws-sigv4 "aws:amz:$S3_REGION:s3" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" "$@"; }
s3 -T "$work/bundle.tar.cms" -H 'Content-Type: application/octet-stream' "$S3_ENDPOINT/$S3_BUCKET/$key" >/dev/null || fail "upload failed"
s3 -T "$work/bundle.json" -H 'Content-Type: application/json' "$S3_ENDPOINT/$S3_BUCKET/$key.json" >/dev/null || fail "upload of the sidecar failed"
s3 -o "$work/readback.cms" "$S3_ENDPOINT/$S3_BUCKET/$key" || fail "read-back failed"
[ "$(sha "$work/readback.cms")" = "$cipher_sha" ] || fail "read-back digest differs from the uploaded backup"
log "uploaded and read back: $cipher_size B, sha256 $cipher_sha"

# 7. summary (non-sensitive)
if [ -n "${SUMMARY_FILE:-}" ]; then cp "$work/bundle.json" "$SUMMARY_FILE"; fi
log "done"
