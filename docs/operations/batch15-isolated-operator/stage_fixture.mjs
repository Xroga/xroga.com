// Runs only after the reviewed protected staging bootstrap. No model imports,
// requests or fallback. Public code is embedded in the one approved private Job.
const { default: assert } = await import('node:assert/strict');
const { randomUUID, randomBytes, createHash } = await import('node:crypto');
const { createClient } = await import('@supabase/supabase-js');
const base = process.env.XROGA_B15_API_URL;
assert.match(base ?? '', /^https:\/\/xroga-b15-activation-stage-20261031-[a-z0-9.-]+\.run\.app$/);
assert.equal(process.env.SUPABASE_URL, 'https://dqxnatoessviphudbhei.supabase.co');
assert.equal(process.env.XROGA_DRIVE_R2_BUCKET, 'xroga-drive-test');
const session = process.env.XROGA_B15_SESSION;
assert.match(session ?? '', /^[a-f0-9-]{36}$/);
const prefix = `b15-activation-20261031/${session}/`;
const { R2ObjectStore, r2ConfigFromEnv } = await import('./dist/storage/r2ObjectStore.js');
const r2 = new R2ObjectStore(r2ConfigFromEnv());
const bucket = 'xroga-drive-test';
const meta = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' + encodeURIComponent(base) + '&format=full';
const idResponse = await fetch(meta, { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
assert.equal(idResponse.status, 200);
const identityToken = await idResponse.text();
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const observed = [];
const users = [];
const objects = [];
const projects = [];
const runs = [];
const children = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = (name, facts = {}) => { observed.push({ name, pass: true, ...facts }); };
const manifestKey = prefix + 'owned-fixtures.json';
async function checkpointFixtures() {
  const bytes = Buffer.from(JSON.stringify({ session, userIds: users.map(u => u.id), projectIds: projects,
    projectOwners: Object.fromEntries(projects.map(id => [id, users[0].id])),
    runIds: runs.map(r => r.id), objectIds: objects.map(o => o.id) }));
  await r2.put(bucket, manifestKey, bytes, 'application/json', sha(bytes));
}
async function request(path, user, method = 'GET', body) {
  const response = await fetch(base + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { 'X-Serverless-Authorization': 'Bearer ' + identityToken,
      ...(user ? { authorization: 'Bearer ' + user.token } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : null; } catch { value = null; }
  return { status: response.status, body: value };
}
async function createUser(index) {
  const password = randomBytes(30).toString('hex');
  const email = `b15-${session}-${index}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    app_metadata: { xroga_b15_verification_session: session } });
  assert.equal(created.error, null, 'synthetic auth fixture creation');
  const user = { id: created.data.user.id, token: null };
  users.push(user);
  await checkpointFixtures();
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, 'fixture password authentication');
  user.token = login.data.session.access_token;
  assert.equal(login.data.user.id, user.id);
  return user;
}
async function upload(user, project, bytes, expectedMode) {
  const result = await request('/api/drive/uploads', user, 'POST', { projectId: project,
    filename: 'b15-' + session + '-' + expectedMode + '.txt', contentType: 'text/plain', size: bytes.length, sha256: sha(bytes) });
  assert.equal(result.status, 201, 'upload admission');
  assert.equal(result.body.mode, expectedMode);
  const id = result.body.objectId;
  objects.push({ user, id });
  await checkpointFixtures();
  let complete = {};
  if (expectedMode === 'single') {
    const put = await fetch(result.body.upload.url, { method: 'PUT', headers: result.body.upload.headers,
      body: bytes, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(put.status, 200, 'R2 single PUT');
    await put.body?.cancel();
  } else {
    const count = Math.ceil(bytes.length / result.body.partSize);
    assert.equal(count, 2);
    const signed = await request(`/api/drive/uploads/${id}/parts`, user, 'POST', { partNumbers: [1, 2] });
    assert.equal(signed.status, 200);
    complete.parts = [];
    for (let n = 1; n <= count; n++) {
      const part = signed.body.parts.find(p => p.partNumber === n);
      assert.ok(part, 'signed multipart part');
      const put = await fetch(part.url, { method: 'PUT', headers: part.headers,
        body: bytes.subarray((n - 1) * result.body.partSize, n * result.body.partSize), redirect: 'manual', signal: AbortSignal.timeout(30000) });
      assert.equal(put.status, 200, 'R2 multipart PUT');
      assert.ok(put.headers.get('etag'));
      complete.parts.push({ partNumber: n, etag: put.headers.get('etag') });
      await put.body?.cancel();
    }
  }
  const done = await request(`/api/drive/uploads/${id}/complete`, user, 'POST', complete);
  assert.equal(done.status, 200, 'verified upload completion');
  assert.equal(done.body.state, 'READY');
  assert.equal(done.body.sha256, sha(bytes));
  const download = await request(`/api/drive/objects/${id}/download-url`, user, 'POST', {});
  assert.equal(download.status, 200);
  const got = await fetch(download.body.url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.equal(got.status, 200);
  assert.equal(sha(Buffer.from(await got.arrayBuffer())), sha(bytes));
  const denied = await fetch(download.body.url.split('?')[0], { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.ok([400, 401, 403].includes(denied.status), 'private R2 refuses unsigned access');
  await denied.body?.cancel();
  record('drive-' + expectedMode + '-verified-readback-private', { bytes: bytes.length });
  return id;
}
async function browserStatus(user, run, seconds = 180) {
  const limit = Date.now() + seconds * 1000;
  while (Date.now() < limit) {
    const result = await request('/api/browser/runs/' + run, user);
    assert.equal(result.status, 200);
    if (['completed', 'cancelled', 'failed', 'blocked'].includes(result.body.status)) return result.body;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw Error('BROWSER_COMPLETION_DEADLINE');
}
async function waitRunning(user, run) {
  const limit = Date.now() + 60000;
  while (Date.now() < limit) {
    const result = await request('/api/browser/runs/' + run, user);
    assert.equal(result.status, 200);
    if (result.body.status === 'running') return;
    assert.ok(!['failed', 'completed', 'cancelled', 'blocked'].includes(result.body.status));
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('BROWSER_DID_NOT_ENTER_RUNNING');
}
const plan = {
  steps: [{ op: 'extractText', selector: 'h1', name: 'heading' }, { op: 'screenshot', name: 'b15.png' }],
  expect: [{ kind: 'extracted', name: 'heading', equals: 'Example Domain' }, { kind: 'artifact', name: 'b15.png' }, { kind: 'noConsequentialAction' }],
};
function browserInput(project, selectedPlan = plan) {
  return { projectId: project, goal: 'Deterministic isolated verification, read Example Domain',
    startUrl: 'https://example.com/', allowedOrigins: ['https://example.com'], plan: selectedPlan, allowAiSteps: false,
    limits: { maxDurationMs: 120000, maxNavigations: 5, maxRedirects: 3, maxPages: 1,
      maxResponseBytes: 5000000, maxArtifactBytes: 1000000, maxModelCostMicros: 0 } };
}
let failure = null;
const cleanupErrors = [];
let phase = 'initialization';
async function cleanFixtures() {
  // Discover only users tagged by this server-side synthetic session. This also
  // recovers a crash between Auth creation and the following R2 checkpoint.
  const tagged = [];
  for (let page = 1; page <= 5; page++) {
    const response = await admin.auth.admin.listUsers({ page, perPage: 200 });
    assert.equal(response.error, null);
    for (const user of response.data.users) if (user.app_metadata?.xroga_b15_verification_session === session) tagged.push(user.id);
    if (response.data.users.length < 200) break;
    if (page === 5) throw Error('FIXTURE_CLEANUP_USER_SCAN_BOUND');
  }
  assert.ok(tagged.length <= 2);
  const { getStorageService, actorFromPersistedOwner, createPool } = await import('./dist/storage/runtime.js');
  const drive = getStorageService();
  assert.ok(drive);
  const pool = createPool();
  try {
    const manifestInfo = await r2.head(bucket, manifestKey);
    if (manifestInfo) {
      assert.ok(manifestInfo.size < 65536);
      const chunks = [];
      for await (const chunk of await r2.openRead(bucket, manifestKey)) chunks.push(chunk);
      const manifest = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(manifest.session, session);
      for (const [projectId, ownerId] of Object.entries(manifest.projectOwners ?? {})) {
        assert.match(projectId, /^[a-f0-9-]{36}$/);
        assert.ok(tagged.includes(ownerId));
        const restored = await pool.query('update public.projects set user_id=$1 where id=$2 and name=$3 and user_id=any($4::uuid[]) returning id',
          [ownerId, projectId, 'B15 verification ' + session, tagged]);
        assert.equal(restored.rowCount, 1);
      }
    }
    for (const userId of tagged) {
      const actor = actorFromPersistedOwner(userId);
      // Terminated browser workers can't race these deletes. The controller
      // stops dispatch first for recovery cleanup; normal tests cancel/poll.
      const rows = (await pool.query('select id,bucket from public.storage_objects where tenant_id=$1 and owner_user_id=$1 limit 501', [userId])).rows;
      assert.ok(rows.length <= 500);
      assert.ok(rows.every(row => row.bucket === bucket));
      for (const row of rows) await drive.deleteObject(actor, row.id);
      const leftovers = await r2.list(bucket, `v1/tenants/${userId}/`);
      assert.equal(leftovers.keys.length, 0, 'no synthetic tenant objects remain');
      await pool.query('delete from public.worker_task_leases where tenant_id=$1', [userId]);
      await pool.query('delete from public.browser_runs where tenant_id=$1 and user_id=$1', [userId]);
      // Metadata removal is only for newly created synthetic fixtures, after
      // the canonical service has removed their objects and reservations.
      await pool.query('delete from public.storage_objects where tenant_id=$1 and owner_user_id=$1 and bucket=$2', [userId, bucket]);
      await pool.query('delete from public.storage_usage where tenant_id=$1', [userId]);
      const deletedProjects = await admin.from('projects').delete().eq('user_id', userId);
      assert.equal(deletedProjects.error, null);
      const known = users.find(u => u.id === userId);
      if (known?.token) {
        const revoked = await admin.auth.admin.signOut(known.token, 'global');
        assert.equal(revoked.error, null);
      }
      const deleted = await admin.auth.admin.deleteUser(userId);
      assert.equal(deleted.error, null);
    }
    await r2.delete(bucket, manifestKey);
    assert.equal((await r2.list(bucket, prefix)).keys.length, 0);
  } finally { await pool.end(); }
}
try {
  if (process.env.XROGA_B15_FIXTURE_MODE === 'cleanup') {
    await cleanFixtures();
    console.log(JSON.stringify({ marker: 'XROGA_B15_FIXTURE_CLEANUP_V1', session, verdict: 'PASS', productionTouched: false }));
    process.exit(0);
  }
  phase = 'private-api-readiness';
  const preexisting = await admin.from('browser_runs').select('run_id', { count: 'exact', head: true }).in('status', ['queued', 'running']);
  assert.equal(preexisting.error, null);
  assert.equal(preexisting.count, 0, 'no unrelated active staging browser work');
  const ready = await request('/ready');
  assert.equal(ready.status, 200, 'private API managed custody and readiness');
  for (const name of ['environment', 'database', 'storage']) assert.equal(ready.body.checks.find(c => c.name === name)?.status, 'ok');
  record('private-api-native-identity-and-readiness');
  assert.equal((await request('/api/drive/objects')).status, 401);
  record('application-authentication-required');
  const alice = await createUser(1), bob = await createUser(2);
  const project = await admin.from('projects').insert({ user_id: alice.id, name: 'B15 verification ' + session, type: 'app' }).select('id').single();
  assert.equal(project.error, null);
  projects.push(project.data.id);
  await checkpointFixtures();
  phase = 'drive-single-upload';
  const small = await upload(alice, project.data.id, Buffer.from(prefix + 'private synthetic fixture\n'), 'single');
  phase = 'drive-multipart-upload';
  await upload(alice, project.data.id, Buffer.alloc(6 * 1024 * 1024, 'x'), 'multipart');
  phase = 'drive-tenant-and-quota-denial';
  assert.equal((await request('/api/drive/objects/' + small, bob)).status, 404);
  assert.equal((await request('/api/drive/objects/' + small, bob, 'DELETE')).status, 404);
  record('drive-other-tenant-read-and-delete-denied');
  const quota = await request('/api/drive/uploads', alice, 'POST', { projectId: project.data.id,
    filename: 'over-quota.txt', contentType: 'text/plain', size: 500000001 });
  assert.equal(quota.status, 413);
  record('drive-storage-quota-denied');
  phase = 'browser-admission-denial';
  const forged = await request('/api/browser/runs', alice, 'POST', browserInput(project.data.id, { ...plan, writeGrant: { grantId: randomUUID(), actions: ['submit'] } }));
  assert.equal(forged.status, 400);
  const cross = await request('/api/browser/runs', bob, 'POST', browserInput(project.data.id));
  assert.ok([403, 404].includes(cross.status));
  record('browser-forged-grant-and-cross-tenant-project-denied');
  const modelDenied = await request('/api/browser/runs', alice, 'POST', { ...browserInput(project.data.id), allowAiSteps: true,
    plan: { steps: [{ op: 'aiObserve', instruction: 'Read the public heading', name: 'heading' }], expect: [] } });
  assert.equal(modelDenied.status, 400);
  record('zero-model-budget-refuses-model-step-before-dispatch');
  const started = await request('/api/browser/runs', alice, 'POST', browserInput(project.data.id));
  assert.equal(started.status, 202, 'durable browser admission');
  runs.push({ user: alice, id: started.body.runId });
  await checkpointFixtures();
  phase = 'native-browser-delivery-and-execution';
  assert.equal((await request('/api/browser/runs/' + started.body.runId, bob)).status, 404);
  const finished = await browserStatus(alice, started.body.runId);
  assert.equal(finished.status, 'completed', 'real Cloud Tasks delivery and hardened browser completion');
  assert.equal(finished.output?.outcomeVerified, true);
  assert.ok(finished.evidence.length > 0, 'durable Drive evidence');
  assert.equal(finished.output.metrics?.modelUsage?.calls, 0);
  assert.equal(finished.output.metrics?.modelUsage?.costMicros, 0);
  record('native-cloud-tasks-browser-execution-and-durable-evidence', { runId: started.body.runId, attempts: finished.attempts, evidenceCount: finished.evidence.length });
  // Re-delivery through a separate authenticated request must observe completion.
  phase = 'duplicate-delivery';
  const duplicate = await fetch(base + '/internal/browser/execute', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { authorization: 'Bearer ' + identityToken, 'X-Serverless-Authorization': 'Bearer ' + identityToken, 'content-type': 'application/json' },
    body: JSON.stringify({ runId: started.body.runId }) });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).outcome, 'already_finished');
  record('independent-request-duplicate-execution-denied');
  const cancelling = await request('/api/browser/runs', alice, 'POST', browserInput(project.data.id, {
    steps: [{ op: 'pause', ms: 30000 }, ...plan.steps], expect: plan.expect }));
  assert.equal(cancelling.status, 202);
  runs.push({ user: alice, id: cancelling.body.runId });
  await checkpointFixtures();
  phase = 'durable-cancellation';
  await waitRunning(alice, cancelling.body.runId);
  await new Promise(resolve => setTimeout(resolve, 2000));
  assert.equal((await request('/api/browser/runs/' + cancelling.body.runId, bob, 'DELETE')).status, 404);
  assert.equal((await request('/api/browser/runs/' + cancelling.body.runId, alice, 'DELETE')).status, 202);
  const cancelled = await browserStatus(alice, cancelling.body.runId, 90);
  assert.equal(cancelled.status, 'cancelled');
  record('durable-cross-request-owner-cancellation');
  phase = 'project-revocation-during-execution';
  const revokedRun = await request('/api/browser/runs', alice, 'POST', browserInput(project.data.id, {
    steps: [{ op: 'pause', ms: 10000 }, ...plan.steps], expect: plan.expect }));
  assert.equal(revokedRun.status, 202);
  runs.push({ user: alice, id: revokedRun.body.runId });
  await checkpointFixtures();
  await waitRunning(alice, revokedRun.body.runId);
  const changed = await admin.from('projects').update({ user_id: bob.id }).eq('id', project.data.id).eq('user_id', alice.id).select('id');
  assert.equal(changed.error, null);
  assert.equal(changed.data.length, 1);
  try {
    const revoked = await browserStatus(alice, revokedRun.body.runId, 90);
    assert.notEqual(revoked.status, 'completed');
    assert.equal(revoked.output?.failure?.code, 'PERMISSION_REVOKED');
    record('project-revocation-denies-completion-and-evidence');
  } finally {
    const restored = await admin.from('projects').update({ user_id: alice.id }).eq('id', project.data.id).eq('user_id', bob.id).select('id');
    assert.equal(restored.error, null);
    assert.equal(restored.data.length, 1);
  }
  phase = 'real-process-crash-and-durable-recovery';
  const { productionBrowserRuntime } = await import('./dist/routes/browserRuns.js');
  const { prepareBrowserRun } = await import('./dist/workers/browserCapability.js');
  const { verifyAccessToken } = await import('./dist/middleware/auth.js');
  const { createTenantContext } = await import('./dist/security/tenantContext.js');
  const { spawn } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const runtime = productionBrowserRuntime();
  assert.ok(runtime);
  const verified = await verifyAccessToken(alice.token);
  assert.equal(verified.userId, alice.id);
  const saved = await prepareBrowserRun(createTenantContext(verified), browserInput(project.data.id, {
    steps: [{ op: 'pause', ms: 30000 }, ...plan.steps], expect: plan.expect }), runtime);
  runs.push({ user: alice, id: saved.runId });
  await checkpointFixtures();
  const original = await runtime.runs.load(alice.id, saved.runId);
  assert.ok(original);
  assert.equal(await runtime.runs.load(bob.id, saved.runId), null);
  const originalSpecHash = sha(Buffer.from(JSON.stringify(original.spec)));
  const childEnv = { ...process.env };
  const configuredKeys = Object.keys(JSON.parse(readFileSync('/secrets/xroga-platform/config.json', 'utf8')).environment);
  for (const name of configuredKeys) delete childEnv[name];
  // Each child independently loads the protected config and reconstructs the
  // canonical runtime. No parent object or in-memory store survives SIGKILL.
  const bootstrap = process.env.XROGA_B15_CHILD_BOOTSTRAP;
  assert.ok(bootstrap?.includes('STAGE_DATABASE_MISMATCH'));
  const code = bootstrap + `\nconst {productionBrowserRuntime}=await import('./dist/routes/browserRuns.js');
const {executeBrowserRun}=await import('./dist/workers/browserCapability.js');
const runtime=productionBrowserRuntime();if(!runtime)throw Error('NO_RUNTIME');
const outcome=await executeBrowserRun(process.argv[1],runtime);
console.log(JSON.stringify({marker:'B15_CHILD_OUTCOME',outcome}));process.exit(0);`;
  const startChild = () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, saved.runId], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let output = '';
    child.stdout.on('data', bytes => { if (output.length < 65536) output += bytes.toString(); });
    child.stderr.on('data', () => {});
    const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (exitCode, signal) => resolve({ exitCode, signal, output })); });
    return { child, completion };
  };
  const first = startChild();
  await waitRunning(alice, saved.runId);
  await new Promise(resolve => setTimeout(resolve, 2000));
  assert.equal(first.child.kill('SIGKILL'), true);
  const dead = await first.completion;
  assert.equal(dead.signal, 'SIGKILL');
  const checkpoint = await runtime.runs.load(alice.id, saved.runId);
  assert.equal(checkpoint.state.tasks[0].status, 'running');
  assert.equal(sha(Buffer.from(JSON.stringify(checkpoint.spec))), originalSpecHash);
  // Use actual database lease expiry, without advancing clocks or editing rows.
  await new Promise(resolve => setTimeout(resolve, 65000));
  const second = startChild();
  const limit = setTimeout(() => second.child.kill('SIGKILL'), 180000);
  let restored;
  try { restored = await second.completion; } finally { clearTimeout(limit); }
  assert.equal(restored.exitCode, 0);
  assert.ok(restored.output.split('\n').some(line => {
    try { const value = JSON.parse(line); return value.marker === 'B15_CHILD_OUTCOME' && value.outcome === 'finished'; } catch { return false; }
  }));
  const recovered = await runtime.runs.load(alice.id, saved.runId);
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.state.tasks[0].output?.outcomeVerified, true);
  assert.equal(sha(Buffer.from(JSON.stringify(recovered.spec))), originalSpecHash);
  assert.equal(await runtime.runs.load(bob.id, saved.runId), null);
  record('actual-process-sigkill-independent-recovery-owner-and-source-preserved', {
    runId: saved.runId, originalSpecHash, firstPid: first.child.pid, recoveredPid: second.child.pid,
    firstAttempts: checkpoint.state.tasks[0].attempts, recoveredAttempts: recovered.state.tasks[0].attempts,
    scope: 'REAL_EXECUTOR_PROCESS_LOSS_NOT_VM_TERMINATION' });
} catch (error) {
  failure = { phase, type: error?.name ?? 'Error', code: /^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'ASSERTION_OR_PROVIDER_CHECK_FAILED' };
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  // Best-effort every exact owned fixture, then verify. Never enumerate or delete
  // another tenant's objects, existing test projects, or production data.
  for (const run of runs) await request('/api/browser/runs/' + run.id, run.user, 'DELETE').catch(() => cleanupErrors.push('cancel-owned-run'));
  await new Promise(resolve => setTimeout(resolve, 3000));
  for (const user of users) {
    const listed = await request('/api/drive/objects?limit=500', user).catch(() => null);
    if (listed?.status === 200) {
      for (const row of listed.body.objects) {
        const removed = await request('/api/drive/objects/' + row.id, user, 'DELETE').catch(() => null);
        if (removed?.status !== 204) cleanupErrors.push('remove-owned-object');
      }
    } else cleanupErrors.push('list-owned-fixture-objects');
  }
  await cleanFixtures().catch(() => cleanupErrors.push('fixture-cleanup-incomplete-run-reviewed-cleanup-mode'));
}
console.log(JSON.stringify({ marker: 'XROGA_B15_STAGE_ACCEPTANCE_V1', session, source: process.env.XROGA_RELEASE_SHA,
  verdict: failure || cleanupErrors.length ? 'FAIL' : 'PASS_RECORDED_CHECKS_ONLY', observations: observed,
  failure, cleanupErrors, modelsCalled: 0, productionTouched: false,
  remaining: ['native-host-final-resource-cleanup', 'production-release-approval-and-acceptance'] }));
process.exit(failure || cleanupErrors.length ? 1 : 0);
