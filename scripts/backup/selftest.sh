#!/usr/bin/env bash
# End-to-end self-test of db-backup.sh with SYNTHETIC data only. Needs Docker, Node (npx supabase), openssl, curl.
# No production database, credential or bucket is involved; every resource is created here and removed at the end.
#
#   bash scripts/backup/selftest.sh
#
# Proves: dump, manifest, restore into a separate Supabase database, per-table verification, encryption, upload, read-back,
# decryption with the private key, content round trip, and that nothing sensitive reaches the log. Then two negative cases:
# a weak recipient key is refused before any dump, and a failed restore stops the run before anything is uploaded.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows would rewrite "/CN=..." and "container:/tmp/..." arguments; no effect elsewhere
cd "$(git rev-parse --show-toplevel)"
SUPABASE="${SUPABASE:-npx --no-install supabase}"
root="$(d=$(mktemp -d); cygpath -m "$d" 2>/dev/null || echo "$d")"; src="$root/source"; dst="$root/restore"; keys="$root/keys"; mkdir -p "$src" "$dst" "$keys"
S3RVER_VERSION=3.7.1   # the synthetic S3 emulator the storage CI already uses
EXCLUDE="realtime,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
SECRET=S3RVER   # s3rver verifies SigV4 against its fixed test credentials S3RVER/S3RVER
MARKER="SELFTEST-MARKER-7f3a"
pass=0; failures=()
ok() { pass=$((pass+1)); echo "  PASS $1"; }
bad() { failures+=("$1"); echo "  FAIL $1"; }
cleanup() {
  $SUPABASE stop --no-backup --workdir "$src" >/dev/null 2>&1 || true
  $SUPABASE stop --no-backup --workdir "$dst" >/dev/null 2>&1 || true
  [ -n "${s3pid:-}" ] && kill "$s3pid" 2>/dev/null || true
  rm -rf "$root"
}
trap cleanup EXIT
trap 'echo "selftest stopped at line $LINENO" >&2' ERR

echo "== disposable Supabase databases (source and restore target)"
( cd "$src" && $SUPABASE init --force >/dev/null 2>&1 ) && ( cd "$dst" && $SUPABASE init --force >/dev/null 2>&1 )
sed -i 's/^project_id = .*/project_id = "xroga-backup-selftest-src"/' "$src/supabase/config.toml"
sed -i 's/^project_id = .*/project_id = "xroga-backup-selftest-dst"/; s/= 543\([0-9][0-9]\)/= 553\1/' "$dst/supabase/config.toml"
$SUPABASE start -x "$EXCLUDE" --workdir "$src" >/dev/null
$SUPABASE start -x "$EXCLUDE" --workdir "$dst" >/dev/null
SRC_DB=supabase_db_xroga-backup-selftest-src; DST_DB=supabase_db_xroga-backup-selftest-dst

echo "== synthetic data in the source"
docker exec -i "$SRC_DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values ('11111111-2222-3333-4444-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'synthetic@example.test', now(), now());
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, notes text);
alter table public.projects enable row level security;
create policy "owner reads" on public.projects for select to authenticated using (auth.uid() = user_id);
create table public."MixedCase" (id int primary key, payload jsonb);
create table public.empty_table (id int primary key);
insert into public.projects (user_id, name, notes) select '11111111-2222-3333-4444-555555555555', 'p' || g, case when g = 1 then E'tab\there newline\nhere back\\\\slash $MARKER' end from generate_series(1, 250) g;
insert into public."MixedCase" values (1, '{"k": "v"}'), (2, null);
insert into storage.buckets (id, name, public) values ('synthetic-private', 'synthetic-private', false);
SQL

echo "== local S3 server and a throwaway recipient key"
mkdir -p "$root/s3/data" && ( cd "$root/s3" && npm init -y >/dev/null && npm i --no-audit --no-fund "s3rver@$S3RVER_VERSION" >/dev/null )
( cd "$root/s3" && exec node -e 'const S3rver=require("s3rver"); new S3rver({port:59000,address:"127.0.0.1",silent:true,directory:"data",configureBuckets:[{name:"backups"}]}).run().then(()=>console.log("up"))' > log.txt 2>&1 ) &
s3pid=$!
for _ in $(seq 1 30); do curl -fs http://127.0.0.1:59000/ >/dev/null && break; sleep 1; done
openssl req -x509 -newkey rsa:3072 -nodes -keyout "$keys/key.pem" -out "$keys/cert.pem" -subj "/CN=xroga-backup-selftest" -days 1 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$keys/weak.key" -out "$keys/weak.pem" -subj "/CN=weak" -days 1 2>/dev/null

export DUMP_ARGS="--local --workdir $src" RESTORE_CONTAINER="$DST_DB" S3_ENDPOINT=http://127.0.0.1:59000 S3_BUCKET=backups S3_ACCESS_KEY_ID=S3RVER S3_SECRET_ACCESS_KEY="$SECRET" S3_REGION=us-east-1 BACKUP_PREFIX=db/selftest SUPABASE

echo "== negative: weak recipient key refused before any dump"
if BACKUP_RECIPIENT_CERT="$(cat "$keys/weak.pem")" bash scripts/backup/db-backup.sh > "$root/weak.log" 2>&1; then bad "weak key accepted"; else grep -q "at least 3072" "$root/weak.log" && ! grep -q "dumped:" "$root/weak.log" && ok "2048-bit key refused before dumping" || bad "weak key refused for the wrong reason"; fi

echo "== positive: full run"
if BACKUP_RECIPIENT_CERT="$(cat "$keys/cert.pem")" SUMMARY_FILE="$root/summary.json" bash scripts/backup/db-backup.sh > "$root/run.log" 2>&1; then ok "backup run completed"; else bad "backup run failed: $(tail -2 "$root/run.log")"; fi
cat "$root/run.log"
grep -q "restore verified: \([0-9]*\) of \1 tables" "$root/run.log" && ok "every table verified after restore" || bad "restore verification line missing"
[ "$(docker exec "$DST_DB" psql -U postgres -d postgres -Atc 'select count(*) from public.projects')" = 250 ] && ok "restored projects = 250" || bad "restored row count wrong"
[ "$(docker exec "$DST_DB" psql -U postgres -d postgres -Atc "select count(*) from pg_policies where tablename = 'projects'")" = 1 ] && ok "RLS policy restored" || bad "RLS policy missing"
docker exec "$DST_DB" psql -U postgres -d postgres -Atc "select notes from public.projects where notes is not null" | grep -q "$MARKER" && ok "special characters survive the round trip" || bad "text content changed"
! grep -q -e "$SECRET" -e "$MARKER" -e "synthetic@example.test" -e "projects" "$root/run.log" && ok "log holds no secret, table name or row content" || bad "log leaks data"

echo "== decrypt what was uploaded, with the private key"
key=$(curl -fsS --aws-sigv4 "aws:amz:us-east-1:s3" --user "S3RVER:$SECRET" "http://127.0.0.1:59000/backups?list-type=2&prefix=db/selftest/" | grep -o '<Key>[^<]*\.tar\.cms</Key>' | head -1 | sed 's/<[^>]*>//g')
curl -fsS --aws-sigv4 "aws:amz:us-east-1:s3" --user "S3RVER:$SECRET" -o "$root/dl.cms" "http://127.0.0.1:59000/backups/$key"
[ "$(sha256sum "$root/dl.cms" | cut -d' ' -f1)" = "$(node -p 'require(process.argv[1]).cipherSha256' "$root/summary.json")" ] && ok "downloaded object matches the recorded digest" || bad "digest mismatch"
! grep -q "$MARKER" "$root/dl.cms" && ok "stored object is not plaintext" || bad "plaintext found in the stored object"
openssl cms -decrypt -binary -inform DER -in "$root/dl.cms" -inkey "$keys/key.pem" -recip "$keys/cert.pem" -out "$root/dl.tar" && ok "decrypts with the private key" || bad "decryption failed"
[ "$(sha256sum "$root/dl.tar" | cut -d' ' -f1)" = "$(node -p 'require(process.argv[1]).plainTarSha256' "$root/summary.json")" ] && ok "decrypted bundle matches the recorded plaintext digest" || bad "plaintext digest mismatch"
mkdir -p "$root/out" && tar $(tar --help 2>/dev/null | grep -q -- --force-local && echo --force-local) -C "$root/out" -xf "$root/dl.tar" && grep -q "$MARKER" "$root/out/data.sql" && ok "bundle contains the data dump" || bad "bundle incomplete"
! openssl cms -decrypt -binary -inform DER -in "$root/dl.cms" -inkey "$keys/weak.key" -recip "$keys/weak.pem" -out /dev/null 2>/dev/null && ok "another key cannot decrypt" || bad "decrypted with the wrong key"

echo "== negative: a failed restore stops the run before upload"
before=$(curl -fsS --aws-sigv4 "aws:amz:us-east-1:s3" --user "S3RVER:$SECRET" "http://127.0.0.1:59000/backups?list-type=2&prefix=db/selftest/" | grep -o '<Key>' | wc -l)
# the restore target already holds the tables now, so Supabase's single-transaction restore must fail
if BACKUP_RECIPIENT_CERT="$(cat "$keys/cert.pem")" bash scripts/backup/db-backup.sh > "$root/fail.log" 2>&1; then bad "restore into a non-empty database was accepted"; else
  after=$(curl -fsS --aws-sigv4 "aws:amz:us-east-1:s3" --user "S3RVER:$SECRET" "http://127.0.0.1:59000/backups?list-type=2&prefix=db/selftest/" | grep -o '<Key>' | wc -l)
  grep -q "restore into the disposable database failed" "$root/fail.log" && [ "$before" = "$after" ] && ok "failed restore uploads nothing" || bad "failed restore handled wrongly"; fi

echo
echo "selftest: $pass passed, ${#failures[@]} failed"
[ ${#failures[@]} -eq 0 ]
