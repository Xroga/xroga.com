import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canReadAdminOperations, adminMiddleware } from './admin.js';
import type { AuthRequest } from './auth.js';
import type { Response } from 'express';

test('operational evidence keeps current admin/owner policy and denies ordinary roles', () => {
  for (const role of ['guest', 'member', 'moderator', 'founder', '', null, undefined]) {
    assert.equal(canReadAdminOperations(role), false, String(role));
  }
  assert.equal(canReadAdminOperations('admin'), true);
  assert.equal(canReadAdminOperations('owner'), true);
});

test('readiness route enforces admin middleware before querying operational evidence', async () => {
  const source = await readFile(new URL('../routes/operations.ts', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(source, /router\.get\('\/readiness',\s*adminMiddleware,/);
  assert.match(indexSource, /app\.use\('\/api\/operations',\s*authMiddleware,/);
});

test('administrative middleware denies a legacy userId or deserialized context before role lookup',async()=>{
  for(const tenantContext of [undefined,{userId:'11111111-1111-4111-8111-111111111111'}]) {
    let status=0,body:unknown,nextCalled=false;
    const response={status(code:number){status=code;return this;},json(value:unknown){body=value;}} as Response;
    await adminMiddleware({userId:'11111111-1111-4111-8111-111111111111',tenantContext} as AuthRequest,response,()=>{nextCalled=true;});
    assert.equal(status,401);assert.deepEqual(body,{error:'Unauthorized'});assert.equal(nextCalled,false);
  }
});
