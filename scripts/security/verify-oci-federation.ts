/** Opt-in isolated hosted-workload proof. No IAM writes or production database.
 * Receipts contain operation metadata only, never tokens or stored payloads. */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createOciWorkloadFederation } from '../../backend/src/services/integrations/ociWorkloadFederation.js';
import { managedOciFederationConfiguration, initializeCredentialVaultForServer } from '../../backend/src/services/integrations/credentialVaultStartup.js';
import { createOciKmsCryptoProvider, OciKmsCryptoProvider, type OciKmsTransport } from '../../backend/src/services/integrations/ociKmsCryptoProvider.js';
import { saveUserProviderKey, getUserProviderKey } from '../../backend/src/services/integrations/userProviderKeys.js';

async function main() {
const mode = process.argv[2];
assert.ok(['bootstrap', 'write', 'read', 'renewal'].includes(mode ?? ''));
assert.equal(process.env.CI, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, 'Xroga/xroga.com');
assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/xroga-batch-01');
assert.equal(process.env.GITHUB_SHA, process.env.XROGA_RELEASE_SHA);
assert.ok(process.env.RUNNER_TEMP);
const receipts: unknown[] = [], cases: string[] = [];
const configuration = managedOciFederationConfiguration(process.env);
const out = join(process.env.RUNNER_TEMP!, `oci-federation-${mode}.json`);
let passed = false;
try {
  if (mode === 'bootstrap') {
    // No key permission is needed to discover the real non-user principal.
    // A separate owner-created exact-principal policy is required afterwards.
    assert.equal(configuration.expectedPrincipalId, undefined);
    const observedFetch: typeof fetch = async (url,init) => {
      const response=await fetch(url,init);
      if(String(url)===`${configuration.domain}/oauth2/v1/token`) {
        const record:Record<string,unknown>={exchangeHttpStatus:response.status,requestId:response.headers.get('opc-request-id')};
        // Only bounded protocol shape and non-secret identity metadata may leave
        // this process. Never print a token, claim payload, JWK or provider body.
        const text=await response.clone().text();
        if(Buffer.byteLength(text)<65536)try {
          const parsed=JSON.parse(text);
          if(typeof parsed.error==='string'&&/^[a-z_]{1,60}$/.test(parsed.error))record.errorCode=parsed.error;
          if(typeof parsed.error_description==='string') {
            let reason=parsed.error_description;
            const auth=configuration.credentials();
            const sourceToken=init?.body instanceof URLSearchParams?init.body.get('subject_token'):null;
            for(const secret of [auth.clientSecret,auth.requestToken,sourceToken].filter(Boolean) as string[])reason=reason.split(secret).join('[REDACTED]');
            record.redactedReason=reason.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED_JWT]')
              .replace(/-----BEGIN [\s\S]*?-----END[^-]*-----/g,'[REDACTED_KEY]')
              .replace(/[A-Za-z0-9+/=_-]{24,}/g,'[REDACTED_OPAQUE]').replace(/https?:\/\/\S+/g,'[REDACTED_URL]').slice(0,500);
          }
          if(typeof parsed.token==='string'&&parsed.token.length<32768){
            const value=JSON.parse(Buffer.from(parsed.token.split('.')[1],'base64url').toString());
            record.claimNames=Object.keys(value).filter(key=>/^[A-Za-z0-9_.-]{1,70}$/.test(key));
            if(typeof value.sub==='string'&&/^ocid1\.[a-z0-9.-]{1,500}$/.test(value.sub))record.principal=value.sub;
          }
        }catch{/* No raw provider parsing error is emitted. */}
        receipts.push(record);
      }
      return response;
    };
    const bridge = createOciWorkloadFederation(configuration, {fetch:observedFetch,maxExchanges:2,receipt: r => receipts.push(r)});
    try { await bridge.session(); cases.push('REAL_WORKLOAD_RPST_ISSUED_NO_KMS_GRANT'); }
    finally { bridge.stop(); }
  } else if (mode === 'renewal') {
    assert.equal(process.env.NODE_ENV,'production');assert.ok(configuration.expectedPrincipalId);
    const bridge=createOciWorkloadFederation(configuration,{maxExchanges:4,receipt:r=>receipts.push(r)});
    const common=await import('oci-common'),kms=await import('oci-keymanagement');
    const plain=randomBytes(32),keyId=process.env.XROGA_OCI_KMS_KEY_ID!;
    let calls=0;
    const invoke=async(auth:Awaited<ReturnType<typeof bridge.session>>,operation:'encrypt'|'decrypt',details:any)=>{
      assert.ok(++calls<=10);
      const client=new kms.KmsCryptoClient({authenticationDetailsProvider:auth},{retryConfiguration:common.NoRetryConfigurationDetails,
        httpOptions:{signal:AbortSignal.timeout(15000),redirect:'error'}});
      client.endpoint=process.env.XROGA_OCI_KMS_ENDPOINT!;
      try {
        const response=operation==='encrypt'?await client.encrypt({encryptDataDetails:details}):await client.decrypt({decryptDataDetails:details});
        assert.ok(response.opcRequestId);receipts.push({operation,keyId:details.keyId,status:200,requestId:response.opcRequestId});return response;
      } catch(error:any) {
        const status=Number.isInteger(error?.statusCode)?error.statusCode:null;
        const id=typeof error?.opcRequestId==='string'&&/^[A-Za-z0-9._:/-]{1,300}$/.test(error.opcRequestId)?error.opcRequestId:null;
        receipts.push({operation,keyId:details.keyId,status,requestId:id});
        // Return only redacted failure metadata, not the SDK request object.
        return {denied:true,status,requestId:id};
      }
    };
    try {
      const original=await bridge.session();
      const signingId=await original.getKeyId(),privateKey=original.getPrivateKey();
      const claims=JSON.parse(Buffer.from(signingId.slice(3).split('.')[1],'base64url').toString());
      const encrypted:any=await invoke(original,'encrypt',{keyId,keyVersionId:process.env.XROGA_OCI_KMS_KEY_VERSION!,
        encryptionAlgorithm:'AES_256_GCM',plaintext:plain.toString('base64')});
      assert.ok(encrypted.encryptedData?.ciphertext);
      const details={keyId,keyVersionId:encrypted.encryptedData.keyVersionId,encryptionAlgorithm:'AES_256_GCM',ciphertext:encrypted.encryptedData.ciphertext};
      const opened:any=await invoke(original,'decrypt',details);
      assert.ok(timingSafeEqual(Buffer.from(opened.decryptedData.plaintext,'base64'),plain));
      cases.push('REAL_RESOURCE_PRINCIPAL_KEY_A_ENCRYPT_DECRYPT');
      // One bounded provider-required expiry wait, not a polling loop. Preserve
      // the old signed snapshot only in memory to require real OCI expiry denial.
      const delay=claims.exp*1000-Date.now()+5000;assert.ok(delay>0&&delay<=1205000);
      await new Promise(resolve=>setTimeout(resolve,delay));
      await assert.rejects(original.getKeyId());
      const expired:any=await invoke({getKeyId:async()=>signingId,getPrivateKey:()=>privateKey,getPassphrase:()=>null},'decrypt',details);
      assert.equal(expired.denied,true);assert.ok([401,403].includes(expired.status)&&expired.requestId);
      cases.push('REAL_EXPIRED_RPST_DENIED_BY_PROVIDER_AND_LOCAL_SNAPSHOT');
      const renewed=await bridge.session();assert.notEqual(await renewed.getKeyId(),signingId);
      const recovered:any=await invoke(renewed,'decrypt',details);
      assert.ok(timingSafeEqual(Buffer.from(recovered.decryptedData.plaintext,'base64'),plain));
      cases.push('REAL_UNATTENDED_RENEWAL_AND_EXISTING_CIPHERTEXT_RECOVERY');
    } finally {plain.fill(0);bridge.stop();}
  } else {
    assert.equal(process.env.NODE_ENV, 'production');
    assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    assert.ok(configuration.expectedPrincipalId);
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}});
    const provider = await createOciKmsCryptoProvider({endpoint:process.env.XROGA_OCI_KMS_ENDPOINT!,keyId:process.env.XROGA_OCI_KMS_KEY_ID!,
      encryptVersionId:process.env.XROGA_OCI_KMS_KEY_VERSION!,authMode:'workload_federation',expectedPrincipalId:configuration.expectedPrincipalId,federation:configuration});
    let calls = 0;
    const execute = async (operation:'encrypt'|'decrypt', input: Parameters<OciKmsTransport['encrypt']>[0] | Parameters<OciKmsTransport['decrypt']>[0]) => {
      assert.ok(++calls <= 25, 'Per-process KMS request budget exhausted');
      try {
        const result = operation === 'encrypt' ? await provider.transport.encrypt(input as Parameters<OciKmsTransport['encrypt']>[0]) : await provider.transport.decrypt(input as Parameters<OciKmsTransport['decrypt']>[0]);
        assert.match(result.requestId ?? '', /^[A-Za-z0-9._:/-]{6,300}$/);
        receipts.push({operation,keyId:input.keyId,requestId:result.requestId,result:'SUCCESS'});
        return result;
      } catch (error: any) {
        receipts.push({operation,result:'FAILED',status:Number.isInteger(error?.statusCode)?error.statusCode:null,
          requestId:typeof error?.opcRequestId==='string'&&/^[A-Za-z0-9._:/-]{1,300}$/.test(error.opcRequestId)?error.opcRequestId:null});
        throw error;
      }
    };
    const observed = new OciKmsCryptoProvider(provider.keyId, {
      encrypt: input => execute('encrypt',input), decrypt: input => execute('decrypt',input),
    },provider.encryptVersionId);
    const readiness = await initializeCredentialVaultForServer(process.env,{create:async()=>observed});
    assert.equal(await readiness.checkReadiness(),true);
    cases.push('PRODUCTION_MODE_CANONICAL_STARTUP_MANAGED_PROVIDER_READY');
    const statePath = join(process.env.RUNNER_TEMP!,'oci-federation-synthetic-owner.json');
    const value = 'SYNTHETIC_XROGA_FEDERATION_NO_LIVE_CREDENTIAL';
    let owner: string;
    if (mode === 'write') {
      const created = await db.auth.admin.createUser({email:`oci-federation-${randomUUID()}@example.invalid`,password:randomUUID()+randomUUID(),email_confirm:true});
      assert.equal(created.error,null);owner=created.data.user!.id;
      // Persist the cleanup identity before any credential write can occur.
      await writeFile(statePath,JSON.stringify({owner}),{mode:0o600,flag:'wx'});
      await saveUserProviderKey(owner,'groq',value);
      const row=await db.from('user_integrations').select('access_token,metadata').eq('user_id',owner).eq('provider','apikey_groq').single();
      assert.equal(row.error,null);assert.ok(row.data.access_token.startsWith('vault:v3:'));
      assert.ok(!JSON.stringify(row.data).includes(value));
      assert.equal(await getUserProviderKey(owner,'groq'),value);
      assert.equal(await getUserProviderKey(randomUUID(),'groq'),null);
      cases.push('REAL_POSTGRES_CANONICAL_WRITER_READER_ENCRYPTED_ONLY','FOREIGN_OWNER_CANNOT_READ_SYNTHETIC_RECORD');
    } else {
      const state=JSON.parse(await readFile(statePath,'utf8'));
      assert.match(state.owner,/^[a-f0-9-]{36}$/);owner=state.owner;
      try {
        assert.equal(await getUserProviderKey(owner,'groq'),value);
        cases.push('SEPARATE_PROCESS_COLD_START_RECOVERS_PERSISTED_MANAGED_CIPHERTEXT');
      } finally { assert.equal((await db.auth.admin.deleteUser(owner)).error,null); }
    }
  }
  passed=true;
} catch {
  // Provider errors can retain headers. Only publish the bounded receipt.
  process.exitCode=1;
} finally {
  const receipt={schemaVersion:1,status:passed?'PASS_BOUNDED_SCOPE':'FAIL',sourceSha:process.env.GITHUB_SHA,
    runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,mode,cases,receipts,
    scope:'ISOLATED_GITHUB_HOSTED_BACKEND_NOT_FLY_DEPLOYMENT_OR_LIVE_CUTOVER',timestamp:new Date().toISOString()};
  await writeFile(out,JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify(receipt));
}
}
void main().catch(()=>{console.error('Isolated workload probe admission failed. No custody acceptance claimed.');process.exitCode=1;});
