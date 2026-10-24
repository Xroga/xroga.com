/** Real signed wrong-workflow control, not a local admission test. No IAM writes. */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
async function main() {
assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.GITHUB_REPOSITORY,'Xroga/xroga.com');assert.equal(process.env.GITHUB_REF,'refs/heads/codex/xroga-batch-01');
const domain=process.env.XROGA_OCI_FEDERATION_DOMAIN!;
assert.match(domain,/^https:\/\/idcs-[a-f0-9]+\.identity\.oraclecloud\.com$/);
const audience=`${domain}/xroga-phase3-kms`;
const receipt:Record<string,unknown>={status:'FAIL',sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
  control:'REAL_PROVIDER_WRONG_WORKFLOW_NOT_LOCAL_ADMISSION',timestamp:new Date().toISOString()};
try {
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL!);
  assert.equal(url.protocol,'https:');assert.ok(url.hostname.endsWith('.actions.githubusercontent.com'));
  assert.ok(!url.username&&!url.password&&!url.port&&!url.hash);url.searchParams.set('audience',audience);
  const source=await fetch(url,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN!}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(source.status,200);
  const body=await source.text();assert.ok(Buffer.byteLength(body)<65536);
  const token=JSON.parse(body).value;assert.equal(typeof token,'string');assert.ok(token.length<32768);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  assert.equal(claims.iss,'https://token.actions.githubusercontent.com');
  assert.equal(claims.sub,'repo:Xroga/xroga.com:environment:xroga-phase3-oci-custody');
  assert.equal(claims.repository_id,'1280129659');assert.equal(claims.ref,process.env.GITHUB_REF);
  assert.equal(claims.sha,process.env.GITHUB_SHA);assert.equal(claims.aud,audience);
  assert.equal(claims.workflow_ref,'Xroga/xroga.com/.github/workflows/backend-health-verification.yml@refs/heads/codex/xroga-batch-01');
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const response=await fetch(`${domain}/oauth2/v1/token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Basic ${Buffer.from(`${process.env.XROGA_OCI_FEDERATION_CLIENT_ID!}:${process.env.XROGA_OCI_EXCHANGE_CLIENT_SECRET!}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',requested_token_type:'urn:oci:token-type:oci-rpst',public_key:publicKey,
      subject_token_type:'jwt',subject_token:token,res_type:'xrogaphase3',rpst_exp:'20'})});
  receipt.providerStatus=response.status;
  const id=response.headers.get('opc-request-id');if(id&&/^[A-Za-z0-9._:/-]{1,300}$/.test(id))receipt.requestId=id;
  const text=await response.text();assert.ok(Buffer.byteLength(text)<65536);const error=JSON.parse(text).error;
  // A bad client, malformed request, absent endpoint or outage is not proof.
  assert.ok([400,403].includes(response.status));assert.ok(['invalid_grant','access_denied'].includes(error));
  assert.ok(receipt.requestId);receipt.error=error;receipt.status='PASS_PROVIDER_DENIAL_REQUIRES_MATCHED_POSITIVE_RECEIPT';
} catch {process.exitCode=1;}
finally {
  await writeFile(join(process.env.RUNNER_TEMP!,'oci-federation-wrong-workflow.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify(receipt));
}
}
void main().catch(()=>{console.error('Isolated wrong-workflow admission failed. No provider denial claimed.');process.exitCode=1;});
