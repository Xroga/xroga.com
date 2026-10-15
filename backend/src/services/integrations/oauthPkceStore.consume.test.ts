import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { consumePkceSession } from './oauthPkceStore.js';
import { exchangeVercelOAuthCode } from './vercelAuth.js';
import { exchangeSupabaseOAuthCode } from './supabaseAuth.js';
import { completeCwsOAuth } from '../publish/chromeWebStore.js';

test('one-use OAuth admission fails closed on unavailable or malformed receipts and never uses Storage', async () => {
  const state='synthetic-state-0123456789';
  let body: unknown=null, status=200;
  const paths:string[]=[];
  const server=createServer(async(req,res)=>{
    paths.push(req.url!);
    let raw='';for await(const chunk of req)raw+=chunk;
    assert.deepEqual(JSON.parse(raw),{p_owner_id:'owner',p_provider:'vercel_oauth_pkce',p_state:state});
    res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  try {
    const valid={state,verifier:'synthetic-verifier',redirect_uri:'https://example.invalid/callback',created_at:new Date().toISOString()};
    for(body of [null,[],{}, {...valid,state:'wrong'}, {...valid,verifier:''},{...valid,nonce:{}}])
      assert.equal(await consumePkceSession('owner','vercel_oauth_pkce',state),null);
    status=400;body={message:'PRIVATE_CANARY'};
    assert.equal(await consumePkceSession('owner','vercel_oauth_pkce',state),null);
    status=200;body=valid;assert.deepEqual(await consumePkceSession('owner','vercel_oauth_pkce',state),valid);
    const count=paths.length;
    assert.equal(await consumePkceSession('owner','apikey_openai',state),null);
    assert.equal(await consumePkceSession('owner','vercel_oauth_pkce','short'),null);
    assert.equal(paths.length,count);assert.ok(paths.every(p=>p==='/rest/v1/rpc/consume_oauth_session'));
  } finally {
    for(const [key,value] of [['SUPABASE_URL',previous.url],['SUPABASE_SERVICE_ROLE_KEY',previous.key]])
      if(value===undefined)delete process.env[key!];else process.env[key!]=value;
    await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));
  }
});

test('all OAuth callback entry points reject invalid one-use state before external exchange',async()=>{
  const keys=['VERCEL_CLIENT_ID','VERCEL_CLIENT_SECRET','SUPABASE_OAUTH_CLIENT_ID','SUPABASE_OAUTH_CLIENT_SECRET'];
  const old=keys.map(k=>process.env[k]); keys.forEach(k=>process.env[k]='synthetic-only');
  const fetchOriginal=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('No outbound request authorized');};
  try {
    const opts={userId:'owner',code:'synthetic',state:'short',redirectUri:'https://example.invalid/callback'};
    await assert.rejects(exchangeVercelOAuthCode(opts),/Invalid or expired/);
    await assert.rejects(exchangeSupabaseOAuthCode(opts),/Invalid or expired/);
    assert.equal((await completeCwsOAuth(opts)).ok,false);assert.equal(calls,0);
  } finally {globalThis.fetch=fetchOriginal;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
