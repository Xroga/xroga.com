import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStagingManifest, assertStagingEnvironment, deploymentPlan } from './staging-preflight.mjs';
import { requireR2TestConfiguration, inspectPrivateBucket, exercisePrivateCanary, runR2Check } from './r2-private-check.mjs';
const fixture = () => ({ version:1,environment:'staging',sourceSha:'a'.repeat(40),dataPolicy:'synthetic_only',ownerReview:{productionResourceInventoryComplete:true,productionBucketNames:['xroga-assets'],isolationEvidence:'https://example.invalid/operator-review'},api:{app:'xroga-api-staging',origin:'https://xroga-api-staging.fly.dev'},web:{projectId:'prj_FixtureOnly',origin:'https://xroga-staging-fixture.vercel.app'},auth:{app:'xroga-supabase-staging',origin:'https://xroga-supabase-staging.fly.dev',databaseMode:'isolated_self_hosted'},r2:{accountId:'b'.repeat(32),bucket:'xroga-security-staging',publicAccess:false,customDomains:[]},services:{billing:'disabled',externalProviders:'disabled',webhooks:'disabled',sandbox:'disabled'} });
const metadata = { bucket:'xroga-security-staging',managedDomain:`pub-${'c'.repeat(32)}.r2.dev`,publicAccess:false,customDomains:0 };
test('staging proposal deliberately fails closed until resources and isolation are reviewed',()=>{
  const example=JSON.parse(readFileSync(new URL('../../deploy/staging/manifest.example.json',import.meta.url)));
  assert.throws(()=>validateStagingManifest(example));
  assert.equal(deploymentPlan(fixture()).status,'PLAN_ONLY_NOT_DEPLOYED');
  assert.deepEqual(deploymentPlan(fixture()).api.args,['deploy','.','--config','deploy/staging/fly.api.toml','--app','xroga-api-staging']);
});
test('production identities, unsigned isolation and public storage cannot become staging',()=>{
  for(const change of [m=>m.environment='production',m=>m.dataPolicy='customer_copy',m=>m.sourceSha='main',m=>m.ownerReview.productionResourceInventoryComplete=false,m=>m.ownerReview.productionBucketNames=[],m=>m.ownerReview.productionBucketNames.push(m.r2.bucket),m=>m.api.app='xroga-api',m=>m.api.origin='https://xroga-api.fly.dev',m=>m.web.projectId='prj_OFS4CCMNe4dPFDpgdOtVUszg8vMv',m=>m.web.origin='https://xroga.com',m=>m.auth.origin='https://nzenxdfumxrnsmybazmo.supabase.co',m=>m.r2.bucket='xroga-assets',m=>m.r2.publicAccess=true,m=>m.r2.customDomains=['files.example.invalid'],m=>m.services.billing='enabled']) {
    const m=fixture();change(m);assert.throws(()=>validateStagingManifest(m));
  }
});
test('test tools reject inherited production-capable secrets even with approved test config',()=>{
  for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','CLOUDFLARE_R2_SECRET_KEY','FLY_API_TOKEN','WHOP_API_KEY','GITHUB_TOKEN','GH_TOKEN','VERCEL_TOKEN','OPENROUTER_API_KEY']) assert.throws(()=>assertStagingEnvironment({[key]:'never-print-this'}));
  assertStagingEnvironment({PATH:'fixture',XB01_R2_TEST_SECRET_KEY:'fixture'});
});
test('missing configuration, wrong SHA and unknown test modes fail before any network call',async()=>{
  let calls=0;const network=()=>{calls++;throw new Error('must not reach network');};
  for(const env of [{},{XB01_R2_METADATA_READ_TOKEN:'fixture',XB01_STAGING_TEST_APPROVAL_SHA:'wrong'}]) await assert.rejects(runR2Check(fixture(),env,'canary',network));
  assert.throws(()=>requireR2TestConfiguration(fixture(),{XB01_R2_METADATA_READ_TOKEN:'fixture'},'deploy'));
  assert.equal(calls,0);
});
test('bucket inspection performs only fixed-origin GETs and requires explicit private metadata',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,errors:[],result:url.endsWith('/domains/managed')?{enabled:false,domain:metadata.managedDomain}:url.endsWith('/domains/custom')?{domains:[]}:{name:metadata.bucket}}));};
  assert.deepEqual(await inspectPrivateBucket(fixture(),'fixture-token',fetcher),metadata);
  assert.equal(calls.length,3);for(const call of calls){assert.match(call.url,/^https:\/\/api\.cloudflare\.com\//);assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');}
  for(const result of [{enabled:true,domain:metadata.managedDomain},{domain:metadata.managedDomain},{enabled:false,domain:'https://localhost/'}]) await assert.rejects(inspectPrivateBucket(fixture(),'fixture',async url=>new Response(JSON.stringify({success:true,result:url.endsWith('/domains/managed')?result:{name:metadata.bucket}}))));
});
function adapter() {
  const objects=new Map(),calls=[];
  return {objects,calls,async put(key,body){assert.match(key,/^xb01-canary\/[a-f0-9-]+\/synthetic\.txt$/);assert.equal(objects.has(key),false);objects.set(key,body);calls.push(['put',key]);},async get(key){return objects.get(key);},async remove(key){calls.push(['delete',key]);objects.delete(key);},async exists(key){return objects.has(key);}};
}
test('synthetic canary verifies bytes and cleans exactly its own object; no app-auth claim',async()=>{
  const a=adapter();a.objects.set('unrelated-object',Buffer.from('untouched'));
  const result=await exercisePrivateCanary(fixture(),metadata,a,async()=>new Response('denied',{status:403}));
  assert.equal(result.status,'PASS_BUCKET_CANARY_NOT_APPLICATION_AUTHORIZATION');assert.match(result.crossTenantApplicationRead,/^BLOCKED/);
  assert.equal(a.objects.size,1);assert.equal(a.calls[0][1],a.calls[1][1]);assert.equal(a.objects.get('unrelated-object').toString(),'untouched');
});
test('anonymous success or outage cannot count as denial, and failed test still cleans its canary',async()=>{
  for(const status of [200,302,500]){const a=adapter();await assert.rejects(exercisePrivateCanary(fixture(),metadata,a,async()=>new Response('untrusted',{status})));assert.equal(a.objects.size,0);}
});
test('cleanup failure is a failing test, never an ignored warning',async()=>{
  const a=adapter();a.remove=async()=>{throw new Error('fixture cleanup failure');};
  await assert.rejects(exercisePrivateCanary(fixture(),metadata,a,async()=>new Response('denied',{status:404})),/cleanup failure/);
});
