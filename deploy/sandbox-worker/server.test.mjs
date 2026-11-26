import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

process.env.XROGA_WORKER_NO_NETNS = '1';
process.env.XROGA_WORKER_EXIT_AFTER_RUN = '0';
process.env.WORKER_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const TEST_TOKEN = process.env.WORKER_TOKEN;
const { authorised, safeRelative, readRequest, execute, createServer } = await import('./server.mjs');

const base = (over = {}) => ({
  files: [], command: process.execPath, args: ['-e', 'console.log("hi")'], timeoutMs: 10_000, networkPolicy: 'none', environment: {},
  limits: { memoryMb: 512, cpuSeconds: 10, diskMb: 16, maxProcesses: 64 }, ...over,
});

test('only the shared token is accepted, in either header', () => {
  assert.equal(authorised({ headers: { 'x-xroga-worker-token': TEST_TOKEN } }), true);
  assert.equal(authorised({ headers: { authorization: `Bearer ${TEST_TOKEN}` } }), true);
  assert.equal(authorised({ headers: { authorization: 'Bearer wrong' } }), false);
  assert.equal(authorised({ headers: {} }), false);
});

test('paths that leave the working directory are refused', () => {
  for (const bad of ['../x', '/etc/passwd', 'a/../../x', 'a\\b', '', 'a\0b', '..']) assert.equal(safeRelative(bad), null, bad);
  assert.equal(safeRelative('src/main.py'), 'src/main.py');
});

test('a request must be exactly the supported shape, and only "none" and "registry-only" are network policies', () => {
  assert.ok(readRequest(base()).request);
  assert.ok(readRequest(base({ networkPolicy: 'registry-only' })).request);
  const staged = readRequest(base({ stages: [{ id: 'install:.', command: 'pip', args: ['install', 'x'], networkPolicy: 'registry-only', timeoutMs: 5_000, cwd: 'pkg' }, { id: 'test:.', command: 'python3', args: [], networkPolicy: 'none', timeoutMs: 5_000 }] }));
  assert.deepEqual(staged.request.stages.map(s => [s.id, s.networkPolicy, s.cwd]), [['install:.', 'registry-only', 'pkg'], ['test:.', 'none', '']]);
  for (const bad of [base({ stages: [{ id: 'a', command: 'x', args: [], networkPolicy: 'open', timeoutMs: 5_000 }] }), base({ stages: [{ id: 'a', command: 'x', args: [], networkPolicy: 'none', timeoutMs: 5_000, cwd: '../x' }] }),
    base({ stages: 'x' }), base({ stages: Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, command: 'x', args: [], networkPolicy: 'none', timeoutMs: 5_000 })) })]) assert.ok(readRequest(bad).error);
  for (const bad of [base({ networkPolicy: 'restricted' }), base({ networkPolicy: 'open' }), base({ command: '' }),
    base({ timeoutMs: 5 }), base({ environment: { 'bad key': 'x' } }), base({ files: [{ path: '../x', content: 'y' }] }),
    base({ files: [{ path: 'xroga-out/a', content: 'y' }] }), base({ args: [1] })]) assert.ok(readRequest(bad).error);
});

test('runs a command in a fresh directory with exactly the environment given, returns output and artifacts, and cleans up', async () => {
  const before = (await readdir(tmpdir())).filter(name => name.startsWith('xroga-run-')).length;
  const request = readRequest(base({
    files: [{ path: 'job.mjs', content: 'import {writeFileSync,mkdirSync} from "node:fs"; console.log(process.env.GREETING, process.env.SECRET ?? "no-secret"); writeFileSync("xroga-out/result.csv","a,b\\n1,2\\n");' }],
    args: ['job.mjs'], environment: { GREETING: 'hello' },
  })).request;
  const result = await execute(request);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'hello no-secret');
  assert.equal(result.artifacts.length, 1);
  assert.equal(Buffer.from(result.artifacts[0].contentBase64, 'base64').toString(), 'a,b\n1,2\n');
  const after = (await readdir(tmpdir())).filter(name => name.startsWith('xroga-run-')).length;
  assert.equal(after, before, 'the temporary directory is removed');
});

test('a command that outlives its timeout is killed and reported as timed out', async () => {
  const result = await execute(readRequest(base({ args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 800 })).request);
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
});

test('output is capped to its tail', async () => {
  const result = await execute(readRequest(base({ args: ['-e', 'process.stdout.write("x".repeat(100000)+"END")'] })).request);
  assert.ok(result.stdout.length <= 40_000);
  assert.ok(result.stdout.endsWith('END'));
});

test('an unauthenticated call is refused, and an unsupported network policy gets a 400 from the server', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/health`)).status, 401);
    const headers = { 'content-type': 'application/json', 'x-xroga-worker-token': TEST_TOKEN };
    const refused = await fetch(`${url}/execute`, { method: 'POST', headers, body: JSON.stringify(base({ networkPolicy: 'open' })) });
    assert.equal(refused.status, 400);
    // The restricted-network stage is refused, not downgraded, when it cannot be verified (here: no network namespace).
    const unverified = await fetch(`${url}/execute`, { method: 'POST', headers, body: JSON.stringify(base({ networkPolicy: 'registry-only' })) });
    assert.equal(unverified.status, 503);
    const ok = await fetch(`${url}/execute`, { method: 'POST', headers, body: JSON.stringify(base()) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).stdout.trim(), 'hi');
    // Without a verified network namespace the worker must not claim isolation.
    const health = await (await fetch(`${url}/health`, { headers })).json();
    assert.equal(health.networkIsolation, false);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a file the job (or repository) plants in a run-local bin directory never shadows a system program', { skip: process.platform === 'win32' }, async () => {
  const request = readRequest(base({
    files: [{ path: '.local/bin/cat', content: '#!/bin/sh\necho PLANTED\n' }, { path: 'data.txt', content: 'real\n' }],
    command: 'sh', args: ['-c', 'chmod +x .local/bin/cat; cat data.txt'],
  })).request;
  const result = await execute(request);
  assert.equal(result.stdout.trim(), 'real');
});
