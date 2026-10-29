import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {shipChromeExtensionZip, shipElectronPortableZip} from './nonWebShip.js';
import {nativeReleaseFixture} from './__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction, cancelBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import {actionPlanDigest} from '../integrations/businessAction.js';
import {resetCredentialVaultRuntimeForTests} from '../integrations/credentialVaultRuntime.js';
import {inspectNativeArtifactSource} from './nativeArtifact.js';

test('native artifact preparation cannot publish or delete before exact durable approval', async t => {
  const owner = randomUUID(), context = createTenantContext({userId: owner, via: 'remote_getuser'});
  const env = {NODE_ENV: 'test', SUPABASE_URL: 'https://native-artifact-fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only', XROGA_TEST_CREDENTIAL_KEK: Buffer.alloc(32, 12).toString('base64url')};
  const old = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]])); Object.assign(process.env, env);
  resetCredentialVaultRuntimeForTests();
  t.after(() => {resetCredentialVaultRuntimeForTests();for (const [name, value] of Object.entries(old)) if (value === undefined) delete process.env[name]; else process.env[name] = value;});
  const files = [{path: 'manifest.json', content: '{"manifest_version":3,"name":"Synthetic fixture","version":"1.0.0"}'}, {path: 'package.json', content: '{"name":"synthetic-fixture"}'}, {path: 'main.js', content: 'console.log("owned fixture")'}];
  let writes = 0, kind = 'chrome', mode='ok', note='initial', providerReads=0, releaseExists=true, oldAsset=false;
  const fixture=nativeReleaseFixture(owner);
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)), method = init?.method ?? 'GET';
    if (url.origin === env.SUPABASE_URL) {
      const handled=await fixture.database(url,init);if(handled)return handled;
      if(mode==='connection-at-audit'&&fixture.audits>0)note='changed';
      return Response.json({user_id: owner, provider: 'github', access_token: 'synthetic-artifact-provider-token', credential_revision: '11111111-1111-4111-8111-111111111111', metadata: {note}});
    }
    providerReads++;
    if (method !== 'GET') writes++;
    assert.ok(['api.github.com', 'uploads.github.com'].includes(url.hostname));
    const tag = kind === 'chrome' ? 'v1.0.0-extension' : 'v1.0.0-portable', name = kind === 'chrome' ? 'extension.zip' : 'desktop.zip';
    if(method!=='GET'){assert.ok(fixture.row?.effect_started_at);assert.ok(fixture.audits>0);if(mode==='provider403'||mode==='provider503')return Response.json({message:'synthetic-artifact-provider-token'},{status:mode==='provider403'?403:503});if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://foreign.invalid'}});}
    if (url.hostname === 'uploads.github.com') return Response.json({id: 202, name, state: 'uploaded', size: (init?.body as Buffer).length, browser_download_url: mode==='wrong-receipt'?'https://foreign.invalid/source.zip':`https://github.com/Owner/repo/releases/download/${tag}/${name}`});
    if (url.pathname.endsWith('/assets')) return Response.json(oldAsset||mode==='asset-replaced'?[{id:88,name}]:[]);
    if(method==='DELETE')return new Response(null,{status:204});
    if(url.pathname.endsWith('/releases')&&method==='POST')releaseExists=true;
    if(!releaseExists)return Response.json({message:'missing'},{status:404});
    const id=mode==='release-replaced'?102:101;
    return Response.json({id, tag_name: tag, html_url: `https://github.com/Owner/repo/releases/tag/${tag}`, upload_url: `https://uploads.github.com/repos/Owner/repo/releases/${id}/assets{?name,label}`});
  });
  for (kind of ['chrome', 'electron']) await t.test(kind, async () => {
    writes = 0;
    const opts = {userId: owner, tenantContext: context, projectId: fixture.project, repoFullName: 'Owner/repo', files};
    const result = kind === 'chrome' ? await shipChromeExtensionZip(opts) : await shipElectronPortableZip(opts);
    assert.equal(writes, 0, 'Preparing an artifact must not create a public release, delete an asset or upload source');
    assert.equal(result.ok, false, 'Preparation is not a completed publication');
    assert.equal((result as {needsConfirmation?: boolean}).needsConfirmation, true);
  });
  for(kind of ['chrome','electron'])for(const scenario of ['ok','new-release','replace-asset','restart','jsonb-order','concurrent','cancelled','foreign-project','file-changed','file-at-audit','audit-fail','cancel-at-audit','cancel-at-claim','cancel-after-claim','expire-after-claim','connection-at-audit','connection-before-confirm','release-replaced','asset-replaced','changed-source','changed-target','changed-expiry','changed-proof','provider403','provider503','redirect','wrong-receipt','ok-after-outage'])await t.test(kind+' '+scenario,async()=>{
    mode='ok';note='initial';writes=0;fixture.mode='ok';fixture.audits=0;fixture.projectOwner=owner;releaseExists=scenario!=='new-release';oldAsset=scenario==='replace-asset';
    const opts={userId:owner,tenantContext:context,projectId:fixture.project,repoFullName:'Owner/repo',files};
    const prepared=kind==='chrome'?await shipChromeExtensionZip(opts):await shipElectronPortableZip(opts);
    assert.equal(prepared.needsConfirmation,true);assert.equal(writes,0);assert.ok(prepared.confirmation);assert.ok(fixture.row);
    assert.doesNotMatch(JSON.stringify(prepared.confirmation),/synthetic-artifact-provider-token|console\.log|nativeReleaseProof/);
    mode=scenario;fixture.mode=scenario;
    if(scenario==='restart')resetCredentialVaultRuntimeForTests();
    if(scenario==='connection-before-confirm')note='changed';
    if(scenario==='cancelled')await cancelBusinessActionConfirmation(owner,fixture.row.id);
    if(scenario==='foreign-project')fixture.projectOwner=randomUUID();
    const ref=fixture.row.plan.arguments.artifact as {fileId:string};
    if(scenario==='file-changed')fixture.files.get(ref.fileId)!.delivery_version=2;
    if(['changed-source','changed-target','changed-expiry','changed-proof'].includes(scenario)){
      if(scenario==='changed-source')(fixture.row.plan.arguments.artifact as {zipSha256:string}).zipSha256='a'.repeat(64);
      if(scenario==='changed-target')fixture.row.plan.arguments.tag='v-unapproved';
      if(scenario==='changed-expiry')fixture.row.plan.authority!.expiresAt=new Date(Date.now()+14*60000).toISOString();
      if(scenario==='changed-proof')fixture.row.plan.scopeRequirements={nativeReleaseProof:'vault:v3:unissued'};
      const{planDigest:_,...unsigned}=fixture.row.plan;fixture.row.plan.planDigest=actionPlanDigest(unsigned);fixture.row.plan_digest=fixture.row.plan.planDigest;
      fixture.row.expires_at=fixture.row.plan.authority!.expiresAt;
    }
    if(scenario==='jsonb-order'){
      const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
      fixture.row.plan=reorder(fixture.row.plan) as typeof fixture.row.plan;
    }
    const before=providerReads,confirm=()=>confirmBusinessAction(context,prepared.confirmation!.id);
    if(scenario==='concurrent'){const results=await Promise.allSettled([confirm(),confirm()]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(writes,1);return;}
    if(['ok','new-release','replace-asset','restart','jsonb-order','ok-after-outage'].includes(scenario)){
      const executed=await confirm();const result=JSON.parse(executed.execution.resultText);assert.equal(result.ok,true);assert.equal(fixture.row.status,'consumed');assert.equal(writes,['new-release','replace-asset'].includes(scenario)?2:1);
    }else{
      await assert.rejects(confirm());assert.equal(writes,['provider403','provider503','redirect','wrong-receipt'].includes(scenario)?1:0);
      if(scenario.startsWith('changed-'))assert.equal(providerReads,before,'unissued source/target/scope must fail before provider metadata');
    }
    const count=writes;await assert.rejects(confirm());assert.equal(writes,count,'consumed, revoked and uncertain approval cannot retry');
  });
});

test('native source inspection rejects extraction aliases and credential files before compression',()=>{
  for(const path of ['../secret.txt','/etc/passwd','C:/secret.txt','x\\secret.txt','foo//bar','foo/CON.txt','foo/trailing.','.git/config','.ssh/config','.aws/config','.env','.env.local','.npmrc','credentials.json','secrets.yaml','private.pem'])assert.throws(()=>inspectNativeArtifactSource([{path,content:'ordinary fixture'}]),path);
  assert.throws(()=>inspectNativeArtifactSource([{path:'File.txt',content:'one'},{path:'file.txt',content:'two'}]));
  const held='opaque-private-provider-fixture';
  for(const content of [held,encodeURIComponent(held),Buffer.from(held).toString('base64'),Buffer.from(held).toString('base64url')])assert.throws(()=>inspectNativeArtifactSource([{path:'source.js',content}], [held]));
  assert.deepEqual(inspectNativeArtifactSource([{path:'.env.example',content:'EXAMPLE_VALUE='},{path:'src/credentials.tsx',content:'export const settings = {};'}]),[{path:'.env.example',content:'EXAMPLE_VALUE='},{path:'src/credentials.tsx',content:'export const settings = {};'}]);
});
