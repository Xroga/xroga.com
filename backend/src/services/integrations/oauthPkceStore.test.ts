import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { ensurePrivateOAuthBucket } from './credentialStorageBucket.js';
import { createServer } from 'node:http';
import { loadProviderToken } from './oauthPkceStore.js';
import * as oauthStore from './oauthPkceStore.js';

test('OAuth authority failure or existing rejected state never reads a stale Storage mirror', async () => {
  let mode = 'outage';
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url ?? '');
    res.writeHead(mode === 'outage' ? 400 : 200, { 'Content-Type': 'application/json' });
    if (mode === 'outage') res.end(JSON.stringify({ message: 'SYNTHETIC_PRIVATE_ERROR', code: '42P01' }));
    else if (mode === 'empty') res.end(JSON.stringify([{ access_token: '', metadata: {} }]));
    else if (mode === 'revoked') res.end(JSON.stringify([{ access_token: 'old', metadata: { revoked: true } }]));
    else res.end(JSON.stringify([{ access_token: 'current', metadata: { state: 'new-state' } }]));
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (mode of ['outage', 'empty', 'revoked']) {
      assert.equal(await loadProviderToken('fixture', 'fixture_provider'), null);
    }
    mode = 'mismatch';
    assert.equal((await loadProviderToken('fixture', 'fixture_provider'))?.access_token, 'current');
    assert.equal(paths.length, 4);
    assert.ok(paths.every(path => path.startsWith('/rest/v1/user_integrations')));
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('the unused replayable legacy PKCE loader is no longer exported',()=>{
  assert.equal('loadPkceSession' in oauthStore,false);
  assert.equal(typeof oauthStore.consumePkceSession,'function');
});

// Preserve the pre-existing contract assertions; admission tests extend them.
describe('oauth pkce contract', () => {
  it('treats schema-cache messages as missing-table', () => {
    const isMissing = (message: string) =>
      /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(message);
    assert.equal(
      isMissing(`Could not find the table 'public.user_integrations' in the schema cache`),
      true,
    );
    assert.equal(isMissing('duplicate key value'), false);
  });
  it('builds storage paths per user and provider', () => {
    const pkcePath = (userId: string, provider: string) => `${userId}/pkce-${provider}.json`;
    const tokenPath = (userId: string, provider: string) => `${userId}/oauth-${provider}.json`;
    assert.equal(pkcePath('u1', 'vercel_oauth_pkce'), 'u1/pkce-vercel_oauth_pkce.json');
    assert.equal(tokenPath('u1', 'supabase_oauth'), 'u1/oauth-supabase_oauth.json');
  });
});

const bucket={id:'xroga-github-tokens',name:'xroga-github-tokens',public:false};
// Actual Supabase SDK with isolated transport. These are admission fixtures,
// NOT real Storage/RLS, staged OAuth or encryption acceptance evidence.
function fixture(replies:{status?:number;body:unknown}[]) {
  const requests:{method:string;path:string;body:unknown}[]=[];
  const client=createClient('http://127.0.0.1:1','fixture-only',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(String(input));
      assert.equal(url.origin,'http://127.0.0.1:1');
      requests.push({method:init?.method??'GET',path:url.pathname,body:init?.body?JSON.parse(String(init.body)):null});
      const reply=replies.shift();assert.ok(reply,'Unexpected additional storage operation');
      return new Response(JSON.stringify(reply.body),{status:reply.status??200,headers:{'Content-Type':'application/json'}});
    }},
  });
  return {client,requests};
}

for(const [label,body,expected] of [
  ['private',[bucket],true],['public',[{...bucket,public:true}],false],
  ['unknown privacy',[{id:bucket.id,name:bucket.name}],false],['malformed catalogue',null,false],
] as const){
  test(`existing OAuth bucket ${label} is admitted only when explicitly private`,async()=>{
    const {client,requests}=fixture([{body}]);
    assert.equal(await ensurePrivateOAuthBucket(client),expected);
    assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
  });
}

test('unavailable bucket catalogue fails closed without creating or changing resources',async()=>{
  const {client,requests}=fixture([{status:500,body:{message:'PRIVATE_DIAGNOSTIC_CANARY'}}]);
  assert.equal(await ensurePrivateOAuthBucket(client),false);assert.equal(requests.length,1);
});

for(const duplicate of [false,true])for(const isPrivate of [false,true]){
  test(`OAuth bucket ${duplicate?'concurrent duplicate':'creation'} verifies private=${isPrivate} postcondition`,async()=>{
    const {client,requests}=fixture([{body:[]},
      {status:duplicate?409:200,body:duplicate?{message:'Bucket already exists'}:{name:bucket.name}},
      {body:[{...bucket,public:!isPrivate}]}]);
    assert.equal(await ensurePrivateOAuthBucket(client),isPrivate);
    assert.equal(requests.length,3);
    assert.equal(requests[1].method,'POST');assert.equal((requests[1].body as {public:boolean}).public,false);
    assert.equal((requests[1].body as {file_size_limit:number}).file_size_limit,65536);
    assert.ok(requests.every(request=>request.path==='/storage/v1/bucket'));
  });
}
