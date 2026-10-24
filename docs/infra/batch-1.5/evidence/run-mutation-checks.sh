#!/usr/bin/env bash
# Proves the tests can fail: injects deliberate defects one at a time, expects at least one failing test each, restores the file.
# Phase 1 groups first; Phase 2 adds the database-TLS group. MUTATION_LOG overrides the log path (Phase 2 writes under phase-2/).
set -u
cd "$(dirname "$0")/../../../../backend"
OUT="../docs/infra/batch-1.5/evidence/logs"; mkdir -p "$OUT"; LOG="${MUTATION_LOG:-$OUT/07-mutation-checks.log}"; mkdir -p "$(dirname "$LOG")"; : > "$LOG"
M=../supabase/migrations/20261022000000_storage_drive_foundation.sql
mut() { # name file python-replace-old python-replace-new testfiles...
  name="$1"; file="$2"; old="$3"; new="$4"; shift 4
  cp "$file" /tmp/mut.bak
  OLD="$old" NEW="$new" FILE="$file" python3 - <<'PY'
import os
p=os.environ['FILE']; s=open(p).read()
assert os.environ['OLD'] in s, 'mutation target not found'
open(p,'w').write(s.replace(os.environ['OLD'],os.environ['NEW'],1))
PY
  res=$(npx tsx --test "$@" 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')
  cp /tmp/mut.bak "$file"
  fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/')
  verdict=$([ "${fails:-0}" -gt 0 ] && echo CAUGHT || echo SURVIVED)
  echo "$verdict | $name | $res" | tee -a "$LOG"
}
S=src/storage/storageService.ts
mut "service: skip declared-checksum comparison" $S "if (cur.sha256Declared && sha256 !== cur.sha256Declared)" "if (false && cur.sha256Declared && sha256 !== cur.sha256Declared)" src/storage/storageService.test.ts
mut "service: no tenant/owner check on object access" $S "if (!o || o.tenantId !== actor.tenantId || o.ownerUserId !== actor.userId) throw" "if (!o) throw" src/storage/storageService.test.ts
# size is checked twice (HEAD, then the streamed byte count): a single-check removal is an equivalent mutant, so remove both
cp $S /tmp/mut.bak
python3 - <<'PY'
p='src/storage/storageService.ts'; s=open(p).read()
a="if (head.size !== cur.declaredSize) await fail("; b="if (size !== cur.declaredSize) await fail("
assert a in s and b in s
open(p,'w').write(s.replace(a,"if (false) await fail(",1).replace(b,"if (false) await fail(",1))
PY
res=$(npx tsx --test src/storage/storageService.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '); cp /tmp/mut.bak $S
fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/'); verdict=$([ "${fails:-0}" -gt 0 ] && echo CAUGHT || echo SURVIVED)
echo "$verdict | service: skip BOTH size verifications | $res" | tee -a "$LOG"
mut "memory repo: commit replay double counts" src/storage/repository.ts "if (r.state === 'COMMITTED') return 'ALREADY_COMMITTED';" "if (r.state === 'COMMITTED') { this.#u(r.tenantId).committedBytes += actual; return 'ALREADY_COMMITTED'; }" src/storage/storageService.test.ts
mut "migration: skip source-vs-destination hash comparison" src/storage/migration/engine.ts "if (object.sha256Verified !== sourceSha || object.sizeBytes !== opened.size) {" "if (false) {" src/storage/migration/engine.test.ts
mut "approvals: signature not verified" src/storage/migration/approvals.ts "if (!verify(null, payload, createPublicKey(publicKeyPem), Buffer.from(s, 'base64url'))) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "approvals: plan digest not compared" src/storage/migration/approvals.ts "if (claims.planDigest !== e.planDigest) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "approvals: environment not compared" src/storage/migration/approvals.ts "if (claims.environment !== e.environment) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "config: invalid STORAGE_WRITE_MODE silently accepted" src/storage/runtime.ts "else problems.push(\`STORAGE_WRITE_MODE=" "else void (\`STORAGE_WRITE_MODE=" src/storage/config.matrix.test.ts
mut "provider errors: ECONNREFUSED not transient" src/storage/r2ObjectStore.ts "'ECONNREFUSED', 'ENOTFOUND'" "'ENOTFOUND'" src/storage/r2ObjectStore.test.ts
# Phase 2 · database TLS (INFRA-005 prerequisite)
T=src/storage/databaseTls.ts; TT=src/storage/databaseTls.test.ts
mut "db tls: certificate verification off for remote hosts" $T "const ssl: tls.ConnectionOptions = { rejectUnauthorized: true," "const ssl: tls.ConnectionOptions = { rejectUnauthorized: false," $TT
mut "db tls: loopback decided by searching the URL text (the Phase 1 bug)" $T "if (isLoopback(host)) return" 'if (/localhost|127\.0\.0\.1|sslmode=disable/.test(url)) return' $TT
mut "db tls: sslmode=no-verify / disable accepted" $T "  if (weakens) {" "  if (false as boolean) {" $TT
mut "db tls: raw URL handed to pg (lets sslmode override ssl)" $T "const base: PoolConfig = {" "const base: PoolConfig = { connectionString: url," $TT
mut "db tls: Supabase suffix without a dot boundary" $T '/(^|\.)supabase\.(co|com)$/' '/supabase\.(co|com)$/' $TT
mut "db tls: pinned-root fingerprint not checked" $T "new X509Certificate(blocks[0]).fingerprint256 !== expectedSha256" "false" $TT
mut "db tls: several certificates accepted as the pinned root" $T "blocks.length !== 1 ||" "false ||" $TT
if [ -n "${STORAGE_TEST_DATABASE_URL:-}" ]; then
mut "SQL: drop READY-is-verified CHECK" $M "check (state <> 'READY' or (size_bytes is not null and sha256_verified is not null and verified_at is not null))" "check (true)" src/storage/postgresRepository.integration.test.ts
mut "SQL: remove tenant row lock in storage_reserve" $M "select * into u from public.storage_usage where tenant_id = p_tenant for update;" "select * into u from public.storage_usage where tenant_id = p_tenant;" src/storage/postgresRepository.integration.test.ts
mut "SQL: FORCE RLS removed from storage_objects" $M "alter table public.storage_objects          force row level security;" "-- removed" src/storage/schemaUpgrade.integration.test.ts
mut "SQL: search_path pin removed from storage_reserve" $M ") returns text language plpgsql set search_path = public, pg_temp as \$\$" ") returns text language plpgsql as \$\$" src/storage/schemaUpgrade.integration.test.ts
mut "SQL: authenticated can read object_key" $M "grant select (id, tenant_id," "grant select (object_key, id, tenant_id," src/storage/postgresRepository.integration.test.ts
fi
git -C .. diff --quiet -- backend supabase && echo "restored: working tree clean for mutated files" | tee -a "$LOG"
