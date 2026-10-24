import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import express from 'express';
import router from './supabaseOAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

async function listen(server:Server) {
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  return `http://127.0.0.1:${address.port}`;
}
const close=(server:Server)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));

test('Supabase disconnect reports incomplete revocation safely and continues independent cleanup',async()=>{
  let mode='success';
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  const database=createServer((req,res)=>{
    let raw='';req.on('data',chunk=>{raw+=chunk;});req.on('end',()=>{
      const path=req.url??'',body=raw?JSON.parse(raw):{};calls.push({path,body});
      const failure=(mode==='oauth'&&path.startsWith('/rest/v1/user_integrations'))
        ||(mode==='revoke'&&body.p_provider==='apikey_supabase_url')
        ||(mode==='cleanup'&&path.startsWith('/storage/')&&JSON.stringify(body).includes('vault-apikey_supabase_url'));
      res.writeHead(failure?503:200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(failure?{message:'SYNTHETIC_SECRET_FAILURE_CANARY'}:path.includes('/rpc/')?true:[]));
    });
  });
  const owner='11111111-1111-4111-8111-111111111111';
  const app=express();app.use(express.json());
  app.use((req:AuthRequest,_res,next)=>{
    req.userId=owner;
    const context=createTenantContext({userId:owner,via:'remote_getuser'});
    req.tenantContext=mode==='unissued'?{...context}:context;
    next();
  });
  app.use(router);const api=createServer(app);
  const envNames=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_DB_PASSWORD'];
  const before=new Map(envNames.map(name=>[name,process.env[name]]));
  try {
    for(const name of envNames)delete process.env[name];
    process.env.SUPABASE_URL=await listen(database);process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-only';
    const origin=await listen(api);
    for(mode of ['revoke','cleanup','oauth','success']) {
      calls.length=0;
      const response=await fetch(`${origin}/disconnect`,{method:'DELETE'});
      const body=await response.json() as {ok:boolean;error?:string};
      assert.equal(response.status,mode==='success'?200:503);
      assert.equal(body.ok,mode==='success');
      assert.ok(!JSON.stringify(body).includes('SYNTHETIC_SECRET_FAILURE_CANARY'));
      const revokes=calls.filter(call=>call.path.endsWith('/revoke_provider_key'));
      assert.deepEqual(revokes.map(call=>call.body.p_provider),['apikey_supabase_url','apikey_supabase_anon','apikey_supabase_service','apikey_supabase','apikey_supabase_pat','apikey_supabase_db_password']);
      assert.ok(revokes.every(call=>call.body.p_owner_id===owner));
      assert.deepEqual(calls.filter(call=>call.path.startsWith('/rest/v1/user_integrations'))
        .map(call=>call.body.provider).sort(),['supabase_oauth','supabase_oauth_pkce']);
    }
    mode='unissued';calls.length=0;
    assert.equal((await fetch(`${origin}/disconnect`,{method:'DELETE'})).status,401);
    assert.equal(calls.length,0,'Unissued context cannot revoke OAuth or any vault key');
  } finally {
    for(const [name,value]of before){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await Promise.all([close(api),close(database)]);
  }
});
