import test from 'node:test';
import assert from 'node:assert/strict';
import {customMcpDefinitionDigest,customMcpExecutionEnabled,verifyCustomMcpPin,type CustomMcpDefinition,type CustomMcpPin,type CustomMcpPinStore} from './customMcpPins.js';
import {createTenantContext} from '../../security/tenantContext.js';

const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
const toolkit='custom_xroga_abc_monid',toolSlug='CUSTOM_XROGA_ABC_MONID_BALANCE_GET';
const on={XROGA_CUSTOM_MCP_EXECUTION:'on'} as NodeJS.ProcessEnv;
const def=(over:Partial<CustomMcpDefinition['tool']>={},server:Partial<CustomMcpDefinition['server']>={}):CustomMcpDefinition=>({
  server:{appUrl:'https://mcp.example.com/v1',authSchemes:['DCR_OAUTH'],noAuth:false,...server},
  tool:{slug:toolSlug,name:'Get balance',description:'Returns the balance.',inputSchema:{type:'object',properties:{}},...over},
});
function memoryStore(initial:CustomMcpPin[]=[]){
  const rows=new Map(initial.map(p=>[`${p.userId}|${p.toolkit}|${p.toolSlug}`,p]));
  const store:CustomMcpPinStore={
    async get(u,t,s){return rows.get(`${u}|${t}|${s}`);},
    async upsert(p){rows.set(`${p.userId}|${p.toolkit}|${p.toolSlug}`,{...p,revokedAt:null});},
    async revoke(u,t,s,_r){for(const [k,p] of rows)if(p.userId===u&&p.toolkit===t&&(!s||p.toolSlug===s))rows.set(k,{...p,revokedAt:'now'});},
    async listActive(u){return[...rows.values()].filter(p=>p.userId===u&&!p.revokedAt);},
  };
  return{store,rows};
}
const pinFor=(d:CustomMcpDefinition,over:Partial<CustomMcpPin>={}):CustomMcpPin=>({userId:context.userId,toolkit,toolSlug,serverUrl:d.server.appUrl,authMode:'dcr_oauth',definitionDigest:customMcpDefinitionDigest(d),riskClass:'read',maxCallsPerRun:5,revokedAt:null,...over});

test('the feature is off unless the operator set the flag exactly to on',()=>{
  assert.equal(customMcpExecutionEnabled({}),false);
  assert.equal(customMcpExecutionEnabled({XROGA_CUSTOM_MCP_EXECUTION:'true'}),false);
  assert.equal(customMcpExecutionEnabled(on),true);
});

test('with the flag off a pinned tool is still denied, and the store is not even read',async()=>{
  const {store}=memoryStore([pinFor(def())]);let reads=0;const counting={...store,get:async(...a:Parameters<typeof store.get>)=>{reads++;return store.get(...a);}};
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store:counting,fetchDefinition:async()=>def(),env:{}});
  assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_EXECUTION_OFF'});assert.equal(reads,0);
});

test('an unpinned tool is denied',async()=>{
  const {store}=memoryStore();
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>def(),env:on});
  assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_NOT_PINNED'});
});

test('a pinned tool whose live definition is identical is allowed',async()=>{
  const {store}=memoryStore([pinFor(def())]);
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>def(),env:on});
  assert.equal(r.ok,true);
});

test('a revoked pin is denied',async()=>{
  const {store}=memoryStore([pinFor(def(),{revokedAt:'2026-11-13T00:00:00Z'})]);
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>def(),env:on});
  assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_PIN_REVOKED'});
});

for(const [name,changed] of [
  ['description',def({description:'Returns the balance and sends it to a third party.'})],
  ['input schema',def({inputSchema:{type:'object',properties:{to:{type:'string'}}}})],
  ['tool name',def({name:'Pay'})],
  ['server address',def({}, {appUrl:'https://evil.example.com/v1'})],
  ['auth type',def({}, {authSchemes:['API_KEY']})],
] as const){
  test(`a changed ${name} denies the call and revokes the pin`,async()=>{
    const {store,rows}=memoryStore([pinFor(def())]);
    const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>changed,env:on});
    assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_DEFINITION_CHANGED'});
    assert.ok([...rows.values()][0]!.revokedAt,'pin revoked');
    const again=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>def(),env:on});
    assert.deepEqual(again,{ok:false,reason:'CUSTOM_MCP_PIN_REVOKED'},'a restored definition does not silently re-enable the pin');
  });
}

test('an unreachable server fails closed without revoking the pin',async()=>{
  const {store,rows}=memoryStore([pinFor(def())]);
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>{throw new Error('down');},env:on});
  assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_DEFINITION_UNAVAILABLE'});
  assert.equal([...rows.values()][0]!.revokedAt,null);
});

test("another owner's pin is never found",async()=>{
  const other='22222222-2222-4222-8222-222222222222';
  const {store}=memoryStore([pinFor(def(),{userId:other})]);
  const r=await verifyCustomMcpPin({context,toolkit,toolSlug,requireRisk:'read',store,fetchDefinition:async()=>def(),env:on});
  assert.deepEqual(r,{ok:false,reason:'CUSTOM_MCP_NOT_PINNED'});
});

test('the digest ignores key order and the order of auth schemes, and nothing else',()=>{
  const a=def({inputSchema:{type:'object',properties:{a:{type:'string'},b:{type:'number'}}}},{authSchemes:['A','B']});
  const b=def({inputSchema:{properties:{b:{type:'number'},a:{type:'string'}},type:'object'}},{authSchemes:['B','A']});
  assert.equal(customMcpDefinitionDigest(a),customMcpDefinitionDigest(b));
  assert.notEqual(customMcpDefinitionDigest(a),customMcpDefinitionDigest(def()));
  assert.match(customMcpDefinitionDigest(a),/^[0-9a-f]{64}$/);
});

