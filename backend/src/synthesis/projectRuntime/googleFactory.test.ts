import assert from 'node:assert/strict';
import test from 'node:test';
import {googleProjectRuntimeSelected,googleExecutionConfiguration,googleRuntimeImageFor,verifyAttachedGoogleIdentity} from './googleFactory.js';
import {createProjectRuntimeManager} from './manager.js';
import {createTenantContext} from '../../security/tenantContext.js';

const image='node@sha256:'+'a'.repeat(64);
const env={XROGA_PROJECT_RUNTIME_PROVIDER:'google-gce',XROGA_GCE_PROJECT:'synthetic-project',XROGA_GCE_ZONE:'us-central1-a',
  XROGA_GCE_SUBNET:'projects/synthetic-project/regions/us-central1/subnetworks/execution',XROGA_GCE_BASE_IMAGE:'xroga-exec-synthetic',
  XROGA_GCE_BASE_IMAGE_ID:'12345',XROGA_GCE_SERVICE_ACCOUNT:'synthetic-runtime@synthetic-project.iam.gserviceaccount.com',
  XROGA_GCE_ADMITTED_IMAGES:image,XROGA_GCE_NODE_IMAGE:image};

test('Google selection is explicit and malformed selection or incomplete configuration never falls back',()=>{
  assert.equal(googleProjectRuntimeSelected(env),true);assert.equal(googleProjectRuntimeSelected({}),false);
  assert.throws(()=>googleProjectRuntimeSelected({XROGA_PROJECT_RUNTIME_PROVIDER:'typo'}));
  assert.throws(()=>googleExecutionConfiguration({}));
  assert.equal(googleExecutionConfiguration(env).maxConcurrentInstances,1);
  assert.throws(()=>googleExecutionConfiguration({...env,XROGA_GCE_MAX_INSTANCES:'3'}));
});

test('native manager refuses raw user IDs, cloned contexts and substituted owners before provider construction',()=>{
  const previous=process.env.XROGA_PROJECT_RUNTIME_PROVIDER;process.env.XROGA_PROJECT_RUNTIME_PROVIDER='google-gce';
  const userId='11111111-1111-4111-8111-111111111111';const authority=createTenantContext({userId,via:'local_jwt'});
  try{
    assert.throws(()=>createProjectRuntimeManager(userId),{code:'PROJECT_RUNTIME_UNAVAILABLE'});
    assert.throws(()=>createProjectRuntimeManager(userId,structuredClone(authority)),{code:'TENANT_AUTH_REQUIRED'});
    assert.throws(()=>createProjectRuntimeManager('foreign-owner',authority),{code:'PROJECT_RUNTIME_UNAVAILABLE'});
  }finally{if(previous===undefined)delete process.env.XROGA_PROJECT_RUNTIME_PROVIDER;else process.env.XROGA_PROJECT_RUNTIME_PROVIDER=previous;}
});

test('runtime image is a configured admitted digest, unsupported toolchains cannot silently use Node',()=>{
  assert.equal(googleRuntimeImageFor('node',env),image);assert.equal(googleRuntimeImageFor('static-web',env),image);
  for(const adapter of ['python','rust','unknown'])assert.throws(()=>googleRuntimeImageFor(adapter,env));
  assert.throws(()=>googleRuntimeImageFor('node',{...env,XROGA_GCE_NODE_IMAGE:'node:22'}));
});

test('native identity requires the pinned attached account and Google metadata response',async()=>{
  const account=env.XROGA_GCE_SERVICE_ACCOUNT;
  for(const [body,headers,status] of [[account,{'metadata-flavor':'Google'},200],['developer@example.com',{'metadata-flavor':'Google'},200],
    [account,{},200],[account,{'metadata-flavor':'Google'},403]] as const) {
    const request=(async(url,options)=>{
      assert.equal(url,'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email');
      assert.equal(options?.redirect,'error');return new Response(body,{headers,status});
    }) as typeof fetch;
    if(body===account&&status===200&&'metadata-flavor' in headers)await verifyAttachedGoogleIdentity(account,request);
    else await assert.rejects(verifyAttachedGoogleIdentity(account,request),{message:'ATTACHED_RUNTIME_PRINCIPAL_MISMATCH'});
  }
});
