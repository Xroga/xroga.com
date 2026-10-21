import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {getGitHubTokenFromStorage} from './githubTokenStore.js';
import {getUserProviderKey} from './userProviderKeys.js';

function fixture(t:TestContext){
  const owner='11111111-1111-4111-8111-111111111111';
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=names.map(n=>process.env[n]);
  process.env.SUPABASE_URL='https://orphan-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  t.after(()=>names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];}));
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
    const url=new URL(String(input instanceof Request?input.url:input));calls.push(url.pathname);
    assert.equal(url.origin,'https://orphan-fixture.invalid');
    if(url.pathname.startsWith('/rest/v1/')){
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);return Response.json([]);
    }
    assert.ok(url.pathname.includes(`/xroga-github-tokens/${owner}/`));
    return Response.json(url.pathname.endsWith('/github.json')?{access_token:'SYNTHETIC_ORPHAN_GITHUB',username:'fixture',provider_user_id:'fixture',repo_strategy:'auto',default_repo:null,updated_at:new Date().toISOString()}:
      {access_token:'enc:'+Buffer.from('fixture:SYNTHETIC_ORPHAN_BYOK').toString('base64'),metadata:{provider:'openai',env_var:'OPENAI_API_KEY'}});
  });
  return{owner,calls};
}
test('GitHub private mirror cannot grant access when both canonical authority rows are absent',async t=>{
  const f=fixture(t);assert.equal(await getGitHubTokenFromStorage(f.owner),null);
  assert.ok(f.calls.every(p=>p.startsWith('/rest/v1/')),'Missing authority denies before a GitHub mirror download');
});
test('BYOK private mirror cannot grant a key when canonical authority stays absent',async t=>{
  const f=fixture(t);assert.equal(await getUserProviderKey(f.owner,'openai'),null);
});
