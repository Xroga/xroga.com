import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hostedWorkspaceManifest, requireHostedWorkspaceBuild, validateHostedWorkspaceStaging,
  verifyHostedWorkspaceBuildReceipt,
  stagingApiAudience, stagingApiIdentity, stagingApiService, stagingAuthOrigin, stagingWebOrigin, stagingOperatorOrigin,
} from './hosted-workspace-staging.mjs';
import { forwardHostedWorkspace } from '../../frontend/src/lib/hostedWorkspaceBridge.mjs';
import { resolveAuthBuildConfiguration } from '../../frontend/src/lib/supabase/authBuildRealm.mjs';

const source = 'a'.repeat(40);
const makeManifest = () => hostedWorkspaceManifest(source, 'sha256:' + 'b'.repeat(64));
const env = {
  CI: 'true', XROGA_STAGING_AUTH_BUILD: '1', XROGA_DEPLOYMENT_ENVIRONMENT: 'staging', XROGA_RELEASE_SHA: source,
  SUPABASE_URL: stagingAuthOrigin, NEXT_PUBLIC_SUPABASE_URL: stagingAuthOrigin,
  FRONTEND_URL: stagingWebOrigin, NEXT_PUBLIC_API_URL: stagingOperatorOrigin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test_only',
};
const planPath = '/api/phase1/plan';
function jwt({ issuer = makeManifest().auth.issuer, expiration = Math.floor(Date.now() / 1000) + 60 } = {}) {
  return 'Bearer header.' + Buffer.from(JSON.stringify({
    iss: issuer, exp: expiration, aud: 'authenticated', role: 'authenticated',
  })).toString('base64url') + '.signature';
}
function request({ token = jwt(), origin = stagingWebOrigin, body = '{}', method = 'POST' } = {}) {
  return new Request(stagingWebOrigin + planPath, {
    method, body: method === 'GET' ? undefined : body,
    headers: {
      ...(token ? { Authorization: token } : {}),
      Origin: origin, 'Content-Type': 'application/json', Cookie: 'forged=1',
      'X-Serverless-Authorization': 'client-forged', 'X-Forwarded-Host': 'xroga.com',
    },
  });
}

test('hosted auth build pins source, issuer, ledger, image digest and distinct private services', () => {
  const m = makeManifest();
  assert.equal(resolveAuthBuildConfiguration(env, m).url, stagingAuthOrigin);
  assert.equal(m.api.origin, stagingApiAudience);
  assert.equal(m.api.service, stagingApiService);
  assert.equal(m.api.identity, stagingApiIdentity);
  for (const change of [
    x => x.version = 2,
    x => x.api.service = 'xroga-api-universal-staging',
    x => x.api.identity = x.api.identity.replace(stagingApiService, 'xroga-universal-staging'),
    x => x.api.origin = 'https://xroga-api-universal-staging-422lt7eujq-uk.a.run.app',
    x => x.api.rollback = 'xroga-api-universal-staging-00001-tdc',
    x => x.api.origin = 'https://api.xroga.com',
    x => x.api.audience = 'https://xroga-api-universal-staging-422lt7eujq-uk.a.run.app',
    x => x.api.image = x.api.image.split('@')[0] + ':latest',
    x => x.api.defaultTrafficPercent = 0,
    x => x.api.requiresInvoker = false,
    x => x.api.sourceSha = 'c'.repeat(40),
    x => x.ledger.projectRef = 'nzenxdfumxrnsmybazmo',
    x => x.web.origin = 'https://xroga.com',
    x => x.web.identity = x.api.identity,
  ]) {
    const modified = makeManifest();
    change(modified);
    assert.throws(() => validateHostedWorkspaceStaging(modified));
  }
  for (const patch of [
    { VERCEL_ENV: 'preview' }, { XROGA_DEPLOYMENT_ENVIRONMENT: 'production' },
    { NEXT_PUBLIC_API_URL: m.api.origin }, { NEXT_PUBLIC_SUPABASE_URL: 'https://nzenxdfumxrnsmybazmo.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_test_only' }, { XROGA_RELEASE_SHA: 'c'.repeat(40) },
  ]) assert.throws(() => requireHostedWorkspaceBuild({ ...env, ...patch }, m));
});

test('hosted image provenance uses a successful build and its embedded manifest, without a bucket upload', () => {
  const manifest = makeManifest();
  const storageSource = { bucket: 'source-archive', object: 'source/archive.tar.gz', generation: '123' };
  const approval = { buildId: 'reviewed-build', sourceSha: source, source: storageSource };
  const apiName = manifest.api.image.split('@')[0];
  const webName = apiName.replace('/xroga-api-migration', '/xroga-workspace-openui-staging');
  const build = {
    id: approval.buildId, status: 'SUCCESS', substitutions: { _SOURCE_SHA: source },
    sourceProvenance: { resolvedStorageSource: storageSource },
    results: { images: [
      { name: `${apiName}:${source}`, digest: 'sha256:' + 'b'.repeat(64) },
      { name: `${webName}:${source}`, digest: 'sha256:' + 'c'.repeat(64) },
    ] },
  };
  assert.deepEqual(verifyHostedWorkspaceBuildReceipt(build, approval, manifest), {
    sourceSha: source, apiImage: manifest.api.image, webImage: webName + '@sha256:' + 'c'.repeat(64),
  });
  for (const modify of [
    value => { value.status = 'FAILURE'; },
    value => { value.id = 'other-build'; },
    value => { value.sourceProvenance.resolvedStorageSource.generation = '124'; },
    value => { value.results.images[0].digest = 'sha256:' + 'd'.repeat(64); },
    value => { value.results.images[1].name = webName + ':latest'; },
  ]) {
    const wrong = structuredClone(build);
    modify(wrong);
    assert.throws(() => verifyHostedWorkspaceBuildReceipt(wrong, approval, manifest));
  }
});

test('disallowed methods, paths, origins and credentials fail before Google or Supabase', async () => {
  const manifest = makeManifest();
  let calls = 0;
  const fetcher = async () => { calls++; throw Error('Unexpected request'); };
  for (const [input, path, status] of [
    [request(), '/api/billing/webhook', 404],
    [request(), '/api/browser/local/runs', 404],
    [request(), '/api/native-openui/evaluate', 404],
    [request({ origin: 'https://xroga.com' }), planPath, 403],
    [request({ token: null }), planPath, 401],
    [request({ token: jwt({ issuer: 'https://nzenxdfumxrnsmybazmo.supabase.co/auth/v1' }) }), planPath, 401],
    [request({ token: jwt({ expiration: 1 }) }), planPath, 401],
    [request({ body: 'x'.repeat(10 * 1024 * 1024 + 1) }), planPath, 413],
  ]) assert.equal((await forwardHostedWorkspace(input, path, manifest, fetcher)).status, status);
  assert.equal(calls, 0);
});

test('Google IAM and original user token stay separate and response drops platform headers', async () => {
  const manifest = makeManifest();
  const token = jwt();
  const observed = [];
  const fetcher = async (url, options) => {
    observed.push({ url, options });
    if (url.hostname === 'metadata.google.internal') return new Response('google.id.token', { headers: { 'Metadata-Flavor': 'Google' } });
    if (url.pathname === '/health') return Response.json({ service: 'xroga-api', release: source });
    return Response.json({ result: 'fixture' }, { headers: { 'set-cookie': 'forged=1', 'X-Serverless-Authorization': 'internal' } });
  };
  const response = await forwardHostedWorkspace(request({ token }), planPath, manifest, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: 'fixture' });
  assert.equal(observed[0].url.searchParams.get('audience'), manifest.api.audience);
  assert.equal(observed[1].options.headers.Authorization, undefined);
  assert.equal(observed[2].url.origin, manifest.api.origin);
  assert.equal(observed[2].options.headers.get('Authorization'), token);
  assert.equal(observed[2].options.headers.get('X-Serverless-Authorization'), 'Bearer google.id.token');
  assert.equal(observed[2].options.headers.get('Cookie'), null);
  assert.equal(observed[2].options.headers.get('X-Forwarded-Host'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('X-Serverless-Authorization'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('the staging bridge forwards an empty Share revoke and rejects nonempty revoke bodies', async () => {
  const manifest = makeManifest();
  const path = '/api/message-shares/isolated-share-test-token';
  const token = jwt();
  const forwarded = [];
  const fetcher = async (url, options) => {
    if (url.hostname === 'metadata.google.internal') return new Response('google.id.token', { headers: { 'Metadata-Flavor': 'Google' } });
    if (url.pathname === '/health') return Response.json({ service: 'xroga-api', release: source });
    forwarded.push({ url, options });
    return Response.json({ success: true });
  };
  const revoke = (body, headers = {}) => new Request(manifest.web.origin + path, {
    method: 'DELETE', duplex: 'half', body, headers: { Authorization: token, ...headers },
  });
  const emptyStream = new ReadableStream({ start(controller) { controller.close(); } });
  const accepted = await forwardHostedWorkspace(revoke(emptyStream), path, manifest, fetcher);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { success: true });
  assert.equal(forwarded[0].url.pathname, path);
  assert.equal(forwarded[0].options.method, 'DELETE');
  assert.equal(forwarded[0].options.headers.get('authorization'), token);
  assert.equal(forwarded[0].options.body, undefined);
  for (const input of [revoke('{}'), revoke('{}', { 'Content-Type': 'application/json' })]) {
    assert.equal((await forwardHostedWorkspace(input, path, manifest, fetcher)).status, 415);
  }
  assert.equal(forwarded.length, 1);
});

test('wrong API source fails before forwarding and upstream redirects never escape', async () => {
  const manifest = makeManifest();
  for (const release of [source, 'wrong']) {
    let actions = 0;
    const fetcher = async (url) => {
      if (url.hostname === 'metadata.google.internal') return new Response('google.id.token', { headers: { 'Metadata-Flavor': 'Google' } });
      if (url.pathname === '/health') return Response.json({ service: 'xroga-api', release });
      actions++;
      return Response.redirect('https://api.xroga.com');
    };
    const response = await forwardHostedWorkspace(request(), planPath, manifest, fetcher);
    assert.equal(response.status, release === source ? 502 : 503);
    assert.equal(response.headers.get('location'), null);
    assert.equal(actions, release === source ? 1 : 0);
  }
});

test('signed usage reports the binding and outcome of the same authenticated request', async () => {
  const manifest = makeManifest();
  const subject = '123456789012345678901';
  const issued = (overrides = {}) => 'google.' + Buffer.from(JSON.stringify({
    sub: subject, aud: manifest.api.audience, iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 60, ...overrides,
  })).toString('base64url') + '.signature';
  for (const [name, options, expected] of [
    ['ready', {}, [200, 'api_usage', true, 200, true, 200, 3]],
    ['wrong principal', { claims: { sub: '999999999999999999999' } }, [503, 'platform_binding', false, null, false, null, 1]],
    ['wrong audience', { claims: { aud: 'https://api.xroga.com' } }, [503, 'platform_binding', false, null, false, null, 1]],
    ['expired identity', { claims: { exp: 1 } }, [503, 'platform_binding', false, null, false, null, 1]],
    ['metadata failed', { metadata: 503 }, [503, 'platform_identity', false, null, false, null, 1]],
    ['Cloud Run denied', { health: 403 }, [503, 'api_health', true, 403, false, null, 2]],
    ['wrong API release', { release: 'wrong' }, [503, 'api_health', true, 200, false, null, 2]],
    ['API denied user', { usage: 401 }, [401, 'api_usage', true, 200, true, 401, 3]],
  ]) {
    const records = [];
    const requests = [];
    const user = jwt();
    const google = issued(options.claims);
    const fetcher = async (url, init) => {
      requests.push({ url, init });
      if (url.hostname === 'metadata.google.internal') {
        return new Response(google, { status: options.metadata ?? 200, headers: { 'Metadata-Flavor': 'Google' } });
      }
      if (url.pathname === '/health') {
        return Response.json({ service: 'xroga-api', release: options.release ?? source }, { status: options.health ?? 200 });
      }
      return Response.json({ usage: 'synthetic private data' }, { status: options.usage ?? 200 });
    };
    const usage = '/api/phase1/usage';
    const result = await forwardHostedWorkspace(request({ token: user, method: 'GET' }), usage, manifest, fetcher, {
      subject, emit: record => records.push(record),
    });
    const [status, phase, bindingMatches, healthStatus, releaseMatches, usageStatus, calls] = expected;
    assert.equal(result.status, status, name);
    assert.equal(requests.length, calls, name);
    assert.deepEqual(records, [{
      event: 'hosted-workspace-signed-usage', source, phase, bindingMatches, healthStatus, releaseMatches, usageStatus,
    }], name);
    assert.equal(requests[0].url.searchParams.get('audience'), manifest.api.audience);
    if (calls === 3) {
      assert.equal(requests[2].init.headers.get('Authorization'), user);
      assert.equal(requests[2].init.headers.get('X-Serverless-Authorization'), 'Bearer ' + google);
    }
    const logged = JSON.stringify(records);
    for (const secret of [user, google, subject, 'synthetic private data']) assert.ok(!logged.includes(secret));
    assert.equal(result.headers.get('x-serverless-authorization'), null);
  }
});

test('unauthenticated and non-probe routes do not emit invocation diagnostics', async () => {
  const manifest = makeManifest();
  const diagnostics = { subject: '123456789012345678901', emit: () => assert.fail('unexpected diagnostic') };
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    if (url.hostname === 'metadata.google.internal') return new Response('google.id.token', { headers: { 'Metadata-Flavor': 'Google' } });
    if (url.pathname === '/health') return Response.json({ service: 'xroga-api', release: source });
    return Response.json({ accepted: true });
  };
  assert.equal((await forwardHostedWorkspace(request({ token: null, method: 'GET' }), '/api/phase1/usage', manifest, fetcher, diagnostics)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await forwardHostedWorkspace(request(), planPath, manifest, fetcher, diagnostics)).status, 200);
  assert.equal(calls, 3);
});

test('hosted confirmation admits only the exact owner-visible DeepSeek research action', async () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const base = '/api/phase1/business-actions/confirmations/' + id;
  const manifest = makeManifest();
  for (const [status, toolkit, actualId, allowed] of [
    [200, 'xroga-native-research', id, true],
    [200, 'connected-app', id, false],
    [200, 'xroga-native-research', 'another-id', false],
    [404, '', id, false],
  ]) {
    const actions = [];
    const fetcher = async (url, options) => {
      if (url.hostname === 'metadata.google.internal') return new Response('google.id.token', { headers: { 'Metadata-Flavor': 'Google' } });
      if (url.pathname === '/health') return Response.json({ service: 'xroga-api', release: source });
      actions.push([url.pathname, options.method, options.headers.get('Authorization')]);
      if (url.pathname === base && options.method === 'GET') return Response.json({ confirmation: { id: actualId, toolkit } }, { status });
      return Response.json({ ok: true });
    };
    const input = request();
    const response = await forwardHostedWorkspace(input, base + '/confirm', manifest, fetcher);
    assert.equal(response.status, allowed ? 200 : 404);
    const token = input.headers.get('Authorization');
    assert.deepEqual(actions, [[base, 'GET', token], ...(allowed ? [[base + '/confirm', 'POST', token]] : [])]);
  }
});
