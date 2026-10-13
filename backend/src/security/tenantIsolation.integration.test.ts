/** Real HTTP + real Supabase client against disposable loopback fixtures, NOT an RLS/database proof. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { SignJWT } from 'jose';
import { authMiddleware } from '../middleware/auth.js';
import projectsRouter from '../routes/projects.js';
import swarmRouter from '../routes/swarm.js';
import { createRun, getRun, getRunAsync } from '../ai/runStore.js';
import { storeProjectFile } from '../services/storage/projectFiles.js';
import { createTenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile, type OwnedResourceKind } from './ownership.js';
import { TenantAccessError } from './tenantErrors.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OWN_PROJECT = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';
const JWT_SECRET = 'fixture-only-tenant-auth-key-not-a-real-secret-0000000';
const runId = randomUUID();
const previous = new Map<string,string|undefined>();
let database: Server, api: Server, databaseUrl = '', apiUrl = '', token = '';
const calls: {path:string;method:string;query:URLSearchParams;body:Record<string,unknown>}[] = [];

before(async () => {
  for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_JWT_SECRET','REQUIRE_REMOTE_AUTH_CHECK']) previous.set(key,process.env[key]);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  createRun(OTHER, 'Other owner fixture', runId);
  database = createServer((req,res) => {
    let raw = ''; req.on('data',chunk => {raw += String(chunk);});
    req.on('end',() => {
      const url = new URL(req.url ?? '/', databaseUrl);
      const body = raw ? JSON.parse(raw) : {};
      calls.push({path:url.pathname,method:req.method ?? 'GET',query:url.searchParams,body});
      res.setHeader('Content-Type','application/json');
      if (url.pathname.startsWith('/auth/')) {res.statusCode=401;res.end(JSON.stringify({message:'SIMULATED_REVOKED_TOKEN'}));return;}
      const single = String(req.headers.accept).includes('pgrst.object');
      if (url.pathname.endsWith('/profiles')) {res.end(JSON.stringify(single ? {id:OWNER} : [{id:OWNER}]));return;}
      if (url.pathname.endsWith('/user_token_usage')) {res.end(JSON.stringify(single ? {user_id:OWNER} : [{user_id:OWNER}]));return;}
      if (url.pathname.endsWith('/projects')) {
        if (req.method==='POST') {res.end(JSON.stringify({id:OWN_PROJECT,...body}));return;}
        const id = url.searchParams.get('id');
        const allowed = url.searchParams.get('user_id') === `eq.${OWNER}` && id !== `eq.${OTHER_PROJECT}`;
        const row = {id:OWN_PROJECT,name:'Owner fixture',user_id:OWNER};
        res.end(JSON.stringify(allowed ? (single ? row : [row]) : (single ? null : [])));return;
      }
      if (url.pathname.endsWith('/project_files')) {
        const allowed = url.searchParams.get('projects.user_id') === `eq.${OWNER}` && url.searchParams.get('id') === 'eq.own';
        res.end(JSON.stringify(allowed ? {id:'own'} : (single ? null : [])));return;
      }
      const allowed = url.searchParams.get('user_id') === `eq.${OWNER}` && ['eq.own'].includes(url.searchParams.get('id') ?? url.searchParams.get('session_id') ?? '');
      res.end(JSON.stringify(allowed ? {id:'own'} : (single ? null : [])));
    });
  });
  await new Promise<void>(resolve => database.listen(0,'127.0.0.1',resolve));
  databaseUrl = `http://127.0.0.1:${(database.address() as AddressInfo).port}`;
  process.env.SUPABASE_URL=databaseUrl;process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only-service-key';process.env.SUPABASE_JWT_SECRET=JWT_SECRET;delete process.env.REQUIRE_REMOTE_AUTH_CHECK;
  token = await new SignJWT({email:'fixture@example.test'}).setSubject(OWNER).setProtectedHeader({alg:'HS256'}).setIssuer(`${databaseUrl}/auth/v1`).setAudience('authenticated').setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET));
  const app = express();app.use(express.json());app.use('/api/projects',authMiddleware,projectsRouter);app.use('/api/swarm',authMiddleware,swarmRouter);
  api = createServer(app);await new Promise<void>(resolve => api.listen(0,'127.0.0.1',resolve));
  apiUrl=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});
after(async () => {
  await Promise.all([api,database].map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
  for(const[key,value]of previous)value===undefined?delete process.env[key]:process.env[key]=value;
});
const headers = () => ({Authorization:`Bearer ${token}`,'Content-Type':'application/json'});

test('anonymous protected request and body-supplied identity fail closed', async () => {
  const response = await fetch(`${apiUrl}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:OWNER,tenantContext:{userId:OWNER},name:'Fake',type:'app'})});
  assert.equal(response.status,401);
});
test('own project reads work; foreign project/files are non-enumerating and files are never queried', async () => {
  const own = await fetch(`${apiUrl}/api/projects/${OWN_PROJECT}`,{headers:headers()});assert.equal(own.status,200);assert.equal((await own.json() as {id:string}).id,OWN_PROJECT);
  const before = calls.filter(call=>call.path.endsWith('/project_files')).length;
  const foreign = await fetch(`${apiUrl}/api/projects/${OTHER_PROJECT}/files`,{headers:headers()});assert.equal(foreign.status,404);
  assert.equal(calls.filter(call=>call.path.endsWith('/project_files')).length,before);
});
test('project creation ignores malicious owner fields and binds server identity', async () => {
  const response=await fetch(`${apiUrl}/api/projects`,{method:'POST',headers:headers(),body:JSON.stringify({name:'Owner fixture',type:'app',userId:OTHER,user_id:OTHER,tenant_id:OTHER})});
  assert.equal(response.status,201);
  const insertion=calls.filter(call=>call.path.endsWith('/projects')&&call.method==='POST').at(-1);assert.equal(insertion?.body.user_id,OWNER);
});
test('foreign cached conversation cannot mutate run history; unknown and foreign read the same safe state', async () => {
  const before=JSON.stringify(getRun(runId));
  const denied=await fetch(`${apiUrl}/api/swarm/runs/${runId}/conversation`,{method:'POST',headers:headers(),body:JSON.stringify({messages:[{role:'user',content:'Unauthorized overwrite'}]})});
  assert.equal(denied.status,404);assert.equal(JSON.stringify(getRun(runId)),before);
  assert.equal(await getRunAsync(runId,OWNER),null);
  assert.equal((await getRunAsync(runId,OTHER))?.userId,OTHER);
  for(const id of [runId,randomUUID()]) {const response=await fetch(`${apiUrl}/api/swarm/runs/${id}`,{headers:headers()});assert.equal(response.status,200);const body=await response.json() as {status:string;prompt:string};assert.equal(body.status,'unknown');assert.equal(body.prompt,'');}
});
test('foreign run cancellation cannot stop the owner run', async () => {
  const response=await fetch(`${apiUrl}/api/swarm/runs/${runId}/cancel`,{method:'POST',headers:headers()});assert.equal(response.status,404);assert.equal(getRun(runId)?.status,'running');
});
test('hot run ID collision cannot replace another owner record', () => {
  const before=JSON.stringify(getRun(runId));
  assert.throws(()=>createRun(OWNER,'Attempted collision',runId),/Run not found/);
  assert.equal(JSON.stringify(getRun(runId)),before);
});
test('foreign project file write is blocked before any storage side effect', async () => {
  await assert.rejects(storeProjectFile(OWNER,OTHER_PROJECT,'denied.txt','Never uploaded','text/plain','other'),(error:unknown)=>error instanceof TenantAccessError&&error.status===404);
  assert.equal(calls.filter(call=>call.path.endsWith('/project_files')&&call.method==='POST').length,0);
});
test('provider/run/runtime-session/cost/chat and joined file owner predicates deny second-tenant references', async () => {
  const context=createTenantContext({userId:OWNER,via:'local_jwt'});
  for(const kind of ['chat','provider_connection','run','runtime_session','cost_record'] as OwnedResourceKind[]) {
    await requireOwnedResource(context,kind,'own');
    await assert.rejects(requireOwnedResource(context,kind,'foreign'),(error:unknown)=>error instanceof TenantAccessError&&error.status===404);
  }
  await requireOwnedFile(context,'own');
  await assert.rejects(requireOwnedFile(context,'foreign'),(error:unknown)=>error instanceof TenantAccessError&&error.status===404);
});
test('missing auth configuration returns no deployment, key name or raw provider detail', async () => {
  delete process.env.SUPABASE_URL;
  try {const response=await fetch(`${apiUrl}/api/projects`,{headers:headers()});assert.equal(response.status,503);const text=await response.text();assert.doesNotMatch(text,/SUPABASE|Fly|SIMULATED|stack/i);assert.match(text,/Retry/);}
  finally {process.env.SUPABASE_URL=databaseUrl;}
});
test('wrong or absent JWT audience cannot authenticate via the old signature-only fallback', async () => {
  for(const audience of [undefined,'anon']) {
    let signer=new SignJWT({email:'fixture@example.test'}).setSubject(OWNER).setProtectedHeader({alg:'HS256'}).setIssuer(`${databaseUrl}/auth/v1`).setExpirationTime('1h');
    if(audience)signer=signer.setAudience(audience);
    const invalid=await signer.sign(new TextEncoder().encode(JWT_SECRET));
    const response=await fetch(`${apiUrl}/api/projects`,{headers:{Authorization:`Bearer ${invalid}`}});assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/SIMULATED|SUPABASE/);
  }
});
