import assert from 'node:assert/strict';
import test from 'node:test';
import {createPublicKey} from 'node:crypto';
import {createOciWorkloadFederation, type OciFederationConfiguration} from './ociWorkloadFederation.js';
import {managedOciFederationConfiguration,managedCredentialConfiguration} from './credentialVaultStartup.js';

const domain='https://idcs-aaaaaaaa.identity.oraclecloud.com',domainId='ocid1.domain.oc1..aaaaaaaa';
const subject='repo:Xroga/xroga.com:environment:xroga-phase3-oci-custody',principal='ocid1.xrogaphase3.oc1..fixture';
const audience=`${domain}/xroga-phase3-kms`,sha='a'.repeat(40),clock=1800000000000;
// Explicit unsigned protocol fixtures only. No test here certifies provider custody.
const jwt=(claims:object)=>`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2ln`;
const config=():OciFederationConfiguration=>({domain,domainId,clientId:'fixtureclient',audience,subject,resourceType:'xrogaphase3',expectedPrincipalId:principal,
  expectedClaims:{aud:audience,ref:'refs/heads/codex/xroga-batch-01',repository_id:'1280129659',sha,workflow_ref:'Xroga/xroga.com/.github/workflows/command3-auth-browser.yml@refs/heads/codex/xroga-batch-01'},
  credentials:()=>({clientSecret:'CLIENT_SECRET_CANARY',requestUrl:'https://pipelines.actions.githubusercontent.com/oidc',requestToken:'RUNNER_TOKEN_CANARY'})});
function fixture(){
  let now=clock,fail=false,sourcePatch:Record<string,unknown>={},rpstPatch:Record<string,unknown>={};
  const calls:Array<{url:string;method?:string}>=[],receipts:any[]=[];
  const transport:typeof fetch=async(input,init)=>{
    const url=String(input);calls.push({url,method:init?.method});
    assert.equal(init?.redirect,'error');assert.ok(init?.signal);
    if(url.startsWith('https://pipelines.actions.githubusercontent.com/')){
      assert.equal(new URL(url).searchParams.get('audience'),audience);
      return Response.json({value:jwt({...config().expectedClaims,iss:'https://token.actions.githubusercontent.com',sub:subject,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300,...sourcePatch})});
    }
    assert.equal(url,`${domain}/oauth2/v1/token`); assert.equal(init?.method,'POST');
    const body=init!.body as URLSearchParams;
    assert.equal(body.get('rpst_exp'),'20');assert.equal(body.get('res_type'),'xrogaphase3');
    assert.equal(body.get('grant_type'),'urn:ietf:params:oauth:grant-type:token-exchange');
    if(fail)return Response.json({error:'PRIVATE_PROVIDER_ERROR_CANARY'},{status:401,headers:{'opc-request-id':'bounded-denial'}});
    const jwk=createPublicKey(body.get('public_key')!).export({format:'jwk'});
    return Response.json({token:jwt({sub:principal,'var_domain.id':domainId,var_name:subject,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+1200,jwk,...rpstPatch})},{headers:{'opc-request-id':'bounded-success'}});
  };
  const create=(configuration=config())=>createOciWorkloadFederation(configuration,{fetch:transport,now:()=>now,maxExchanges:20,receipt:r=>receipts.push(r)});
  return {create,calls,receipts,advance:(ms:number)=>{now+=ms;},deny:()=>{fail=true;},source:(p:Record<string,unknown>)=>{sourcePatch=p;},rpst:(p:Record<string,unknown>)=>{rpstPatch=p;}};
}
test('federation coalesces acquisition and returns immutable PoP SDK snapshots with redacted receipts',async()=>{
  const f=fixture(),provider=f.create();
  const sessions=await Promise.all(Array.from({length:8},()=>provider.session()));
  assert.equal(f.calls.length,2);assert.equal(provider.diagnostics().exchanges,1);
  assert.ok((await sessions[0]!.getKeyId()).startsWith('ST$'));
  assert.equal(sessions[0]!.getPrivateKey(),sessions[7]!.getPrivateKey());
  assert.equal(f.receipts[0].principal,principal);
  assert.ok(!JSON.stringify(f.receipts).includes('CANARY'));
  assert.ok(!JSON.stringify(config()).includes('CLIENT_SECRET_CANARY'));
});
test('federation rejects wrong workload claims before exchange and does not certify local JWT parsing',async()=>{
  for(const patch of [{iss:'https://attacker.invalid'},{sub:'founder'},{aud:'wrong'},{repository_id:'foreign'},{ref:'refs/heads/main'},{workflow_ref:'wrong-workflow'},{sha:'b'.repeat(40)},{exp:Math.floor(clock/1000)-1},{iat:Math.floor(clock/1000)+60},{nbf:Math.floor(clock/1000)+60}]){
    const f=fixture();f.source(patch);await assert.rejects(f.create().session(),{message:'Managed workload authentication unavailable.'});
    assert.equal(f.calls.length,1);
  }
});
test('federation rejects wrong principal, domain, workload context, PoP key, expiry and oversized lifetime',async()=>{
  for(const patch of [{sub:'ocid1.user.oc1..founder'},{sub:'ocid1.xrogaphase3.oc1..foreign'},{'var_domain.id':'foreign'},{var_name:'wrong-workload'},{jwk:{n:'foreign',e:'AQAB'}},{exp:Math.floor(clock/1000)-1},{exp:Math.floor(clock/1000)+1201}]){
    const f=fixture();f.rpst(patch);await assert.rejects(f.create().session(),{message:'Managed workload authentication unavailable.'});assert.equal(f.receipts.length,0);
  }
});
test('renewal before expiry is single-flight and failed renewal never falls back to an unexpired token',async()=>{
  const f=fixture(),provider=f.create(),before=await provider.session();
  f.advance(1141000);await Promise.all([provider.session(),provider.session()]);assert.equal(f.calls.length,4);
  // An old in-flight snapshot cannot silently switch to the new token.
  assert.notEqual(await before.getKeyId(),await(await provider.session()).getKeyId());
  f.deny();await assert.rejects(provider.session(true));assert.equal(f.receipts.at(-1).status,401);
  await assert.rejects(provider.session());assert.equal(provider.diagnostics().exchanges,4);
  assert.ok(!JSON.stringify(f.receipts).includes('PRIVATE_PROVIDER_ERROR_CANARY'));
});
test('expired snapshots and local shutdown cannot sign, and exchange attempts remain bounded',async()=>{
  const f=fixture(),provider=f.create(),session=await provider.session();f.advance(1201000);
  await assert.rejects(session.getKeyId());
  await provider.session();provider.stop();await assert.rejects(provider.session());assert.throws(()=>session.getPrivateKey());
  const g=fixture(),bounded=g.create();g.deny();for(let i=0;i<21;i++)await assert.rejects(bounded.session());
  assert.equal(g.calls.length,40); // twenty source requests and twenty refused exchanges, no request21.
});
test('invalid endpoint/config and oversized JSON fail closed without credential disclosure',async()=>{
  const c=config();assert.throws(()=>fixture().create({...c,domain:'https://attacker.invalid'}));
  assert.throws(()=>fixture().create({...c,expectedClaims:{...c.expectedClaims,repository_id:'foreign'}}));
  const f=fixture(),bad={...c,credentials:()=>({clientSecret:'PRIVATE',requestToken:'PRIVATE',requestUrl:'https://actions.githubusercontent.com.attacker.invalid/oidc'})};
  await assert.rejects(f.create(bad).session());assert.equal(f.calls.length,0);
  const p=createOciWorkloadFederation(c,{now:()=>clock,fetch:async()=>new Response('x'.repeat(65537))});
  await assert.rejects(p.session(),{message:'Managed workload authentication unavailable.'});
});
test('startup federation config requires the approved hosted source and never serializes secret suppliers',()=>{
  const env={NODE_ENV:'production',GITHUB_ACTIONS:'true',XROGA_CREDENTIAL_KMS_PROVIDER:'oci',XROGA_OCI_KMS_KEY_ID:'ocid1.key.oc1.me-dubai-1.fixture.aaaa',
    XROGA_OCI_KMS_KEY_VERSION:'ocid1.keyversion.oc1.me-dubai-1.fixture.aaaa',XROGA_OCI_KMS_ENDPOINT:'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com',
    XROGA_OCI_KMS_AUTH_MODE:'workload_federation',XROGA_OCI_KMS_PRINCIPAL_ID:principal,XROGA_OCI_FEDERATION_SOURCE:'github_actions',XROGA_OCI_FEDERATION_DOMAIN:domain,
    XROGA_OCI_FEDERATION_DOMAIN_ID:domainId,XROGA_OCI_FEDERATION_CLIENT_ID:'fixtureclient',XROGA_OCI_EXCHANGE_CLIENT_SECRET:'CLIENT_SECRET_CANARY',
    ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com/oidc',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'RUNNER_TOKEN_CANARY',XROGA_RELEASE_SHA:sha};
  assert.ok(managedCredentialConfiguration(env));assert.ok(!JSON.stringify(managedCredentialConfiguration(env)).includes('CANARY'));
  assert.equal(managedOciFederationConfiguration({...env,XROGA_OCI_KMS_PRINCIPAL_ID:''}).expectedPrincipalId,undefined);
  assert.throws(()=>managedCredentialConfiguration({...env,XROGA_OCI_KMS_PRINCIPAL_ID:''}));
  for(const patch of [{GITHUB_ACTIONS:'false'},{XROGA_OCI_FEDERATION_SOURCE:'fly'},{XROGA_OCI_EXCHANGE_CLIENT_SECRET:''},{XROGA_RELEASE_SHA:'unknown'},{XROGA_OCI_KMS_PRINCIPAL_ID:'ocid1.user.oc1..founder'}])assert.throws(()=>managedCredentialConfiguration({...env,...patch}));
  assert.throws(()=>managedOciFederationConfiguration({...env,XROGA_OCI_FEDERATION_DOMAIN:'https://foreign.invalid'}));
});
