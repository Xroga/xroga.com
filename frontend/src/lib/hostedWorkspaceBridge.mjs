import { readFileSync } from 'node:fs';
import { hostedResearchConfirmation, isHostedWorkspaceRoute, requireHostedWorkspaceBuild } from '../../../scripts/security/hosted-workspace-staging.mjs';
const guestShare = /^\/api\/message-shares\/[A-Za-z0-9_-]{20,80}$/;
const requestHeaders = ['authorization', 'content-type', 'accept', 'range', 'x-xroga-language'];
const responseHeaders = ['content-type', 'content-disposition', 'content-range', 'accept-ranges', 'content-security-policy'];
const maxBodyBytes = 10 * 1024 * 1024;
const usagePath = '/api/phase1/usage';
let config;

function hostedConfig() {
  if (process.env.XROGA_STAGING_AUTH_BUILD !== '1' || process.env.XROGA_WORKSPACE_STAGING_RUNTIME !== '1') {
    throw new Error('Hosted Workspace bridge unavailable');
  }
  if (!config) {
    const manifest = JSON.parse(readFileSync(process.env.XROGA_STAGING_MANIFEST_PATH ?? '', 'utf8'));
    config = requireHostedWorkspaceBuild(process.env, manifest);
  }
  return config;
}

/** @param {Headers} source @param {string[]} allowed */
function copyHeaders(source, allowed) {
  const result = new Headers();
  for (const key of allowed) {
    const value = source.get(key);
    if (value !== null) result.set(key, value);
  }
  return result;
}

/** Unverified claims are rejection hints only. Xroga verifies the unchanged token. */
/** @param {string} authorization @param {string} issuer */
function matchesStagingIssuer(authorization, issuer) {
  if (authorization.length > 12000 || !/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(authorization)) return false;
  try {
    const claims = JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString('utf8'));
    return claims.iss === issuer && claims.aud === 'authenticated' && claims.role === 'authenticated'
      && Number.isSafeInteger(claims.exp) && claims.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** @param {number} status */
function denied(status) {
  return Response.json({ error: 'Staging API request unavailable.' }, {
    status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}

/** @param {string} audience @param {typeof globalThis.fetch} fetch */
async function googleIdentity(audience, fetch) {
  const url = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
  url.searchParams.set('audience', audience);
  const response = await fetch(url, {
    headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(2500),
  });
  if (!response.ok || response.headers.get('metadata-flavor') !== 'Google') throw new Error('Platform identity unavailable');
  const token = await response.text();
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 12000) throw new Error('Platform identity unavailable');
  return token;
}

/** Inspect only the platform token we just obtained. Cloud Run authenticates it.
 * @param {string} token @param {string} audience @param {string} subject */
function matchesPlatformBinding(token, audience, subject) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return /^[0-9]{12,24}$/.test(subject) && claims.sub === subject && claims.aud === audience
      && (claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com')
      && Number.isSafeInteger(claims.exp) && claims.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** @param {Request} request @param {string} path @param {ReturnType<typeof requireHostedWorkspaceBuild>} manifest
 * @param {typeof globalThis.fetch} [fetch]
 * @param {{subject: string, emit: (record: object) => void}} [diagnostics] */
export async function forwardHostedWorkspace(request, path, manifest, fetch = globalThis.fetch, diagnostics) {
  const method = request.method;
  if (!isHostedWorkspaceRoute(path, method)) return denied(404);
  const origin = request.headers.get('origin');
  if ((origin && origin !== manifest.web.origin && origin !== manifest.web.operatorOrigin)
    || request.headers.get('sec-fetch-site') === 'cross-site') return denied(403);

  const authorization = request.headers.get('authorization');
  if (authorization ? !matchesStagingIssuer(authorization, manifest.auth.issuer) : !(method === 'GET' && guestShare.test(path))) {
    return denied(401);
  }
  const search = new URL(request.url).search;
  const research = hostedResearchConfirmation(path, method);
  if (search.length > 4096 || (research && search)) return denied(400);
  // The staging ingress can expose a zero-byte DELETE as a body stream.
  const bodylessRevoke = method === 'DELETE' && guestShare.test(path);
  if (request.body && !bodylessRevoke && !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return denied(415);
  const headers = copyHeaders(request.headers, requestHeaders);
  const abort = AbortSignal.any([request.signal, AbortSignal.timeout(180000)]);
  const probe = method === 'GET' && path === usagePath && !search ? diagnostics : undefined;
  let phase = 'platform_identity';
  let bindingMatches = false;
  let healthStatus = null;
  let releaseMatches = false;
  let usageStatus = null;

  try {
    let body;
    if (request.body) {
      let bytes = 0;
      const reader = request.body.getReader();
      const chunks = [];
      try {
        for (;;) {
          abort.throwIfAborted();
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bodylessRevoke && bytes > 0) return denied(415);
          if (bytes > maxBodyBytes) return denied(413);
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (!bodylessRevoke) body = Buffer.concat(chunks);
    }
    abort.throwIfAborted();
    const token = await googleIdentity(manifest.api.audience, fetch);
    if (probe) {
      phase = 'platform_binding';
      bindingMatches = matchesPlatformBinding(token, manifest.api.audience, probe.subject);
      if (!bindingMatches) return denied(503);
    }
    const platform = `Bearer ${token}`;
    phase = 'api_health';
    const health = await fetch(new URL('/health', manifest.api.origin), {
      headers: { 'X-Serverless-Authorization': platform },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.any([abort, AbortSignal.timeout(5000)]),
    });
    healthStatus = health.status;
    const receipt = health.ok ? await health.json() : null;
    releaseMatches = receipt?.service === 'xroga-api' && receipt?.release === manifest.api.sourceSha;
    if (!releaseMatches) {
      await health.body?.cancel().catch(() => undefined);
      return denied(503);
    }
    headers.set('X-Serverless-Authorization', platform);
    if (research) {
      // The shared action route may represent other toolkits. Read the immutable
      // confirmation using the same owner JWT before admitting the one-use POST.
      const detail = await fetch(new URL(research, manifest.api.origin), {
        method: 'GET', headers, signal: abort, cache: 'no-store', redirect: 'error',
      });
      if (!detail.ok) {
        await detail.body?.cancel().catch(() => undefined);
        return denied(detail.status === 401 ? 401 : 404);
      }
      const record = await detail.json();
      if (record?.confirmation?.toolkit !== 'xroga-native-research'
        || record.confirmation.id !== research.split('/').at(-1)) return denied(404);
      if (method === 'GET') return Response.json(record, { headers: {
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
      } });
    }
    phase = 'api_usage';
    const upstream = await fetch(new URL(path + search, manifest.api.origin), {
      method, headers, body, signal: abort, cache: 'no-store', redirect: 'manual',
    });
    usageStatus = upstream.status;
    if (upstream.redirected || (upstream.status >= 300 && upstream.status < 400)) {
      await upstream.body?.cancel().catch(() => undefined);
      return denied(502);
    }
    const result = copyHeaders(upstream.headers, responseHeaders);
    result.set('cache-control', 'private, no-store');
    result.set('x-content-type-options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers: result });
  } catch {
    return denied(503);
  } finally {
    if (probe) {
      try {
        probe.emit({
          event: 'hosted-workspace-signed-usage', source: manifest.sourceSha, phase,
          bindingMatches, healthStatus, releaseMatches, usageStatus,
        });
      } catch { /* A missing log receipt blocks provider admission in the operator, not the signed read. */ }
    }
  }
}

/** @param {Request} request @param {string} path */
export function hostedWorkspaceRequest(request, path) {
  try {
    const manifest = hostedConfig();
    const subject = process.env.XROGA_STAGING_INVOKER_SUBJECT;
    return forwardHostedWorkspace(request, path, manifest, globalThis.fetch, subject === undefined ? undefined : {
      subject, emit: record => console.info(JSON.stringify(record)),
    });
  } catch {
    return denied(404);
  }
}
