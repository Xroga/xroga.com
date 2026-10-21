import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import router from './terminalSessions.js';
import { createTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test('terminal autosave refuses writes after failed metadata or number allocation reads', async () => {
  let failAt = 1;
  const methods: string[] = [];
  const database = createServer((req, res) => {
    methods.push(req.method ?? '');
    const projection = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('select');
    const failing = failAt === 1 || projection === 'terminal_number';
    res.writeHead(failing ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(failing ? { code: 'XX000', message: 'SYNTHETIC_DATABASE_ERROR_CANARY' } : []));
  });
  const envKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));
  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res, next) => {
    req.tenantContext = createTenantContext({ userId: '11111111-1111-4111-8111-111111111111', via: 'local_jwt' });
    next();
  });
  app.use('/sessions', router);
  const api = createServer(app);
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SUPABASE_URL = await listen(database);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    const origin = await listen(api);
    for (failAt of [1, 2]) {
      methods.length = 0;
      const response = await fetch(`${origin}/sessions/synthetic-terminal`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubRepoName: 'fixture/repo', messages: [{ content: 'fixture' }] }),
      });
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes('SYNTHETIC_DATABASE_ERROR_CANARY'));
      assert.ok(methods.length >= failAt);
      assert.ok(methods.every(method => method === 'GET'), 'No mutation follows an unavailable authority read');
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await Promise.all([close(api), close(database)]);
  }
});
