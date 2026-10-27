import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {IdentityPoolClient} from 'google-auth-library';
import {flyGoogleWorkloadConfiguration, flySubjectTokenSupplier, createFlyGoogleAuth,requestFlyOidcToken} from './flyGoogleWorkloadIdentity.js';
import {managedCredentialConfiguration} from './credentialVaultStartup.js';

const key = 'projects/synthetic/locations/us-central1/keyRings/test/cryptoKeys/test';
const env = {NODE_ENV:'production',FLY_APP_NAME:'xroga-api',FLY_MACHINE_ID:'e820730b296098',
  XROGA_GOOGLE_CLOUD_AUTH_MODE:'fly_oidc',
  XROGA_GOOGLE_WIF_AUDIENCE:'//iam.googleapis.com/projects/574998934848/locations/global/workloadIdentityPools/xroga-fly-production/providers/xroga-api',
  XROGA_GOOGLE_WIF_SERVICE_ACCOUNT:'xroga-api-kms@synthetic.iam.gserviceaccount.com',
  XROGA_FLY_OIDC_ISSUER:'https://oidc.fly.io/synthetic-org',XROGA_FLY_OIDC_ORGANIZATION_ID:'123456',
  XROGA_FLY_OIDC_IMAGE_DIGESTS:'sha256:'+'a'.repeat(64)};
const configuration = flyGoogleWorkloadConfiguration(env,key)!;
const context = {audience:configuration.audience,subjectTokenType:'urn:ietf:params:oauth:token-type:jwt',transporter:{} as never};
const now = 1_793_000_000;
const claims = {iss:configuration.issuer,aud:'https:'+configuration.audience,org_id:configuration.organizationId,
  app_name:configuration.app,machine_id:configuration.machineId,sub:'synthetic-org:xroga-api:synthetic-machine',
  image_digest:configuration.imageDigests[0],iat:now,nbf:now,exp:now+600};
function token(changes:Record<string,unknown> = {},header:Record<string,unknown> = {}) {
  return Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic-key',...header})).toString('base64url')+'.'
    +Buffer.from(JSON.stringify({...claims,...changes})).toString('base64url')+'.synthetic_signature';
}

test('Fly federation configuration pins project, identity, issuer, runtime and at most two immutable images', () => {
  assert.ok(configuration); assert.ok(Object.isFrozen(configuration.imageDigests));
  assert.equal(flyGoogleWorkloadConfiguration({},key),undefined);
  assert.equal(managedCredentialConfiguration({...env,XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:key})?.provider,'google_cloud');
  for (const change of [
    {FLY_MACHINE_ID:''},{FLY_APP_NAME:''},{XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc'},
    {GOOGLE_APPLICATION_CREDENTIALS:'/downloaded-key.json'},{GOOGLE_CREDENTIALS:'operator-private-key'},
    {XROGA_GOOGLE_WIF_AUDIENCE:'https://attacker.invalid/token'},
    {XROGA_GOOGLE_WIF_SERVICE_ACCOUNT:'xroga-api-kms@foreign1.iam.gserviceaccount.com'},
    {XROGA_FLY_OIDC_ISSUER:'https://oidc.fly.io/synthetic-org/../other'},
    {XROGA_FLY_OIDC_ORGANIZATION_ID:''},{XROGA_FLY_OIDC_IMAGE_DIGESTS:'image:latest'},
    {XROGA_FLY_OIDC_IMAGE_DIGESTS:Array(3).fill(configuration.imageDigests[0]).join(',')},
  ]) assert.throws(() => flyGoogleWorkloadConfiguration({...env,...change},key));
});

test('machine token supplier bounds exact audience, owner, machine, image and lifetime before Google exchange', async () => {
  let calls = 0;
  const supplier = flySubjectTokenSupplier(configuration,{now:()=>now*1000,readToken:async audience => {
    calls++;assert.equal(audience,claims.aud);return token();
  }});
  assert.equal(await supplier.getSubjectToken(context),token());
  await assert.rejects(supplier.getSubjectToken({...context,audience:'foreign'}));
  await assert.rejects(supplier.getSubjectToken({...context,subjectTokenType:'foreign'}));
  assert.equal(calls,1);
  for (const change of [
    {iss:'https://oidc.fly.io/foreign'},{aud:'https://attacker.invalid'},{org_id:'999999'},
    {app_name:'other-app'},{machine_id:'7845746ce20008'},{sub:'synthetic-org:other-app:machine'},
    {image_digest:'sha256:'+'b'.repeat(64)},{exp:now},{exp:now+3600},{iat:now+61},{nbf:now+61},
    {iat:null},{exp:'later'},
  ]) {
    const denied = flySubjectTokenSupplier(configuration,{now:()=>now*1000,readToken:async()=>token(change)});
    await assert.rejects(denied.getSubjectToken(context),{message:'Fly managed credential identity is unavailable.'});
  }
  for(const value of ['PRIVATE_TOKEN_CANARY','x'.repeat(16_385),token({}, {alg:'none'})]) {
    await assert.rejects(flySubjectTokenSupplier(configuration,{now:()=>now*1000,readToken:async()=>value}).getSubjectToken(context));
  }
  await assert.rejects(flySubjectTokenSupplier(configuration,{readToken:async()=>{throw Error('PRIVATE_SOCKET_CANARY');}}).getSubjectToken(context),
    {message:'Fly managed credential identity is unavailable.'});
});

test('installed Google identity client exchanges synthetic Fly token, impersonates only pinned SA and renews without ADC', async t => {
  let reads = 0, exchanges = 0, impersonations = 0;
  const client = createFlyGoogleAuth(configuration,{now:()=>now*1000,readToken:async()=>{reads++;return token();}});
  assert.ok(client instanceof IdentityPoolClient);
  // Actual installed library executes STS and impersonation. Only its HTTP
  // responses are synthetic. This is not Google/Fly live federation evidence.
  // google-auth-library loads Gaxios through its CommonJS export. Its STS
  // helper creates a second instance. Bind the actual instance prototype,
  // rather than the distinct Gaxios ESM export or only the IAM instance.
  const transportPrototype = Object.getPrototypeOf(client.transporter) as typeof client.transporter;
  t.mock.method(transportPrototype,'request',async (opts: {url:string;data?:unknown;headers?:Headers}) => {
    if (String(opts.url) === 'https://sts.googleapis.com/v1/token') {
      exchanges++;const data = String(opts.data);
      assert.ok(data.includes('subject_token=') && data.includes(encodeURIComponent(token())));
      assert.ok(data.includes(encodeURIComponent(configuration.audience)));
      return {data:{access_token:'synthetic-sts-token',expires_in:600,token_type:'Bearer'},status:200,headers:new Headers(),config:opts};
    }
    assert.equal(String(opts.url),`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${configuration.serviceAccount}:generateAccessToken`);
    impersonations++;
    return {data:{accessToken:'synthetic-impersonated-'+impersonations,expireTime:new Date(Date.now()+600_000).toISOString()},status:200,headers:new Headers(),config:opts};
  });
  assert.equal((await client.getAccessToken()).token,'synthetic-impersonated-1');
  assert.equal((await client.getAccessToken()).token,'synthetic-impersonated-1');
  assert.deepEqual([reads,exchanges,impersonations],[1,1,1]);
  client.setCredentials({access_token:'expired-synthetic',expiry_date:Date.now()-1000});
  assert.equal((await client.getAccessToken()).token,'synthetic-impersonated-2');
  assert.deepEqual([reads,exchanges,impersonations],[2,2,2]);
  t.mock.method(transportPrototype,'request',async()=>{throw Error('PRIVATE_STS_DENIAL_CANARY');});
  client.setCredentials({access_token:'expired-synthetic',expiry_date:Date.now()-1000});
  await assert.rejects(client.getAccessToken());
  assert.deepEqual([reads,exchanges,impersonations],[3,2,2],'STS denial never falls back to another identity');
});

test('actual local socket transport sends only the fixed Fly request and bounds malformed/redirect/oversize responses', async () => {
  const pipe = process.platform === 'win32' ? '\\\\.\\pipe\\xroga-oidc-'+randomUUID() : join(tmpdir(),'xroga-oidc-'+randomUUID()+'.sock');
  let mode='ok',calls=0;
  const server=createServer((req,res)=>{
    calls++;assert.equal(req.method,'POST');assert.equal(req.url,'/v1/tokens/oidc');assert.equal(req.headers.authorization,undefined);
    let text='';req.on('data',chunk=>{text+=chunk;});req.on('end',()=>{
      assert.deepEqual(JSON.parse(text),{aud:claims.aud});
      if(mode==='redirect'){res.writeHead(307,{location:'https://attacker.invalid'});res.end();}
      else if(mode==='oversize')res.end('x'.repeat(16_385));
      else if(mode==='denied'){res.writeHead(403);res.end('PRIVATE_SOCKET_CANARY');}
      else res.end(token());
    });
  });
  await new Promise<void>(resolve=>server.listen(pipe,resolve));
  const loopback=((opts:import('node:http').RequestOptions,listener:(res:import('node:http').IncomingMessage)=>void)=>{
    assert.equal(opts.socketPath,'/.fly/api');assert.equal(opts.hostname,'localhost');assert.equal(opts.path,'/v1/tokens/oidc');
    return request({...opts,socketPath:pipe},listener);
  }) as typeof request;
  try {
    assert.equal(await requestFlyOidcToken(claims.aud,loopback),token());
    for(const denied of ['redirect','oversize','denied']){mode=denied;await assert.rejects(requestFlyOidcToken(claims.aud,loopback),{message:'Fly managed credential identity is unavailable.'});}
    assert.equal(calls,4,'redirect refusal never follows another destination');
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
