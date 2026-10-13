import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateStagingManifest, assertStagingEnvironment } from './staging-preflight.mjs';

// Separate test tool, never imported by the application. No production credential aliases.
export function requireR2TestConfiguration(manifest, env, mode) {
  const m = validateStagingManifest(manifest);
  assertStagingEnvironment(env);
  if (!['inspect', 'canary'].includes(mode) || !env.XB01_R2_METADATA_READ_TOKEN) throw new Error('Explicit R2 test metadata access required');
  if (mode === 'canary' && (env.XB01_STAGING_TEST_APPROVAL_SHA !== m.sourceSha || !env.XB01_R2_TEST_ACCESS_KEY || !env.XB01_R2_TEST_SECRET_KEY)) throw new Error('Exact owner-approved test SHA and test-only bucket credentials required');
  return m;
}
async function readJson(fetcher, url, token) {
  const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('R2 metadata unavailable');
  const text = await response.text();
  if (text.length > 65536) throw new Error('Unexpected R2 metadata size');
  const payload = JSON.parse(text);
  if (payload.success !== true || (payload.errors?.length ?? 0) !== 0) throw new Error('R2 metadata verification failed');
  return payload.result;
}
export async function inspectPrivateBucket(m, token, fetcher = fetch) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${m.r2.accountId}/r2/buckets/${m.r2.bucket}`;
  const bucket = await readJson(fetcher, base, token);
  if (bucket?.name !== m.r2.bucket) throw new Error('R2 bucket identity mismatch');
  const managed = await readJson(fetcher, `${base}/domains/managed`, token);
  const custom = await readJson(fetcher, `${base}/domains/custom`, token);
  if (managed?.enabled !== false || !/^pub-[a-f0-9]{32}\.r2\.dev$/.test(managed.domain ?? '') || !Array.isArray(custom?.domains) || custom.domains.length !== 0) throw new Error('R2 public access or unknown domain configuration');
  // Metadata proof does not certify Workers bindings, other credentials, signed links or app ACLs.
  return { bucket: m.r2.bucket, managedDomain: managed.domain, publicAccess: false, customDomains: 0 };
}
async function assertAnonymousDenial(url, fetcher) {
  const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
  // A timeout or 5xx is not evidence of a policy denial. Never consume/print a private body.
  await response.body?.cancel();
  if (![401, 403, 404].includes(response.status)) throw new Error('Anonymous object denial not proven');
}
export async function exercisePrivateCanary(m, metadata, adapter, fetcher = fetch) {
  const key = `xb01-canary/${randomUUID()}/synthetic.txt`;
  const body = Buffer.from(`XB01_SYNTHETIC_NO_CUSTOMER_DATA_${randomUUID()}`);
  let created = false;
  try {
    // Adapter requires conditional creation; never overwrite an existing object.
    await adapter.put(key, body); created = true;
    const read = await adapter.get(key);
    if (!Buffer.from(read).equals(body)) throw new Error('Canary integrity mismatch');
    await assertAnonymousDenial(`https://${m.r2.accountId}.r2.cloudflarestorage.com/${m.r2.bucket}/${key}`, fetcher);
    await assertAnonymousDenial(`https://${metadata.managedDomain}/${key}`, fetcher);
    return { status: 'PASS_BUCKET_CANARY_NOT_APPLICATION_AUTHORIZATION', sourceSha: m.sourceSha, bucket: m.r2.bucket, bytes: body.length, digest: createHash('sha256').update(body).digest('hex'), authenticatedRead: 'PASS', unsignedS3: 'DENIED', disabledPublicDomain: 'DENIED', applicationOwnerDownload: 'BLOCKED_PRIVATE_DELIVERY_ADAPTER_REQUIRED', crossTenantApplicationRead: 'BLOCKED_PRIVATE_DELIVERY_ADAPTER_REQUIRED' };
  } finally {
    // Delete this exact newly-created synthetic object only; never list/delete other keys.
    if (created) { await adapter.remove(key); if (await adapter.exists(key)) throw new Error('Synthetic canary cleanup failed'); }
  }
}
function s3Adapter(m, env) {
  const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = requireBackend('@aws-sdk/client-s3');
  const client = new S3Client({ region: 'auto', endpoint: `https://${m.r2.accountId}.r2.cloudflarestorage.com`, maxAttempts: 2, credentials: { accessKeyId: env.XB01_R2_TEST_ACCESS_KEY, secretAccessKey: env.XB01_R2_TEST_SECRET_KEY } });
  return {
    async put(Key, Body) { await client.send(new PutObjectCommand({ Bucket: m.r2.bucket, Key, Body, ContentType: 'text/plain', IfNoneMatch: '*' })); },
    async get(Key) { const r = await client.send(new GetObjectCommand({ Bucket: m.r2.bucket, Key })); if (!r.Body) throw new Error('Missing test object'); return r.Body.transformToByteArray(); },
    async remove(Key) { await client.send(new DeleteObjectCommand({ Bucket: m.r2.bucket, Key })); },
    async exists(Key) { try { await client.send(new HeadObjectCommand({ Bucket: m.r2.bucket, Key })); return true; } catch (e) { if (e?.$metadata?.httpStatusCode === 404) return false; throw new Error('Cannot verify canary cleanup'); } },
    close() { client.destroy(); },
  };
}
export async function runR2Check(manifest, env, mode, fetcher = fetch) {
  const m = requireR2TestConfiguration(manifest, env, mode);
  const metadata = await inspectPrivateBucket(m, env.XB01_R2_METADATA_READ_TOKEN, fetcher);
  if (mode === 'inspect') return { status: 'READ_ONLY_PRIVATE_BUCKET_METADATA_NOT_FULL_ACCEPTANCE', sourceSha: m.sourceSha, ...metadata };
  const adapter = s3Adapter(m, env);
  try { return await exercisePrivateCanary(m, metadata, adapter, fetcher); } finally { adapter.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Explicit manifest and inspect/canary mode required');
    const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding:'utf8', windowsHide:true }).trim();
    if (manifest.sourceSha !== actualSha || execFileSync('git',['status','--porcelain'],{cwd:fileURLToPath(new URL('../..',import.meta.url)),encoding:'utf8',windowsHide:true}).trim()) throw new Error('Exact clean reviewed checkout required');
    const result = await runR2Check(manifest, process.env, process.argv[3]);
    console.log(JSON.stringify(result));
  } catch { console.error('BLOCKED/FAIL: private R2 verification did not pass. No secret or provider error payload is displayed. Inspect configuration and exact-object cleanup in the approved staging environment.'); process.exitCode = 1; }
}
