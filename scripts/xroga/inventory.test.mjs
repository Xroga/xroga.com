import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCodeInventory, generateInventory, requiredPaths, serializedOutputs } from './inventory.mjs';
import { validateInventory } from './inventory-schema.mjs';

const sources = [
  { sourcePath: 'backend/src/index.ts', content: "import express from 'express'; import mounted from './routes/mounted.js'; const app = express(); app.use('/api/example', authMiddleware, mounted); export default app;" },
  { sourcePath: 'backend/src/routes/mounted.ts', content: "import { Router } from 'express'; const router = Router(); router.post('/run', async (req,res) => res.json({value:1})); export default router;" },
  { sourcePath: 'backend/src/routes/unmounted.ts', content: "import { Router } from 'express'; const router = Router(); router.get('/secret', (req,res) => res.json({value:1})); export default router;" },
  { sourcePath: 'backend/src/config/queue.ts', content: "import { Queue, Worker } from 'bullmq'; export function getJobs(){return new Queue('jobs');} export function enqueue(){const q = getJobs();q.add('task',{});} new Worker('jobs',async job => job.data);" },
  { sourcePath: 'frontend/src/app/demo/page.tsx', content: "import Demo from '@/components/os-preview/Demo'; export default Demo;" },
  { sourcePath: 'frontend/src/components/os-preview/Demo.tsx', content: "export default function Demo(){return <p>Simulated success</p>}" },
];

test('mounted endpoint has a complete mount path and inherited auth, unmounted fixture cannot be reachable', () => {
  const inventory = buildCodeInventory(sources, ['backend/src/index.ts', 'frontend/src/app/demo/page.tsx']);
  assert.equal(inventory.routes.find(item => item.path === '/api/example/run').reachable, true);
  assert.deepEqual(inventory.routes.find(item => item.path === '/api/example/run').authBoundary, ['authMiddleware']);
  const unmounted = inventory.routes.find(item => item.sourcePath.endsWith('/unmounted.ts'));
  assert.equal(unmounted.reachable, false);
  assert.equal(unmounted.state, 'DEAD_OR_UNREACHABLE');
});
test('queue definition, producer and consumer are linked without assuming active connectivity', () => {
  const inventory = buildCodeInventory(sources, ['backend/src/config/queue.ts']);
  assert.equal(inventory.queues.length, 1);
  assert.equal(inventory.queues[0].name, 'jobs');
  assert.equal(inventory.queues[0].producers.length, 1);
  assert.equal(inventory.queues[0].consumers.length, 1);
  assert.equal(inventory.queues[0].state, 'IMPLEMENTED_BUT_UNVERIFIED');
});
test('explicit preview simulation is never classified as verified implementation', () => {
  const inventory = buildCodeInventory(sources, ['frontend/src/app/demo/page.tsx']);
  assert.equal(inventory.surfaces.find(item => item.sourcePath.endsWith('/Demo.tsx')).state, 'PLACEHOLDER');
  assert.equal(inventory.findings.find(item => item.kind === 'SIMULATED').state, 'PLACEHOLDER');
});
test('type-only import cannot make an unmounted implementation reachable', () => {
  const inventory = buildCodeInventory([
    { sourcePath: 'backend/src/index.ts', content: "import type { Secret } from './secret.js'; export const ready = true;" },
    { sourcePath: 'backend/src/secret.ts', content: 'export interface Secret { value: string }; export function dead(){return true}' },
  ], ['backend/src/index.ts']);
  assert.equal(inventory.surfaces.find(item => item.sourcePath.endsWith('/secret.ts')).reachable, false);
});
test('invoked router factories retain each mounted catch-all', () => {
  const inventory = buildCodeInventory([
    { sourcePath: 'backend/src/index.ts', content: "import express from 'express';import retired from './routes/old.js';const app=express();app.use('/api/old',authMiddleware,retired);" },
    { sourcePath: 'backend/src/routes/old.ts', content: "import { makeRouter } from './factory.js'; export default makeRouter('old');" },
    { sourcePath: 'backend/src/routes/factory.ts', content: "import { Router } from 'express';export function makeRouter(){const router=Router();router.use((req,res)=>res.status(410).json({retired:true}));return router;}" },
  ], ['backend/src/index.ts']);
  assert.equal(inventory.routes[0].path, '/api/old/*');
  assert.equal(inventory.routes[0].method, 'ALL');
  assert.equal(inventory.routes[0].reachable, true);
});
test('JSX and asset imports resolve without treating asset text as runtime code', () => {
  const inventory = buildCodeInventory([
    { sourcePath: 'frontend/src/app/page.tsx', content: "import Card from '@/components/Card';import './style.css';export default Card;" },
    { sourcePath: 'frontend/src/components/Card.jsx', content: 'export default function Card(){return <p>Card</p>}' },
  ], ['frontend/src/app/page.tsx'], ['frontend/src/app/style.css']);
  assert.equal(inventory.surfaces.find(item => item.sourcePath.endsWith('/Card.jsx')).reachable, true);
  assert.deepEqual(inventory.unresolved, []);
});
test('actual inventory includes known route, integration action, UI primitives, queues and ordered migrations', () => {
  const inventory = generateInventory();
  assert.ok(inventory.routes.some(item => item.path === '/health' && item.reachable));
  assert.ok(inventory.routes.some(item => item.path.startsWith('/api/integrations') && item.reachable));
  assert.ok(inventory.surfaces.some(item => item.sourcePath.endsWith('/businessAction.ts')));
  assert.ok(inventory.surfaces.some(item => item.sourcePath.endsWith('/xrogaBlocks.ts')));
  assert.ok(inventory.queues.some(item => item.name === 'notifications'));
  assert.ok(inventory.migrations.length > 0);
  assert.deepEqual(inventory.migrations.map(item => item.sourcePath), inventory.migrations.map(item => item.sourcePath).sort());
  assert.deepEqual(inventory.migrations.map(item => item.order), inventory.migrations.map((_, index) => index + 1));
  assert.equal(inventory.requiredPaths.length, requiredPaths.length);
  assert.equal(inventory.requiredPaths.find(item => item.sourcePath === '.vercel/project.json').presence, 'ABSENT');
});
test('missing fields, duplicate IDs and invalid reachable claims are rejected', () => {
  const valid = generateInventory();
  const missing = structuredClone(valid); delete missing.surfaces[0].authBoundary;
  assert.throws(() => validateInventory(missing));
  const duplicate = structuredClone(valid); duplicate.surfaces.push(duplicate.surfaces[0]);
  assert.throws(() => validateInventory(duplicate), /Duplicate inventory ID/);
  const invalid = structuredClone(valid); invalid.routes[0].reachable = false; invalid.routes[0].state = 'IMPLEMENTED_AND_REACHABLE';
  assert.throws(() => validateInventory(invalid), /Unreachable route misclassified/);
});
test('same SHA and audit identity produce byte-identical generated output', () => {
  const first = serializedOutputs(generateInventory());
  const second = serializedOutputs(generateInventory());
  assert.deepEqual(first, second);
});
