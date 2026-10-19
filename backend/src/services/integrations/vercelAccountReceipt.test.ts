import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {refreshVercelOAuthToken} from './vercelAuth.js';

test('Vercel native refresh retains the exact canonical provider account with its original revision',async()=>{
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,id:process.env.VERCEL_CLIENT_ID,secret:process.env.VERCEL_CLIENT_SECRET};
  process.env.SUPABASE_URL='http://127.0.0.1:49238';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.VERCEL_CLIENT_ID='synthetic-client';process.env.VERCEL_CLIENT_SECRET='synthetic-secret';
  const original=globalThis.fetch,owner=randomUUID(),revision=randomUUID(),account='synthetic-current-vercel-account';
  let saved:Record<string,unknown>|undefined;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    if(url.origin==='https://api.vercel.com'){
      assert.equal(url.pathname,'/login/oauth/token');assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'),'synthetic-current-refresh');
      return Response.json({access_token:'synthetic-new-access',refresh_token:'synthetic-new-refresh',expires_in:3600});
    }
    assert.equal(url.origin,process.env.SUPABASE_URL);
    if(url.pathname==='/rest/v1/user_integrations'){
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);assert.equal(url.searchParams.get('provider'),'eq.vercel');
      return Response.json([{user_id:owner,provider:'vercel',provider_user_id:account,access_token:'synthetic-old-access',refresh_token:'synthetic-current-refresh',credential_revision:revision,metadata:{username:'synthetic-user'}}]);
    }
    assert.equal(url.pathname,'/rest/v1/rpc/save_oauth_connection');saved=JSON.parse(String(init?.body));return Response.json(true);
  };
  try{
    assert.equal(await refreshVercelOAuthToken(owner,'synthetic-current-refresh','synthetic-user'),'synthetic-new-access');
    assert.equal(saved?.p_owner_id,owner);assert.equal(saved?.p_provider,'vercel');assert.equal(saved?.p_revision,revision);
    assert.equal(saved?.p_expected_refresh_token,'synthetic-current-refresh');assert.equal(saved?.p_provider_user_id,account);
  }finally{
    globalThis.fetch=original;
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
    if(previous.id===undefined)delete process.env.VERCEL_CLIENT_ID;else process.env.VERCEL_CLIENT_ID=previous.id;
    if(previous.secret===undefined)delete process.env.VERCEL_CLIENT_SECRET;else process.env.VERCEL_CLIENT_SECRET=previous.secret;
  }
});
