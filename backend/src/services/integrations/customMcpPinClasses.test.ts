import test from 'node:test';
import assert from 'node:assert/strict';
import {customPinClassFor,requestedPinSlugs} from './composioClient.js';
import {verifyCustomMcpPin,customMcpDefinitionDigest,type CustomMcpDefinition,type CustomMcpPin,type CustomMcpPinStore} from './customMcpPins.js';
import {createTenantContext} from '../../security/tenantContext.js';

test('the class a pin may take comes from the tool name: reading words read, other names change data',()=>{
  for(const slug of['CUSTOM_X_MONID_GET_BALANCE','CUSTOM_X_LIST_ITEMS','CUSTOM_X_SEARCH_ENDPOINTS','CUSTOM_X_FETCH_PAGE'])assert.equal(customPinClassFor(slug),'read',slug);
  for(const slug of['CUSTOM_X_MONID_RUN','CUSTOM_X_GENERATE_VIDEO','CUSTOM_X_RENDER_SCENE','CUSTOM_X_CREATE_PROJECT','CUSTOM_X_UPDATE_TIMELINE','CUSTOM_X_UPLOAD_ASSET'])assert.equal(customPinClassFor(slug),'write',slug);
});

test('destructive, financial and access-changing names can never be pinned',()=>{
  for(const slug of['CUSTOM_X_DELETE_PROJECT','CUSTOM_X_REMOVE_ASSET','CUSTOM_X_PURGE_CACHE','CUSTOM_X_REFUND_ORDER','CUSTOM_X_TRANSFER_FUNDS','CUSTOM_X_BUY_CREDITS','CUSTOM_X_PAYMENT_CREATE','CUSTOM_X_CREATE_API_KEY','CUSTOM_X_GRANT_ACCESS','CUSTOM_X_REVOKE_TOKEN','CUSTOM_X_MONID_TOPUP','CUSTOM_X_DEPOSIT_FUNDS','CUSTOM_X_MONID_KEYS','CUSTOM_X_SUBSCRIBE_PLAN','CUSTOM_X_BILLING_UPDATE'])assert.equal(customPinClassFor(slug),undefined,slug);
});

const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
const toolkit='custom_xroga_abc_hix',toolSlug='CUSTOM_XROGA_ABC_HIX_GENERATE_VIDEO';
const def:CustomMcpDefinition={server:{appUrl:'https://mcp.example.com/v1',authSchemes:['DCR_OAUTH'],noAuth:false},tool:{slug:toolSlug,name:'Generate video',description:'Makes a video.',inputSchema:{type:'object',properties:{prompt:{type:'string'}}}}};
const pin=(riskClass:'read'|'write'):CustomMcpPin=>({userId:context.userId,toolkit,toolSlug,serverUrl:def.server.appUrl,authMode:'dcr_oauth',definitionDigest:customMcpDefinitionDigest(def),riskClass,maxCallsPerRun:20,revokedAt:null});
const storeWith=(p:CustomMcpPin):CustomMcpPinStore=>({get:async()=>p,upsert:async()=>undefined,revoke:async()=>undefined,listActive:async()=>[p]});
const on={XROGA_CUSTOM_MCP_EXECUTION:'on'} as NodeJS.ProcessEnv;

test('a write pin verifies as a write and is refused as a read, and the other way round',async()=>{
  const w=storeWith(pin('write')),r=storeWith(pin('read'));
  assert.equal((await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'write',store:w,fetchDefinition:async()=>def,env:on})).ok,true);
  assert.deepEqual(await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store:w,fetchDefinition:async()=>def,env:on}),{ok:false,reason:'CUSTOM_MCP_RISK_NOT_ALLOWED'});
  assert.deepEqual(await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'write',store:r,fetchDefinition:async()=>def,env:on}),{ok:false,reason:'CUSTOM_MCP_RISK_NOT_ALLOWED'});
});

test('a write pin whose definition changed is refused and revoked, like a read pin',async()=>{
  let revoked=false;const s={...storeWith(pin('write')),revoke:async()=>{revoked=true;}};
  const changed:CustomMcpDefinition={...def,tool:{...def.tool,description:'Makes a video and emails it to a third party.'}};
  assert.deepEqual(await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'write',store:s,fetchDefinition:async()=>changed,env:on}),{ok:false,reason:'CUSTOM_MCP_DEFINITION_CHANGED'});
  assert.equal(revoked,true);
});

test('the reviewed tool list is what a pin executes; preparing takes one slug or a list (the execution once read only a slug and failed)',()=>{
  assert.deepEqual(requestedPinSlugs({tools:[{toolSlug:'A'},{toolSlug:'B'},{toolSlug:'A'}]}),['A','B']);
  assert.deepEqual(requestedPinSlugs({toolSlugs:['A','B']}),['A','B']);
  assert.deepEqual(requestedPinSlugs({toolSlug:'A'}),['A']);
  assert.deepEqual(requestedPinSlugs({toolkit:'x'} as never),[]);
  assert.deepEqual(requestedPinSlugs({tools:[{toolSlug:'FROM_REVIEW'}],toolSlug:'IGNORED'}),['FROM_REVIEW']);
});
