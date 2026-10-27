#!/usr/bin/env bash
# Proves the tests can fail: injects deliberate defects one at a time, expects at least one failing test each, restores the file.
# Phase 1 groups first; Phase 2 adds the database-TLS group. MUTATION_LOG overrides the log path (Phase 2 writes under phase-2/).
set -u
cd "$(dirname "$0")/../../../../backend"
OUT="../docs/infra/batch-1.5/evidence/logs"; mkdir -p "$OUT"; LOG="${MUTATION_LOG:-$OUT/07-mutation-checks.log}"; mkdir -p "$(dirname "$LOG")"; : > "$LOG"
M=../supabase/migrations/20261022000000_storage_drive_foundation.sql
# A defect is CAUGHT when a test fails OR is cancelled: a mutant that makes a test wait forever (for example, removing a bound so an
# expected rejection never arrives) shows up as "# cancelled", not "# fail", under node:test.
caught() { local f c; f=$(echo "$1" | sed -nE 's/.*# fail ([0-9]+).*/\1/p'); c=$(echo "$1" | sed -nE 's/.*# cancelled ([0-9]+).*/\1/p'); if [ "${f:-0}" -gt 0 ] || [ "${c:-0}" -gt 0 ]; then echo CAUGHT; else echo SURVIVED; fi; }
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
  res=$(npx tsx --test --test-reporter=tap "$@" 2>&1 | grep -E '^# (pass|fail|cancelled)' | tr '\n' ' ')
  cp /tmp/mut.bak "$file"
  fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/')
  if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$(caught "$res"); fi
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
res=$(npx tsx --test --test-reporter=tap src/storage/storageService.test.ts 2>&1 | grep -E '^# (pass|fail|cancelled)' | tr '\n' ' '); cp /tmp/mut.bak $S
fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/'); if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$(caught "$res"); fi
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
W=src/workers; TO=--test-timeout=20000
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
res=$(npx tsx --test --test-reporter=tap $TO $HT 2>&1 | grep -E '^# (pass|fail|cancelled)' | tr '\n' ' '); cp /tmp/mut.bak $H
fails=$(echo "$res" | sed -E 's/.*# fail ([0-9]+).*/\1/'); if [ -z "$res" ]; then verdict=INCONCLUSIVE; else verdict=$(caught "$res"); fi
echo "$verdict | handler: BOTH post-result lease checks removed | $res" | tee -a "$LOG"
fi
if want workers && [ -n "${STORAGE_TEST_DATABASE_URL:-}" ]; then
LM=../supabase/migrations/20261024000000_worker_task_leases.sql; LP=src/workers/postgresLeaseStore.integration.test.ts; TO=--test-timeout=20000
mut "lease SQL: fencing token not incremented" $LM "token     = l.token + 1," "token     = l.token," $TO $LP
mut "lease SQL: a live lease can be taken over" $LM "where (not l.held) or l.expires_at <= v_now" "where true" $TO $LP
mut "lease SQL: release ignores the token" $LM "and worker_id = p_worker and token = p_token and held;" "and held;" $TO $LP
mut "lease SQL: renew ignores the token" $LM "and worker_id = p_worker and token = p_token and held and expires_at > v_now;" "and held and expires_at > v_now;" $TO $LP
mut "lease SQL: check ignores the token" $LM "or r.worker_id <> p_worker or r.token <> p_token then return 'lost'" "or r.worker_id <> p_worker then return 'lost'" $TO $LP
mut "lease SQL: anon can read the table" $LM "revoke all on public.worker_task_leases from public, anon, authenticated;" "grant select on public.worker_task_leases to anon;" $TO $LP
mut "lease SQL: RLS not forced" $LM "alter table public.worker_task_leases force row level security;" "" $TO $LP
mut "lease SQL: ttl unbounded" $LM "if p_ttl_ms is null or p_ttl_ms < 1 or p_ttl_ms > 900000 then
    raise exception 'lease ttl out of range' using errcode = '22023';
  end if;
  insert into" "insert into" $TO $LP
fi
if want workers2; then
W=src/workers; R=src/runtime; TO=--test-timeout=20000
AD=$W/admission.ts; AT=$W/admission.test.ts
mut "admission: per-tenant cap not enforced" $AD "&& (this.#running.get(tenantId) ?? 0) < this.#opts.maxPerTenant;" ";" $TO $AT
mut "admission: waiting jobs served oldest-first instead of fairly" $AD "if (running < bestRunning || (running === bestRunning && best && head.seq < best.seq))" "if (!best || head.seq < best.seq)" $TO $AT
mut "admission: queue not bounded" $AD "if (queue.length >= this.#opts.maxQueuedPerTenant || this.#queuedTotal >= this.#opts.maxQueuedTotal) {" "if (false) {" $TO $AT
mut "admission: a cancelled waiter stays queued" $AD "if (i >= 0) {" "if (false) {" $TO $AT
mut "admission: release not idempotent" $AD "if (released) return;" "" $TO $AT
# (a "newcomer jumps the queue" mutant is not listed: the guard it targeted was dead code, removed; see admission.ts)
RR=$W/resumeRecovery.ts; RT=$W/resumeRecovery.test.ts
mut "recovery: a live worker's task is resumed anyway" $RR "if (holder) held.push(task.id);" "" $TO $RT
mut "recovery: held tasks are not restored after canonical recovery" $RR "result.state.tasks = result.state.tasks.map((t) => originals.get(t.id) ?? t);" "" $TO $RT
SP=$R/startupPolicy.ts; ST=$R/startupPolicy.test.ts
mut "startup: staging, preview and unclassified run the mutating duties" $SP "return { ensureSchemas: false, reconcileOrphanedRuns: false };" "return { ensureSchemas: true, reconcileOrphanedRuns: true };" $TO $ST
mut "startup: a staging claim on the production app is accepted" $SP "if (fly === PRODUCTION_FLY_APP && claimed !== 'production')" "if (false)" $TO $ST
mut "startup: a production claim on another app is accepted" $SP "if (fly && fly !== PRODUCTION_FLY_APP && claimed === 'production')" "if (false)" $TO $ST
mut "startup: any Fly app is inferred to be production" $SP "if (fly === PRODUCTION_FLY_APP) return { environment: 'production', source: 'inferred' };" "if (fly) return { environment: 'production', source: 'inferred' };" $TO $ST
RD=$R/readiness.ts; RDT=$R/readiness.test.ts
mut "readiness: an unclassified environment is ready" $RD "run: async () => (resolveDeploymentEnvironment(env).environment === 'unclassified' ? 'environment_unclassified' : null)," "run: async () => null," $TO $RDT
mut "readiness: a TLS verification failure is ignored" $RD "if (!probe.ok) return 'storage_database_tls_failed';" "" $TO $RDT
mut "readiness: development key material accepted where managed custody is required" $RD "if (env.XROGA_DEV_CREDENTIAL_KEK || env.XROGA_TEST_CREDENTIAL_KEK) return 'custody_dev_key_present';" "" $TO $RDT
mut "readiness: probe text echoed to the public result" $RD "reason: CODE.test(outcome) ? outcome : 'check_failed'," "reason: outcome," $TO $RDT
BG=$R/bootGuard.test.ts
mut "boot: safe logging import removed from index.ts" src/index.ts "import './runtime/installSafeLogging.js';" "" $TO $BG
mut "boot: schema ensure runs unconditionally" src/index.ts "if (startup.duties.ensureSchemas) {" "if (true) {" $TO $BG
SL=$R/safeLogging.ts; SLT=$R/safeLogging.test.ts
mut "logging: exact secret values not removed" $SL "if (out.includes(secret)) out = out.split(secret).join(REPLACEMENT);" "" $TO $SLT
mut "logging: credential shapes not removed" $SL "for (const [re, to] of SHAPES) out = out.replace(re, to);" "" $TO $SLT
mut "logging: fails open when redaction throws" $SL "line = '[log line withheld: redaction failed]'" "line = format(...args)" $TO $SLT
mut "logging: URL-encoded secret not covered" $SL "if (enc !== value) out.add(enc);" "" $TO $SLT
CL=$W/chromiumLaunch.ts; CLT=$W/chromiumLaunch.test.ts
mut "launch: sandbox may be off" $CL "if (o.chromiumSandbox !== true) {" "if (false) {" $TO $CLT
mut "launch: forbidden flags accepted" $CL "if (name && FORBIDDEN_FLAGS.includes(name)) {" "if (false) {" $TO $CLT
mut "launch: loopback proxy bypass accepted" $CL "if (proxy.bypass !== '<-loopback>')" "if (false)" $TO $CLT
mut "launch: secret environment variables accepted" $CL "if (ENV_SECRET.test(k)) {" "if (false) {" $TO $CLT
mut "launch: profile may be outside the per-job root" $CL "!within(profileRoot, o.userDataDir)" "false" $TO $CLT
CS=$W/containerSpec.ts; CST=$W/containerSpec.test.ts
mut "container: privileged accepted" $CS "if (spec.privileged !== false)" "if (false)" $TO $CST
mut "container: added capabilities accepted" $CS "if (!Array.isArray(spec.capAdd) || spec.capAdd.length)" "if (false)" $TO $CST
mut "container: writable root accepted" $CS "if (spec.readOnlyRootFilesystem !== true)" "if (false)" $TO $CST
mut "container: unconfined seccomp accepted" $CS "if (!spec.seccompProfile || /unconfined/i.test(spec.seccompProfile))" "if (false)" $TO $CST
mut "container: bind mounts and sockets accepted" $CS "if (m.type !== 'tmpfs')" "if (false)" $TO $CST
mut "container: egress deny list not required" $CS "if (missing.length)" "if (false)" $TO $CST
mut "dockerfile: root user accepted" $CS "if (!/^[1-9][0-9]*(:[1-9][0-9]*)?\$/.test(last))" "if (false)" $TO $CST
mut "dockerfile: unpinned base accepted" $CS "if (!from.length || from.some((l) => !/@sha256:[0-9a-f]{64}/.test(l)))" "if (false)" $TO $CST
mut "handler: worker summary stored without redaction" $W/browserTaskHandler.ts "summary: redactText(String(result.summary)).slice(0, 2_000)," "summary: String(result.summary).slice(0, 2_000)," $TO $W/browserTaskHandler.test.ts
mut "handler: admission not applied" $W/browserTaskHandler.ts "const release = await deps.admission.acquire(deps.actor.tenantId, signal);" "const release = () => undefined;" $TO $W/browserTaskHandler.test.ts
mut "proxy: 407 without a Proxy-Authenticate challenge" $W/egressProxy.ts "return deny(clientSocket, '407 Proxy Authentication Required', PROXY_CHALLENGE);" "return deny(clientSocket, '407 Proxy Authentication Required');" $TO $W/egressProxy.test.ts
fi
if want workers3; then
W=src/workers; R=src/runtime; TO=--test-timeout=20000
CS=$W/containerSpec.ts; CST=$W/containerSpec.test.ts
mut "container: bridge network accepted" $CS "} else if (mode !== 'none' && mode !== 'host' && !/^container:/.test(mode ?? '')) {" "} else if (false) {" $TO $CST
mut "container: internal network without a named proxy accepted" $CS "if (!/^[a-z0-9][a-z0-9-]{0,39}\$/.test(spec.network.proxyHost ?? ''))" "if (false)" $TO $CST
mut "launch: an undeclared internal proxy host accepted" $W/chromiumLaunch.ts "if (!isLoopbackHost(host) && !allowedProxyHosts.includes(host)) {" "if (false) {" $TO $W/chromiumLaunch.test.ts
RD=$R/readiness.ts; RDT=$R/readiness.test.ts
mut "custody: google configuration shape not checked" $RD "if (provider === 'google_cloud') return env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME && !oci.some(Boolean) ? null : 'custody_config_invalid';" "if (provider === 'google_cloud') return null;" $TO $RDT
mut "custody: oci beside a google key accepted" $RD "return !env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME && oci.every(Boolean)" "return oci.every(Boolean)" $TO $RDT
mut "custody: Batch 1 round trip ignored" $RD "if (deps.custodyRoundTrip && !(await deps.custodyRoundTrip())) return 'credential_provider_unavailable';" "" $TO $RDT
MT=$R/migrationCheck.test.ts
mut "migration check: forbidden statements not refused" ../scripts/check-supabase-migrations.mjs "for (const [re, label] of FORBIDDEN) if (re.test(body)) errors.push" "for (const [re, label] of FORBIDDEN) if (false) errors.push" $TO $MT
mut "migration check: duplicate prefix not detected" ../scripts/check-supabase-migrations.mjs "if (prefixes.has(key)) errors.push(" "if (false) errors.push(" $TO $MT
mut "workflow: pull-request job gets the Preview environment back" ../.github/workflows/supabase-migrate.yml "    timeout-minutes: 5
    permissions:" "    timeout-minutes: 5
    environment: Preview
    permissions:" $TO $MT
mut "workflow: pull-request job runs the live runner again" ../.github/workflows/supabase-migrate.yml 'run: node scripts/check-supabase-migrations.mjs --base "origin/${{ github.base_ref }}"' 'run: node scripts/apply-supabase-migrations.mjs --dry-run' $TO $MT
fi
if want workers4; then
W=src/workers; TO=--test-timeout=20000
EP=$W/egressProxy.ts; ET=$W/egressProxy.test.ts
mut "proxy: weak sidecar credentials accepted" $EP "options.credentials.password.length < 24)) throw" "false)) throw" $TO $ET
mut "proxy: a throwing decision listener changes behaviour" $EP "try { options.onDecision?.(decision); } catch { /* a logging failure never changes a verdict */ }" "options.onDecision?.(decision);" $TO $ET
SC=$W/proxySidecar.ts; SCT=$W/proxySidecar.test.ts
mut "sidecar: weak credentials accepted" $SC "|| password.length < 24) throw" "|| false) throw" $TO $SCT
mut "sidecar: any port accepted" $SC "|| port < 1 || port > 65535) throw" "|| false) throw" $TO $SCT
mut "sidecar: job not validated by the production parser" $SC "job = parseBrowserJob(JSON.parse(env.XROGA_PROXY_JOB ?? ''));" "job = JSON.parse(env.XROGA_PROXY_JOB ?? '') as BrowserJob;" $TO $SCT
mut "sidecar: error echoes its input" $SC "throw new SidecarConfigError('XROGA_PROXY_JOB is missing or is not a valid browser job');" "throw new SidecarConfigError('bad job: ' + (env.XROGA_PROXY_JOB ?? '').slice(0, 200));" $TO $SCT
fi
git -C .. diff --quiet -- backend supabase && echo "restored: working tree clean for mutated files" | tee -a "$LOG"
if grep -qE '^(SURVIVED|INCONCLUSIVE)' "$LOG"; then echo "FAILED: a defect was not caught, or a run was inconclusive" | tee -a "$LOG"; exit 1; fi
