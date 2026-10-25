import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRunDurable, isRunCancellationRequested, resumeRunDurable, withRunAttempt } from './runStore.js';


test('a delayed cancellation read cannot admit an old callback after local resume', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID(), run = randomUUID();
  let stored: Record<string, unknown> = {}, release: (() => void) | undefined, observed!: () => void;
  const waiting = new Promise<void>(resolve => { observed = resolve; });
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const url = new URL(req.url!, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') { stored = body; res.writeHead(201); res.end(); return; }
    if (req.method === 'PATCH') { stored = { ...stored, ...body }; res.end(JSON.stringify([{ id: run }])); return; }
    if (url.searchParams.get('select') === 'id,user_id,status,lease_generation,worker_id') {
      const original = { ...stored };
      release = () => res.end(JSON.stringify(original)); observed(); return;
    }
    res.end(JSON.stringify(stored));
  });
  let old: Promise<void> | undefined;
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only'; process.env.NODE_ENV = 'production';
    old = withRunAttempt(async () => {
      await createRunDurable(owner, 'fixture', run);
      await assert.rejects(isRunCancellationRequested(run, owner), /Run authority is unavailable/);
    });
    void old.catch(() => {});
    await Promise.race([waiting, old.then(() => { throw new Error('Old poll ended before the held read'); })]);
    stored = { ...stored, status: 'error', completed_at: new Date().toISOString(), iteration_count: 1, worker_id: null };
    await withRunAttempt(async () => { assert.equal((await resumeRunDurable(owner, 'retry', run)).status, 'running'); });
    release!(); await old;
  } finally {
    release?.(); if (old) await old.catch(() => {});
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
