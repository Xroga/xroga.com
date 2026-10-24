#!/usr/bin/env bash
# Proves the tests can fail: injects deliberate defects one at a time, expects at least one failing test each, restores the file.
# Phase 1 groups first; Phase 2 adds the database-TLS group. MUTATION_LOG overrides the log path (Phase 2 writes under phase-2/).
set -u
cd "$(dirname "$0")/../../../../backend"
OUT="../docs/infra/batch-1.5/evidence/logs"; mkdir -p "$OUT"; LOG="${MUTATION_LOG:-$OUT/07-mutation-checks.log}"; mkdir -p "$(dirname "$LOG")"; : > "$LOG"
M=../supabase/migrations/20261022000000_storage_drive_foundation.sql
mut() { # name file python-replace-old python-replace-new testfiles...
  name="$1"; file="$2"; old="$3"; new="$4"; shift 4
  if [ -n "${MUTATION_ONLY:-}" ] && ! [[ "$name" =~ $MUTATION_ONLY ]]; then return; fi
  cp "$file" /tmp/mut.bak
  OLD="$old" NEW="$new" FILE="$file" python3 - <<'PY'
import os
p=os.environ['FILE']; s=open(p).read()
assert os.environ['OLD'] in s, 'mutation target not found'
open(p,'w').write(s.replace(os.environ['OLD'],os.environ['NEW'],1))
PY
  # the TAP reporter is forced: the default reporter differs between Node versions, and a missing summary must never read as "no failures"
  res=$(npx tsx --test --test-reporter=tap "$@" 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')
  cp /tmp/mut.bak "$file"
  fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/')
  if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$([ "${fails:-0}" -gt 0 ] && echo CAUGHT || echo SURVIVED); fi
  echo "$verdict | $name | $res" | tee -a "$LOG"
}
want() { [ -z "${MUTATION_GROUPS:-}" ] || [[ ",${MUTATION_GROUPS}," == *",$1,"* ]]; }
if want phase1; then
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
res=$(npx tsx --test --test-reporter=tap src/storage/storageService.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '); cp /tmp/mut.bak $S
fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/'); if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$([ "${fails:-0}" -gt 0 ] && echo CAUGHT || echo SURVIVED); fi
echo "$verdict | service: skip BOTH size verifications | $res" | tee -a "$LOG"
mut "memory repo: commit replay double counts" src/storage/repository.ts "if (r.state === 'COMMITTED') return 'ALREADY_COMMITTED';" "if (r.state === 'COMMITTED') { this.#u(r.tenantId).committedBytes += actual; return 'ALREADY_COMMITTED'; }" src/storage/storageService.test.ts
mut "migration: skip source-vs-destination hash comparison" src/storage/migration/engine.ts "if (object.sha256Verified !== sourceSha || object.sizeBytes !== opened.size) {" "if (false) {" src/storage/migration/engine.test.ts
mut "approvals: signature not verified" src/storage/migration/approvals.ts "if (!verify(null, payload, createPublicKey(publicKeyPem), Buffer.from(s, 'base64url'))) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "approvals: plan digest not compared" src/storage/migration/approvals.ts "if (claims.planDigest !== e.planDigest) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "approvals: environment not compared" src/storage/migration/approvals.ts "if (claims.environment !== e.environment) return" "if (false) return" src/storage/migration/approvals.test.ts
mut "config: invalid STORAGE_WRITE_MODE silently accepted" src/storage/runtime.ts "else problems.push(\`STORAGE_WRITE_MODE=" "else void (\`STORAGE_WRITE_MODE=" src/storage/config.matrix.test.ts
mut "provider errors: ECONNREFUSED not transient" src/storage/r2ObjectStore.ts "'ECONNREFUSED', 'ENOTFOUND'" "'ENOTFOUND'" src/storage/r2ObjectStore.test.ts
fi
# Phase 2 · database TLS (INFRA-005 prerequisite)
if want tls; then
T=src/storage/databaseTls.ts; TT=src/storage/databaseTls.test.ts
mut "db tls: certificate verification off for remote hosts" $T "const ssl: tls.ConnectionOptions = { rejectUnauthorized: true," "const ssl: tls.ConnectionOptions = { rejectUnauthorized: false," $TT
mut "db tls: loopback decided by searching the URL text (the Phase 1 bug)" $T "if (isLoopback(host)) return" 'if (/localhost|127\.0\.0\.1|sslmode=disable/.test(url)) return' $TT
mut "db tls: sslmode=no-verify / disable accepted" $T "  if (weakens) {" "  if (false as boolean) {" $TT
mut "db tls: raw URL handed to pg (lets sslmode override ssl)" $T "const base: PoolConfig = {" "const base: PoolConfig = { connectionString: url," $TT
mut "db tls: Supabase suffix without a dot boundary" $T '/(^|\.)supabase\.(co|com)$/' '/supabase\.(co|com)$/' $TT
mut "db tls: pinned-root fingerprint not checked" $T "new X509Certificate(blocks[0]).fingerprint256 !== expectedSha256" "false" $TT
mut "db tls: several certificates accepted as the pinned root" $T "blocks.length !== 1 ||" "false ||" $TT
fi
if want phase1 && [ -n "${STORAGE_TEST_DATABASE_URL:-}" ]; then
mut "SQL: drop READY-is-verified CHECK" $M "check (state <> 'READY' or (size_bytes is not null and sha256_verified is not null and verified_at is not null))" "check (true)" src/storage/postgresRepository.integration.test.ts
mut "SQL: remove tenant row lock in storage_reserve" $M "select * into u from public.storage_usage where tenant_id = p_tenant for update;" "select * into u from public.storage_usage where tenant_id = p_tenant;" src/storage/postgresRepository.integration.test.ts
mut "SQL: FORCE RLS removed from storage_objects" $M "alter table public.storage_objects          force row level security;" "-- removed" src/storage/schemaUpgrade.integration.test.ts
mut "SQL: search_path pin removed from storage_reserve" $M ") returns text language plpgsql set search_path = public, pg_temp as \$\$" ") returns text language plpgsql as \$\$" src/storage/schemaUpgrade.integration.test.ts
mut "SQL: authenticated can read object_key" $M "grant select (id, tenant_id," "grant select (object_key, id, tenant_id," src/storage/postgresRepository.integration.test.ts
fi
# Phase 2 · workers: leases, browser job contract, egress proxy, process trees, browser task handler (INFRA-005/006)
if want workers; then
W=src/workers; TO=--test-timeout=25000
LS=$W/leaseStore.ts; LT=$W/leaseStore.test.ts
mut "lease: fencing token not incremented" $LS "token: (current?.token ?? 0) + 1" "token: 1" $TO $LT
mut "lease: an expired lease is never retaken" $LS "if (current?.held && current.expiresAt > t) return null;" "if (current?.held) return null;" $TO $LT
mut "lease: any release frees the lease (stale release)" $LS "if (row && row.held && row.workerId === lease.workerId && row.token === lease.token) row.held = false;" "if (row) row.held = false;" $TO $LT
mut "lease: tenant not part of the key" $LS "JSON.stringify([k.tenantId, k.runId, k.taskId])" "JSON.stringify([k.runId, k.taskId])" $TO $LT
mut "lease: token not compared" $LS "|| row.token !== lease.token) throw new LeaseError('LEASE_LOST'" ") throw new LeaseError('LEASE_LOST'" $TO $LT
BJ=$W/browserJob.ts; BT=$W/browserJob.test.ts
mut "job: unknown fields accepted" $BJ "if (!JOB_KEYS.has(k)) throw" "if (false) throw" $TO $BT
mut "job: limits above the ceiling accepted" $BJ "if (v > BROWSER_JOB_CEILINGS[k]) throw" "if (false) throw" $TO $BT
mut "job: start URL may be outside the allowed origins" $BJ "if (!allowedOrigins.includes(startOrigin)) throw" "if (false) throw" $TO $BT
mut "job: navigation scope by host suffix instead of exact origin" $BJ "job.allowedOrigins.includes(publicHttpsUrl(rawUrl).origin)" "job.allowedOrigins.some((o) => publicHttpsUrl(rawUrl).hostname.endsWith(new URL(o).hostname))" $TO $BT
mut "job: idempotency key built by joining with a delimiter" $BJ "createHash('sha256').update(JSON.stringify([job.tenantId, job.runId, job.taskId]))" "createHash('sha256').update([job.tenantId, job.runId, job.taskId].join(':'))" $TO $BT
EP=$W/egressProxy.ts; ET=$W/egressProxy.test.ts
mut "proxy: no proxy credential required" $EP "if (!authorised(req.headers['proxy-authorization'], username, password)) {" "if (false) {" $TO $ET
mut "proxy: any host allowed" $EP "if (!allowedHosts.has(host.includes(':') ? \`[\${host}]\` : host)) {" "if (false) {" $TO $ET
mut "proxy: any port allowed" $EP "if (!m || Number(m[2]) !== 443) {" "if (!m) {" $TO $ET
mut "proxy: byte budget not enforced" $EP "if (relayed > options.job.limits.maxResponseBytes) { upstream.destroy(); clientSocket.destroy(); }" "" $TO $ET
mut "proxy: tunnel cap not enforced" $EP "if (++connections > maxConnections) {" "if (false) {" $TO $ET
mut "proxy: egress policy bypassed (connect to loopback)" $EP "admitPublicTarget(target, options.resolve, controller.signal).then(" "Promise.resolve(((_h: string, _o: unknown, cb: (e: null, a: string, f: number) => void) => cb(null, '127.0.0.1', 4)) as never).then(" $TO $ET
PT=$W/processTree.test.ts
mut "process tree: child inherits the worker environment" $W/processTree.ts "env: options.env, // never inherited" "env: { ...process.env, ...options.env }," $TO $PT
# (a mutant that disables killing leaves immortal children and hangs the runner, so tree cleanup is proven by the tests themselves: cancel, deadline, orphan sweep)
H=$W/browserTaskHandler.ts; HT=$W/browserTaskHandler.test.ts
mut "handler: no authorisation before dispatch" $H "    if (!(await deps.authorise(deps.actor, job.projectId))) throw new BrowserTaskError('PERMISSION_REVOKED'" "    if (false) throw new BrowserTaskError('PERMISSION_REVOKED'" $TO $HT
mut "handler: no authorisation before a durable write" $H "        if (!(await deps.authorise(deps.actor, job.projectId))) throw" "        if (false) throw" $TO $HT
mut "handler: scope may override the issued authority" $H "      ...scope,
      version: 1, tenantId: deps.actor.tenantId, userId: deps.actor.userId, projectId: state.projectId, runId: state.runId,
      taskId: task.id, attempt: Math.max(1, task.attempts)," "      version: 1, tenantId: deps.actor.tenantId, userId: deps.actor.userId, projectId: state.projectId, runId: state.runId,
      taskId: task.id, attempt: Math.max(1, task.attempts), ...scope," $TO $HT
mut "handler: lease not released" $H "await deps.leases.release(lease!).catch(() => undefined);" "" $TO $HT
mut "handler: heartbeat never renews" $H "deps.leases.renew(lease!, ttl).then(" "Promise.resolve(lease!).then(" $TO $HT
mut "handler: job deadline not enforced" $H "const deadline = setTimeout(() => stop('timeout'), job.limits.maxDurationMs);" "const deadline = setTimeout(() => {}, job.limits.maxDurationMs);" $TO $HT
mut "handler: scheduler cancellation not propagated" $H "const onScheduler = () => stop('cancel');" "const onScheduler = () => {};" $TO $HT
mut "handler: worker-reported pages not checked against scope" $H "if (!navigationAllowed(job, url)) throw" "if (false) throw" $TO $HT
mut "handler: credential-like artifacts accepted" $H "if (looksLikeCredential(a.name, Buffer.from(a.bytes))) throw" "if (false) throw" $TO $HT
mut "handler: artifact byte limit not enforced" $H "if (total > job.limits.maxArtifactBytes) throw" "if (false) throw" $TO $HT
mut "handler: earlier attempt's artifacts never reused" $H "id = await findStored(deps.drive, deps.actor, job.projectId, filename, digest);" "id = null;" $TO $HT
mut "handler: reuse ignores the content hash" $H "o.filename === filename && o.sha256 === sha256 && o.state === 'READY'" "o.filename === filename && o.state === 'READY'" $TO $HT
mut "handler: no lease check immediately before a write" $H "        // Re-check authority and lease at the consequential boundary, immediately before the write.
        await guard();" "" $TO $HT
# the result is protected by two lease checks (right after the worker returns, and again before it is accepted); only removing BOTH is a real defect
cp $H /tmp/mut.bak
python3 - <<'PY'
p='src/workers/browserTaskHandler.ts'; s=open(p).read()
a="      await guard();\n\n      // The worker is untrusted"; b="      await guard(); // the result is accepted only while the worker still holds the task"
assert a in s and b in s
open(p,'w').write(s.replace(a,"\n      // The worker is untrusted",1).replace(b,"",1))
PY
res=$(npx tsx --test --test-reporter=tap $TO $HT 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '); cp /tmp/mut.bak $H
fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/'); if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$([ "${fails:-0}" -gt 0 ] && echo CAUGHT || echo SURVIVED); fi
echo "$verdict | handler: BOTH post-result lease checks removed | $res" | tee -a "$LOG"
fi
git -C .. diff --quiet -- backend supabase && echo "restored: working tree clean for mutated files" | tee -a "$LOG"
if grep -qE '^(SURVIVED|INCONCLUSIVE)' "$LOG"; then echo "FAILED: a defect was not caught, or a run was inconclusive" | tee -a "$LOG"; exit 1; fi
