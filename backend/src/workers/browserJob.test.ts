import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BROWSER_JOB_CEILINGS, BrowserJobError, jobIdempotencyKey, navigationAllowed, parseBrowserJob } from './browserJob.js';

const limits = { maxDurationMs: 60_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 10_000_000, maxArtifactBytes: 5_000_000, maxModelCostMicros: 0 };
const good = () => ({
  version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt: 1,
  allowedOrigins: ['https://example.com', 'https://docs.example.com/ignored/path'], startUrl: 'https://example.com/start?q=1', limits,
});
const code = (c: string) => (e: unknown) => e instanceof BrowserJobError && e.code === c;

describe('browser job contract', () => {
  it('accepts a well formed job and normalises origins', () => {
    const job = parseBrowserJob(good());
    assert.deepEqual(job.allowedOrigins, ['https://docs.example.com', 'https://example.com']);
    assert.equal(job.startUrl, 'https://example.com/start?q=1');
  });

  it('refuses unknown fields, so a credential has nowhere to ride along', () => {
    for (const extra of ['cookie', 'token', 'password', 'authorization', 'credentials', 'apiKey', 'headers']) {
      assert.throws(() => parseBrowserJob({ ...good(), [extra]: 'secret' }), code('JOB_INVALID'), extra);
    }
    assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, proxy: 'x' } }), code('JOB_INVALID'));
  });

  it('every origin and the start URL must pass the canonical egress policy', () => {
    for (const bad of [
      'http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://2130706433', 'https://0x7f000001', 'https://[::1]',
      'https://[::ffff:7f00:1]', 'https://169.254.169.254', 'https://10.0.0.5', 'https://192.168.1.1', 'https://100.64.0.1',
      'https://metadata.google.internal', 'https://user:pw@example.com', 'https://example.com:8443', 'file:///etc/passwd', 'javascript:1', 'not a url',
    ]) {
      assert.throws(() => parseBrowserJob({ ...good(), allowedOrigins: ['https://example.com', bad] }), code('JOB_SCOPE_VIOLATION'), bad);
      assert.throws(() => parseBrowserJob({ ...good(), allowedOrigins: [bad], startUrl: bad }), code('JOB_SCOPE_VIOLATION'), `start ${bad}`);
    }
  });

  it('the start URL must be inside the allowed origins', () => {
    assert.throws(() => parseBrowserJob({ ...good(), startUrl: 'https://other.example.org/' }), code('JOB_SCOPE_VIOLATION'));
  });

  it('limits may not exceed the ceilings and must be whole numbers in range', () => {
    for (const k of Object.keys(BROWSER_JOB_CEILINGS) as (keyof typeof limits)[]) {
      assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, [k]: BROWSER_JOB_CEILINGS[k] + 1 } }), code('JOB_LIMIT_EXCEEDED'), k);
      assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, [k]: -1 } }), code('JOB_INVALID'), k);
      assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, [k]: 1.5 } }), code('JOB_INVALID'), k);
      assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, [k]: '5' } }), code('JOB_INVALID'), k);
      assert.ok(parseBrowserJob({ ...good(), limits: { ...limits, [k]: BROWSER_JOB_CEILINGS[k] } }), `ceiling itself is allowed: ${k}`);
    }
    for (const k of ['maxDurationMs', 'maxNavigations', 'maxPages', 'maxResponseBytes', 'maxArtifactBytes'] as const) {
      assert.throws(() => parseBrowserJob({ ...good(), limits: { ...limits, [k]: 0 } }), code('JOB_INVALID'), `${k} may not be zero`);
    }
    const { maxPages: _omit, ...partial } = limits;
    assert.throws(() => parseBrowserJob({ ...good(), limits: partial }), code('JOB_INVALID'));
  });

  it('identifiers are short and plain; non objects and wrong versions are refused', () => {
    for (const field of ['tenantId', 'userId', 'projectId', 'runId', 'taskId']) {
      for (const bad of ['', ' ', 'a b', 'x'.repeat(200), '../../etc', 'a/b', undefined, 7]) {
        assert.throws(() => parseBrowserJob({ ...good(), [field]: bad }), code('JOB_INVALID'), `${field}=${String(bad)}`);
      }
    }
    for (const bad of [null, 'x', 5, [], undefined]) assert.throws(() => parseBrowserJob(bad), code('JOB_INVALID'));
    assert.throws(() => parseBrowserJob({ ...good(), version: 2 }), code('JOB_INVALID'));
    for (const a of [0, -1, 1.5, 101, '1']) assert.throws(() => parseBrowserJob({ ...good(), attempt: a }), code('JOB_INVALID'), String(a));
  });

  it('origin lists are bounded', () => {
    assert.throws(() => parseBrowserJob({ ...good(), allowedOrigins: [] }), code('JOB_INVALID'));
    const many = Array.from({ length: 21 }, (_, i) => `https://h${i}.example.com`);
    assert.throws(() => parseBrowserJob({ ...good(), allowedOrigins: many }), code('JOB_INVALID'));
  });

  it('navigation, including every redirect hop, must stay in scope and pass egress policy', () => {
    const job = parseBrowserJob(good());
    assert.ok(navigationAllowed(job, 'https://example.com/a/b?x=1'));
    assert.ok(navigationAllowed(job, 'https://docs.example.com/'));
    for (const url of [
      'https://evil.example.net/', 'https://example.com.evil.net/', 'https://sub.example.com/', 'http://example.com/', 'https://example.com:444/',
      'https://127.0.0.1/', 'https://[::ffff:127.0.0.1]/', 'https://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'data:text/html,hi', '', 'garbage',
      'https://user@example.com/',
    ]) assert.equal(navigationAllowed(job, url), false, url);
  });

  it('idempotency key is stable across attempts and differs across tenant, run and task', () => {
    const base = parseBrowserJob(good());
    assert.equal(jobIdempotencyKey(base), jobIdempotencyKey({ ...base, attempt: 3 }));
    const keys = new Set([jobIdempotencyKey(base), jobIdempotencyKey({ ...base, tenantId: 't2' }), jobIdempotencyKey({ ...base, runId: 'r2' }), jobIdempotencyKey({ ...base, taskId: 'k2' })]);
    assert.equal(keys.size, 4);
    // delimiter smuggling: ("a","b:c") must not collide with ("a:b","c")
    assert.notEqual(jobIdempotencyKey({ tenantId: 'a', runId: 'b:c', taskId: 'x' }), jobIdempotencyKey({ tenantId: 'a:b', runId: 'c', taskId: 'x' }));
  });
});
