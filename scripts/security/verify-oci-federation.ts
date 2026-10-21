/** Opt-in isolated hosted-workload proof. No IAM writes or production database.
 * Receipts contain operation metadata only, never tokens or stored payloads. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createOciWorkloadFederation } from '../../backend/src/services/integrations/ociWorkloadFederation.js';
import { managedOciFederationConfiguration, initializeCredentialVaultForServer } from '../../backend/src/services/integrations/credentialVaultStartup.js';
import { createOciKmsCryptoProvider, OciKmsCryptoProvider, type OciKmsTransport } from '../../backend/src/services/integrations/ociKmsCryptoProvider.js';
import { saveUserProviderKey, getUserProviderKey } from '../../backend/src/services/integrations/userProviderKeys.js';

const mode = process.argv[2];
assert.ok(['bootstrap', 'write', 'read'].includes(mode ?? ''));
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
    const bridge = createOciWorkloadFederation(configuration, {maxExchanges:2,receipt: r => receipts.push(r)});
    try { await bridge.session(); cases.push('REAL_WORKLOAD_RPST_ISSUED_NO_KMS_GRANT'); }
    finally { bridge.stop(); }
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
      assert.ok(++calls <= 30, 'Per-process KMS request budget exhausted');
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
