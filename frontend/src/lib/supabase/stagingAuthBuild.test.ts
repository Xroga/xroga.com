import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthBuildConfiguration,productionAuthProject } from './authBuildRealm.mjs';
const manifest={version:1,environment:'staging',sourceSha:'a'.repeat(40),dataPolicy:'synthetic_only',ownerReview:{productionResourceInventoryComplete:true,productionBucketNames:['xroga-assets'],isolationEvidence:'https://example.invalid/review-fixture'},api:{app:'xroga-api-staging',origin:'https://xroga-api-staging.fly.dev'},web:{projectId:'prj_FixtureOnly',origin:'https://xroga-staging-fixture.vercel.app'},auth:{app:'xroga-supabase-staging',origin:'https://xroga-supabase-staging.fly.dev',databaseMode:'isolated_self_hosted'},r2:{accountId:'b'.repeat(32),bucket:'xroga-security-staging',publicAccess:false,customDomains:[]},services:{billing:'disabled',externalProviders:'disabled',webhooks:'disabled',sandbox:'disabled'}};
const staging={CI:'true',VERCEL_ENV:'preview',XROGA_STAGING_AUTH_BUILD:'1',XROGA_DEPLOYMENT_ENVIRONMENT:'staging',XROGA_RELEASE_SHA:manifest.sourceSha,SUPABASE_URL:manifest.auth.origin,NEXT_PUBLIC_SUPABASE_URL:manifest.auth.origin,NEXT_PUBLIC_API_URL:manifest.api.origin,FRONTEND_URL:manifest.web.origin};
test('reviewed staging build selects isolated origin, not a role or founder bypass',()=>{
  assert.deepEqual(resolveAuthBuildConfiguration(staging,manifest),{projectRef:'self-hosted-staging',url:manifest.auth.origin});
});
test('production pin ignores unapproved public URL inputs and default staging flags',()=>{
  assert.deepEqual(resolveAuthBuildConfiguration({NEXT_PUBLIC_XROGA_AUTH_BASE_URL:manifest.auth.origin,NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF:'self-hosted-staging'}),{projectRef:productionAuthProject,url:`https://${productionAuthProject}.supabase.co`});
});
test('staging admission denies production, unknown realm, mismatched revision/API/Auth and unsigned review',()=>{
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_ENV:undefined},{CI:'false'},{XROGA_DEPLOYMENT_ENVIRONMENT:'production'},{XROGA_ISOLATED_AUTH_BUILD:'1'},{XROGA_RELEASE_SHA:'b'.repeat(40)},{NEXT_PUBLIC_API_URL:'https://xroga-api.fly.dev'},{NEXT_PUBLIC_SUPABASE_URL:'https://nzenxdfumxrnsmybazmo.supabase.co'},{FRONTEND_URL:'https://xroga.com'}])assert.throws(()=>resolveAuthBuildConfiguration({...staging,...patch},manifest));
  assert.throws(()=>resolveAuthBuildConfiguration(staging));
  assert.throws(()=>resolveAuthBuildConfiguration(staging,{...manifest,ownerReview:{...manifest.ownerReview,productionResourceInventoryComplete:false}}));
});
