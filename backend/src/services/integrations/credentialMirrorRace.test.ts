import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { getUserProviderKey, listUserProviderKeys, resolveProviderEnvForDeploy } from './userProviderKeys.js';
import { getGitHubTokenFromStorage } from './githubTokenStore.js';

test('legacy downloads recheck authoritative revocation, rotation and outages before returning credentials', async () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const credentialRevision = '33333333-3333-4333-8333-333333333333';
  const encrypted = (value: string) => `enc:${Buffer.from(`fixture:${value}`).toString('base64')}`;
  let provider = 'apikey_openai';
  let scenario = 'legacy';
  let downloaded = false;
  let github = false;
  let legacyAuthority = false;
  const paths: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? '';
    paths.push(path);
    res.setHeader('Content-Type', 'application/json');
    if (path.startsWith('/storage/v1/object/list/')) {
      res.end(JSON.stringify([{ name: `vault-${provider}.json` }]));return;
    }
    if (path.startsWith('/storage/')) {
      downloaded = true;
      res.end(JSON.stringify({ access_token: github ? 'SYNTHETIC_OLD_GITHUB' : encrypted('SYNTHETIC_OLD_BYOK'),
        username:'old-account',repo_strategy:'manual',default_repo:'old-account/old-repository',
        metadata:{ provider:provider.replace('apikey_',''),env_var:'FIXTURE_KEY' } }));return;
    }
    assert.ok(path.startsWith('/rest/v1/'));
    const primary = path.startsWith('/rest/v1/github_integrations');
    const selectedAuthority=github?(legacyAuthority?!primary:primary):!primary;
    // A valid old grant must exist before download to exercise in-flight
    // disappearance/revocation, rather than failing the initial admission.
    if(github&&selectedAuthority&&!downloaded&&!scenario.startsWith('initial-')&&scenario!=='legacy'){
      res.end(JSON.stringify([{access_token:'SYNTHETIC_OLD_GITHUB'}]));return;
    }
    const applyAuthority = (github ? (legacyAuthority ? !primary : primary) : !primary) && (downloaded || scenario.startsWith('initial-'));
    if (applyAuthority && scenario.endsWith('outage')) {
      res.statusCode = 400;res.end(JSON.stringify({ code:'42P01',message:'SYNTHETIC_AUTHORITY_DIAGNOSTIC' }));return;
    }
    if (applyAuthority && scenario.endsWith('revoked')) {
      res.end(JSON.stringify([{ access_token:'',metadata:{revoked:true} }]));return;
    }
    if (applyAuthority && scenario.endsWith('rotated')) {
      res.end(JSON.stringify([{ access_token:github?'SYNTHETIC_NEW_GITHUB':encrypted('SYNTHETIC_NEW_BYOK'),
        user_id:user,provider,credential_revision:credentialRevision,
        metadata:{ provider:provider.replace('apikey_',''),env_var:'CURRENT_KEY' } }]));return;
    }
    if (applyAuthority && scenario.endsWith('same')) {
      res.end(JSON.stringify([{access_token:'SYNTHETIC_OLD_GITHUB'}]));return;
    }
    res.end('[]');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-only';
  const reset=(next:string)=>{scenario=next;downloaded=false;paths.length=0;};
  try {
    for(const selected of ['openai','custom_named_key','custom']) {
      provider=selected==='custom'?'apikey_custom_named_key':`apikey_${selected}`;
      for(const next of ['revoked','outage']) {
        reset(next);assert.equal(await getUserProviderKey(user,selected),null);
        assert.ok(downloaded,'Fixture must revoke or fail authority after an actual mirror download');
        assert.ok(paths.at(-1)?.startsWith('/rest/v1/user_integrations'));
      }
      reset('rotated');assert.equal(await getUserProviderKey(user,selected),'SYNTHETIC_NEW_BYOK');
      reset('legacy');assert.equal(await getUserProviderKey(user,selected),null,'An orphaned mirror is not a BYOK authority grant');
    }
    provider='apikey_openai';
    for(const next of ['revoked','outage']) {
      reset(next);assert.deepEqual(await listUserProviderKeys(user),[]);assert.ok(downloaded);
      reset(next);assert.deepEqual(await resolveProviderEnvForDeploy(user),{});assert.ok(downloaded);
    }
    reset('rotated');assert.deepEqual(await resolveProviderEnvForDeploy(user),{CURRENT_KEY:'SYNTHETIC_NEW_BYOK'});
    github=true;
    for(legacyAuthority of [false,true]) {
    for(const next of ['initial-revoked','initial-outage']) {
      reset(next);assert.equal(await getGitHubTokenFromStorage(user),null);assert.equal(downloaded,false);
    }
    for(const next of ['revoked','outage','rotated','initial-rotated','missing']) {
      reset(next);assert.equal(await getGitHubTokenFromStorage(user),null);assert.ok(downloaded);
    }
    reset('legacy');assert.equal(await getGitHubTokenFromStorage(user),null);assert.equal(downloaded,false);
    for(const next of ['same','initial-same']) {
      reset(next);assert.equal((await getGitHubTokenFromStorage(user))?.access_token,'SYNTHETIC_OLD_GITHUB');assert.ok(downloaded);
    }
    }
    for(const path of paths.filter(value=>value.startsWith('/rest/'))) {
      const parsed=new URL(path,'http://fixture.invalid');assert.equal(parsed.searchParams.get('user_id'),`eq.${user}`);
      if(parsed.pathname.endsWith('/user_integrations'))assert.equal(parsed.searchParams.get('provider'),'eq.github');
    }
  } finally {
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
