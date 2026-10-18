/** Explicit CI integration suite: actual disposable Supabase/Auth/PG/PostgREST and API, no mocks. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import express from 'express';
import billingWebhookRouter from '../routes/billingWebhook.js';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext, type TenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile } from './ownership.js';
import { persistOwnedRun, persistOwnedRunAttempt, persistOwnedRuntimeSession, persistOwnedRunTrace } from './ownedRunPersistence.js';
import { listUserProviderKeys,getUserProviderKey,deleteUserProviderKey,resolveProviderEnvForDeploy } from '../services/integrations/userProviderKeys.js';
import { reconcileOrphanedRuns,failInFlightRuns } from '../ai/runReconciler.js';
import { getCachedResponse,setCachedResponse } from '../services/responseCache.js';
import { notifyBuildFailed } from '../services/notificationService.js';
import pg from 'pg';
import { SupabaseProjectRuntimeStore } from '../synthesis/projectRuntime/store.js';
import { listProjectRevisions, loadProjectRevision, restoreProjectRevision, forkProjectRevision } from '../synthesis/projectRuntime/projectHistory.js';
import { createCanonicalExecutionState,SupabaseExecutionStateStore } from '../ai/executionRuntime.js';
import { SupabaseUniversalStore } from '../synthesis/universalPersistence.js';
import { synthesizeUniversalProductSpec } from '../synthesis/universalProductSpec.js';
import { planArchitecture } from '../synthesis/architecturePlan.js';
import { buildOutcomeFromTerminalRun,SupabaseBuildOutcomeStore } from '../ai/buildOutcomeMemory.js';
import { createEvidence } from '../synthesis/researchEvidence.js';
import type { PlanMutation } from '../synthesis/dynamicPlanning.js';
import { BUILD_OUTCOME_RETENTION_MS } from '../ai/learningPolicy.js';
import { saveGitHubTokenToStorage,getGitHubTokenFromStorage } from '../services/integrations/githubTokenStore.js';
import { ensurePrivateOAuthBucket } from '../services/integrations/credentialStorageBucket.js';
import { clearGitHubConnection, getGitHubToken, saveGitHubConnection, saveGitHubSettings } from '../services/integrations/githubAuth.js';
import { clearVercelConnection, getVercelToken, saveVercelConnection } from '../services/integrations/vercelAuth.js';
import { clearPkceSession, clearProviderToken, consumePkceSession, loadProviderToken, storePkceSession, storeProviderToken } from '../services/integrations/oauthPkceStore.js';
import { reserveProviderBudget,settleProviderBudget } from '../ai/providerBudget.js';
import { captureAdmittedRunAttempt, createRunDurable, getRun, getRunAsync, listRunsForUserAsync, activeRunIds, resumeRunDurable, withRunAttempt, appendRunEvent, persistRunState } from '../ai/runStore.js';
import { GrowthService } from '../growth/growthService.js';
import { storeProjectFile } from '../services/storage/projectFiles.js';
import { ownedFile } from '../services/storage/privateFileDelivery.js';
import { signFileLink } from '../services/storage/fileDeliveryPolicy.js';
import { authorizedPreviewTarget } from '../synthesis/livePreview/access.js';
import type { LivePreviewGrant } from '../synthesis/livePreview/types.js';
import type { ProjectRuntimeSession } from '../synthesis/projectRuntime/types.js';
import { createLivePreviewGrant, getLivePreviewGrant, revokeLivePreviewGrants } from '../synthesis/livePreview/store.js';
import { BillingService } from '../services/BillingService.js';
import { buildUserSupabaseProvisionSql } from '../services/integrations/supabaseProvision.js';
import { registerProviderKeyRevisionTests } from './providerKeyRevision.local.integration.js';
import { registerOAuthSessionTests } from './oauthSession.local.integration.js';
import { registerBuildOutcomeAttemptTests } from './buildOutcomeAttempt.local.integration.js';
import { registerProjectCreationTests } from './projectCreation.local.integration.js';
import { registerProfileDeletionTests } from './profileDeletion.local.integration.js';
import { registerGrowthReferralTests } from './growthReferral.local.integration.js';
import { registerTerminalIdentityTests } from './terminalIdentity.local.integration.js';
import { registerExecutionCheckpointAttemptTests } from './executionCheckpointAttempt.local.integration.js';
import { registerQuotaEvidenceTests } from './quotaEvidence.local.integration.js';
import { registerUsageAccountingTests } from './usageAccounting.local.integration.js';
import { registerSystemErrorLogTests } from './systemErrorLog.local.integration.js';
import { registerWorkerRevisionTests } from './workerRevision.local.integration.js';
import { registerSoftwareCheckpointAttemptTests } from './softwareCheckpointAttempt.local.integration.js';
import { registerSupabaseBundleTests } from './supabaseBundle.local.integration.js';
import { registerProvisioningReceiptTests } from './provisioningReceipt.local.integration.js';
import { registerCommunityCommentUpdateTests } from '../community/commentUpdate.local.integration.js';
import { registerRecoveryMemoryReadTests } from './recoveryMemoryRead.local.integration.js';
import { registerCommunityPostMutationTests } from '../community/postMutation.local.integration.js';
import { registerCommunityRemainingMutationTests } from '../community/remainingMutations.local.integration.js';
import { registerCommunityReadTests } from '../community/reads.local.integration.js';
import { registerRepositorySnapshotTests } from './repositorySnapshot.local.integration.js';
import { registerRunTraceAttemptTests } from './runTraceAttempt.local.integration.js';
import { registerRuntimeTerminalTests } from './runtimeTerminal.local.integration.js';
import { registerRuntimeSecretReadTests } from './runtimeSecretRead.local.integration.js';
import { registerGrowthCampaignReceiptTests } from '../growth/campaignReceipt.local.integration.js';
import { registerGrowthDeliveryTests } from '../growth/delivery.local.integration.js';
import { registerRuntimeIdentityTests } from './runtimeIdentity.local.integration.js';
import { registerRuntimeProjectBindingTests } from './runtimeProjectBinding.local.integration.js';
import { registerGrowthIdentityTests } from '../growth/identity.local.integration.js';
import { registerBillingBudgetTests } from '../services/billingBudget.local.integration.js';
import { registerBuildProjectReceiptTests } from './buildProjectReceipt.local.integration.js';
import { registerGrowthEventReplayTests } from '../growth/eventReplay.local.integration.js';

if(process.env.CI !== 'true' || process.env.XB01_DISPOSABLE_SUPABASE !== '1' || process.env.SUPABASE_URL !== 'http://127.0.0.1:54321' || process.env.E2E_BACKEND_URL !== 'http://127.0.0.1:4000') throw new Error('Real disposable loopback services required; no hosted/prod fallback');
const url=process.env.SUPABASE_URL, api=process.env.E2E_BACKEND_URL;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const users: Array<{id:string;token:string;context:TenantContext;project:string;file:string;run:string;provider:string;session:string;cost:string}>=[];
registerProviderKeyRevisionTests(admin, () => users);
registerOAuthSessionTests(admin, () => users);
registerBuildOutcomeAttemptTests(admin, () => users);
registerProjectCreationTests(admin, () => users);
registerProfileDeletionTests(admin);
registerGrowthReferralTests(admin, () => users);
registerTerminalIdentityTests(admin, () => users);
registerExecutionCheckpointAttemptTests(admin, () => users);
registerQuotaEvidenceTests(admin);
registerUsageAccountingTests(admin);
registerSystemErrorLogTests(admin);
registerWorkerRevisionTests(admin, () => users);
registerSoftwareCheckpointAttemptTests(admin, () => users);
registerSupabaseBundleTests(admin, () => users);
registerProvisioningReceiptTests(admin);
registerCommunityCommentUpdateTests(admin);
registerRecoveryMemoryReadTests(admin);
registerCommunityPostMutationTests(admin);
registerCommunityRemainingMutationTests(admin);
registerCommunityReadTests(admin);
registerRepositorySnapshotTests(admin);
registerRunTraceAttemptTests(admin, () => users);
registerRuntimeTerminalTests(admin, () => users);
registerRuntimeSecretReadTests(admin, () => users);
registerGrowthCampaignReceiptTests(admin);
registerGrowthDeliveryTests(admin);
registerRuntimeIdentityTests(admin, () => users);
registerRuntimeProjectBindingTests(admin, () => users, request);
registerGrowthIdentityTests(admin);
registerBillingBudgetTests(admin);
registerBuildProjectReceiptTests(admin, () => users);
registerGrowthEventReplayTests(admin, () => users);
async function request(path:string,token?:string,method='GET',body?:unknown) {
  return fetch(`${api}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
async function insert(table:string,row:Record<string,unknown>,key='id'):Promise<string> {
  const result=await admin.from(table).insert(row).select(key).single();
  assert.equal(result.error,null,`fixture insert ${table} failed`);
  return String((result.data as unknown as Record<string,unknown>)[key]);
}
before(async()=>{
  for(let index=0;index<2;index++) {
    const email=`xb01-tenant-${randomUUID()}@example.invalid`,password=`Ci!${randomUUID()}Aa9`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
    const id=created.data.user.id;
    // Register cleanup immediately even if a later provisioning assertion fails.
    const fixture={id,token:'',context:createTenantContext({userId:id,via:'remote_getuser'}),project:'',file:'',run:'',provider:'',session:'',cost:''};users.push(fixture);
    const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.ok(login.data.session);
    fixture.token=login.data.session.access_token;
    const verified=await admin.auth.getUser(fixture.token);assert.equal(verified.error,null);assert.equal(verified.data.user?.id,id);
    fixture.project=await insert('projects',{user_id:id,name:'Isolated tenant fixture',type:'app'});
    fixture.file=await insert('project_files',{project_id:fixture.project,file_name:'fixture.txt',content:'fictional test data'});
    fixture.run=await insert('swarm_runs',{user_id:id,prompt:'Fixture only',status:'pending'});
    fixture.provider=await insert('user_integrations',{user_id:id,provider:'apikey_openai',access_token:'SYNTHETIC_PRIVATE_CANARY_NOT_A_CREDENTIAL',metadata:{provider:'openai',masked:'••••',connected_at:new Date().toISOString()}});
    fixture.session=await insert('project_runtime_sessions',{session_id:randomUUID(),user_id:id,project_id:fixture.project,provider_id:'fixture-no-execution',runtime_class:'interactive',status:'stopped',state:{}},'session_id');
    fixture.cost=await insert('ai_usage_ledger',{user_id:id,model_id:'fixture-no-provider',pool_role:'test',cost_usd:0});
  }
});
after(async()=>{for(const user of users){
  const before=await admin.from('production_audit_log').select('*').eq('user_id',user.id).order('id');assert.equal(before.error,null);
  const deleted=await admin.auth.admin.deleteUser(user.id);assert.equal(deleted.error,null,'temporary fixture cleanup failed');
  const retained=await admin.from('production_audit_log').select('*').eq('user_id',user.id).order('id');assert.equal(retained.error,null);
  assert.deepEqual(retained.data,before.data,'Account deletion must preserve audit evidence unchanged');
}});

test('real owner helpers deny every foreign high-risk resource without enumerating data',async()=>{
  const [owner,other]=users;
  for(const [kind,key] of [['project','project'],['run','run'],['provider_connection','provider'],['runtime_session','session'],['cost_record','cost']] as const) {
    await requireOwnedResource(owner.context,kind,owner[key],admin);
    await assert.rejects(requireOwnedResource(owner.context,kind,other[key],admin),{status:404});
  }
  await requireOwnedFile(owner.context,owner.file,admin);
  await assert.rejects(requireOwnedFile(owner.context,other.file,admin),{status:404});
});

test('avatar Storage accepts owner folders and denies foreign writes without changing bytes',async()=>{
  const [owner,other]=users;
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const ownPath=`${owner.id}/${randomUUID()}.png`,foreignPath=`${other.id}/${randomUUID()}.png`;
  const body=Buffer.from('synthetic-avatar-fixture');
  try {
    const owned=await client.storage.from('avatars').upload(ownPath,body,{contentType:'image/png',upsert:false});assert.equal(owned.error,null);
    const denied=await client.storage.from('avatars').upload(foreignPath,body,{contentType:'image/png',upsert:false});assert.ok(denied.error);
    const missing=await admin.storage.from('avatars').download(foreignPath);assert.ok(missing.error);
    const seed=await admin.storage.from('avatars').upload(foreignPath,body,{contentType:'image/png',upsert:false});assert.equal(seed.error,null);
    const overwrite=await client.storage.from('avatars').update(foreignPath,Buffer.from('forbidden'),{contentType:'image/png'});assert.ok(overwrite.error);
    const retained=await admin.storage.from('avatars').download(foreignPath);assert.equal(retained.error,null);assert.equal(await retained.data!.text(),body.toString());
  } finally {
    const cleanup=await admin.storage.from('avatars').remove([ownPath,foreignPath]);assert.equal(cleanup.error,null);
  }
});

test('named custom credentials bind reads and deletion to the exact owner and provider',async()=>{
  const [owner,other]=users;
  assert.equal(await ensurePrivateOAuthBucket(),true);
  const suffix=randomUUID().replaceAll('-','');
  const first=`custom_first_${suffix}`,second=`custom_second_${suffix}`;
  const encoded=(value:string)=>`enc:${Buffer.from(`fixture:${value}`).toString('base64')}`;
  const rows=[
    {user_id:owner.id,provider:`apikey_${first}`,access_token:encoded('SYNTHETIC_FIRST_KEY')},
    {user_id:owner.id,provider:`apikey_${second}`,access_token:encoded('SYNTHETIC_SECOND_KEY')},
    {user_id:other.id,provider:`apikey_${second}`,access_token:encoded('SYNTHETIC_FOREIGN_KEY')},
  ];
  const inserted=await admin.from('user_integrations').insert(rows);assert.equal(inserted.error,null);
  try {
    assert.equal(await getUserProviderKey(owner.id,first),'SYNTHETIC_FIRST_KEY');
    assert.equal(await getUserProviderKey(owner.id,second),'SYNTHETIC_SECOND_KEY');
    assert.equal(await getUserProviderKey(other.id,second),'SYNTHETIC_FOREIGN_KEY');
    assert.equal(await getUserProviderKey(owner.id,`custom_absent_${suffix}`),null);
    await deleteUserProviderKey(owner.context,second);
    // Model a delayed legacy mirror write AFTER revocation. It must not restore
    // credential access or deployment selection while the durable denial exists.
    const mirror=`${owner.id}/vault-apikey_${second}.json`;
    const delayed=await admin.storage.from('xroga-github-tokens').upload(mirror,JSON.stringify({access_token:encoded('SYNTHETIC_RESURRECTION_CANARY'),metadata:{provider:second,env_var:'REVOCATION_CANARY'}}),{upsert:true,contentType:'application/json'});assert.equal(delayed.error,null);
    assert.equal(await getUserProviderKey(owner.id,second),null);
    assert.ok(!(await listUserProviderKeys(owner.id)).some(key=>key.provider===second));
    assert.equal((await resolveProviderEnvForDeploy(owner.id)).REVOCATION_CANARY,undefined);
    assert.equal(await getUserProviderKey(owner.id,first),'SYNTHETIC_FIRST_KEY');
    assert.equal(await getUserProviderKey(other.id,second),'SYNTHETIC_FOREIGN_KEY');
  } finally {
    const mirrorCleanup=await admin.storage.from('xroga-github-tokens').remove([`${owner.id}/vault-apikey_${second}.json`]);assert.equal(mirrorCleanup.error,null);
    const cleanup=await admin.from('user_integrations').delete().in('user_id',[owner.id,other.id]).in('provider',[`apikey_${first}`,`apikey_${second}`]);assert.equal(cleanup.error,null);
  }
});

test('real community API rejects cross-author mixed-field privilege escalation without partial writes',async()=>{
  const [postOwner,author]=users;
  const postId=await insert('community_posts',{author_id:postOwner.id,category:'question',title:'Synthetic authorization question',body:'Isolated test content, not a user post.'});
  try {
    const commentId=await insert('community_comments',{post_id:postId,author_id:author.id,body:'Original synthetic answer'});
    const path=`/api/community/comments/${commentId}`;
    const original={body:'Original synthetic answer',is_hidden:false,is_accepted_answer:false};
    for(const patch of [{body:'forged answer',isAcceptedAnswer:true},{isHidden:true,isAcceptedAnswer:true},{body:'forged answer',isHidden:true,isAcceptedAnswer:false}]) {
      const denied=await request(path,postOwner.token,'PATCH',patch);assert.equal(denied.status,403);
      const row=await admin.from('community_comments').select('body,is_hidden,is_accepted_answer').eq('id',commentId).single();
      assert.equal(row.error,null);assert.deepEqual(row.data,original);
    }
    assert.equal((await request(path,undefined,'PATCH',{body:'anonymous'})).status,401);
    assert.equal((await request(path,author.token,'PATCH',{body:'self approval',isAcceptedAnswer:true})).status,403);
    assert.equal((await request(path,postOwner.token,'PATCH',{isAcceptedAnswer:true})).status,204);
    assert.equal((await request(path,author.token,'PATCH',{body:'Author approved edit'})).status,204);
    const final=await admin.from('community_comments').select('body,is_hidden,is_accepted_answer').eq('id',commentId).single();
    assert.equal(final.error,null);assert.deepEqual(final.data,{body:'Author approved edit',is_hidden:false,is_accepted_answer:true});
  } finally {assert.equal((await admin.from('community_posts').delete().eq('id',postId).eq('author_id',postOwner.id)).error,null);}
});

test('real revision restore rejects mismatched snapshot identities before restore or fork writes',async()=>{
  const [owner,other]=users,store=new SupabaseProjectRuntimeStore();
  const projectId=`revision-binding-${randomUUID()}`,runId=randomUUID();
  // Only identity restoration is exercised; no fixture is executed or sent to a provider.
  const snapshot={projectId,runId,contract:{projectId,runId},workspace:{files:[]}};
  // Deliberately partial identity fixture, not full software-project validation.
  const saved=await store.saveRevision(owner.id,snapshot as unknown as Parameters<typeof store.saveRevision>[1]);
  const revisionId=saved.revisionId;
  assert.deepEqual(saved.project,snapshot);
  assert.equal(saved.userId,owner.id);assert.equal(saved.projectId,projectId);assert.equal(saved.runId,runId);
  assert.ok(saved.revisionNumber>0);
  try {
    assert.deepEqual((await store.loadLatestRevision(owner.id,projectId))?.project,snapshot);
    assert.equal((await loadProjectRevision(owner.id,projectId,revisionId))?.revisionId,revisionId);
    assert.equal((await listProjectRevisions(owner.id,projectId)).length,1);
    assert.equal(await store.loadLatestRevision(other.id,projectId),null);
    assert.equal(await loadProjectRevision(other.id,projectId,revisionId),null);
    assert.deepEqual(await listProjectRevisions(other.id,projectId),[]);
    for(const mutation of [{...snapshot,projectId:other.project},{...snapshot,runId:'foreign-run'},{...snapshot,contract:{...snapshot.contract,projectId:other.project}},{...snapshot,contract:{...snapshot.contract,runId:'foreign-run'}}]) {
      assert.equal((await admin.from('project_runtime_revisions').update({software_project:mutation}).eq('revision_id',revisionId)).error,null);
      assert.equal(await store.loadLatestRevision(owner.id,projectId),null);
      await assert.rejects(loadProjectRevision(owner.id,projectId,revisionId),{status:404});
      await assert.rejects(listProjectRevisions(owner.id,projectId),{status:404});
      await assert.rejects(restoreProjectRevision({userId:owner.id,projectId,revisionId,runId:randomUUID()}),{status:404});
      await assert.rejects(forkProjectRevision({userId:owner.id,sourceProjectId:projectId,revisionId,newProjectId:projectId,runId:randomUUID()}),{status:404});
      const records=await admin.from('project_runtime_revisions').select('revision_id').eq('user_id',owner.id).eq('project_id',projectId);
      assert.equal(records.error,null);assert.deepEqual(records.data,[{revision_id:revisionId}]);
      const events=await admin.from('project_runtime_events').select('event_id').eq('user_id',owner.id).eq('project_id',projectId);
      assert.equal(events.error,null);assert.deepEqual(events.data,[]);
    }
  } finally {assert.equal((await admin.from('project_runtime_revisions').delete().eq('revision_id',revisionId).eq('user_id',owner.id)).error,null);}
});

test('real durable preview session cannot resolve a misbound owner/project or stale capability', async () => {
  const [owner, other] = users;
  const now = Date.now(), sessionId = randomUUID();
  const store = new SupabaseProjectRuntimeStore();
  const session: ProjectRuntimeSession = {
    schemaVersion: '1.0.0', sessionId, userId: owner.id, projectId: owner.project,
    providerId: 'fixture-no-execution', runtimeClass: 'interactive', status: 'running', image: null,
    workspaceRevision: 1, knownFiles: [], processes: [],
    ports: [{ port: 3000, protocol: 'http', processId: 'fixture', status: 'declared' }],
    providerState: { machineId: 'abc123', app: 'xroga-synthetic-runtime' },
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
  };
  await store.saveSession(session);
  const restored = await store.loadSession(owner.id, sessionId);
  assert.ok(restored);
  assert.equal(await store.loadSession(other.id, sessionId), null);
  const grant: LivePreviewGrant = { previewId: randomUUID(), userId: owner.id, projectId: owner.project, sessionId, runId: 'fixture-run', kind: 'browser', port: 3000, expiresAt: new Date(now + 60_000).toISOString(), revokedAt: null, createdAt: new Date(now).toISOString() };
  assert.ok(authorizedPreviewTarget(grant, restored, now));
  assert.equal(authorizedPreviewTarget({ ...grant, userId: other.id }, restored, now), null);
  assert.equal(authorizedPreviewTarget({ ...grant, projectId: other.project }, restored, now), null);
  assert.equal(authorizedPreviewTarget({ ...grant, port: 4000 }, restored, now), null);
  assert.equal(authorizedPreviewTarget({ ...grant, revokedAt: new Date(now).toISOString() }, restored, now), null);
  assert.equal(authorizedPreviewTarget(grant, restored, now + 120_001), null);
  const input = { userId: owner.id, projectId: owner.project, sessionId, runId: 'fixture-run', kind: 'browser' as const, port: 3000, expiresAt: grant.expiresAt };
  await assert.rejects(createLivePreviewGrant({ ...input, userId: other.id }), { status: 404 });
  await assert.rejects(createLivePreviewGrant({ ...input, projectId: other.project }), { status: 404 });
  const saved = await createLivePreviewGrant(input);
  assert.ok(await getLivePreviewGrant(saved.previewId));
  await revokeLivePreviewGrants({ userId: other.id, projectId: owner.project, sessionId });
  assert.equal((await getLivePreviewGrant(saved.previewId))?.revokedAt, null);
  await revokeLivePreviewGrants({ userId: owner.id, projectId: owner.project, sessionId });
  assert.ok((await getLivePreviewGrant(saved.previewId))?.revokedAt);
});
test('actual API ignores client owner and rejects foreign project/file access and unsigned requests',async()=>{
  const [owner,other]=users;
  for(const path of [`/api/projects/${other.project}`,`/api/projects/${other.project}/files`,`/api/projects/${other.project}/code`]) assert.equal((await request(path,owner.token)).status,404);
  const ownFiles=await request(`/api/projects/${owner.project}/files`,owner.token);assert.equal(ownFiles.status,200);
  const files=await ownFiles.json() as Array<{id:string;project_id:string;projects?:unknown}>;
  assert.ok(files.some(row=>row.id===owner.file));assert.ok(files.every(row=>row.project_id===owner.project && row.projects===undefined));
  const codeId=await insert('project_files',{project_id:owner.project,file_name:'owner-read-fixture.ts',file_type:'code',content:'synthetic owned code'});
  const ownCode=await request(`/api/projects/${owner.project}/code`,owner.token);assert.equal(ownCode.status,200);
  const code=await ownCode.json() as {files:Array<{id:string;project_id:string;projects?:unknown}>};
  assert.ok(code.files.some(row=>row.id===codeId));assert.ok(code.files.every(row=>row.project_id===owner.project && row.projects===undefined));
  assert.equal((await request('/api/projects')).status,401);
  const created=await request('/api/projects',owner.token,'POST',{name:'Ignored client owner',type:'app',user_id:other.id,userId:other.id});
  assert.equal(created.status,201);
  const payload: unknown = await created.json();
  assert.ok(payload && typeof payload === 'object' && 'user_id' in payload);
  assert.equal(payload.user_id,owner.id);
});

test('real durable database file delivery is owner-only, bounded, expiring and atomically revocable',async()=>{
  const [owner,other]=users;
  const saved=await storeProjectFile(owner.id,owner.project,'private-fixture.txt','PRIVATE_FILE_FIXTURE_ONLY','text/plain','other');
  const path=`/api/projects/${owner.project}/files/${saved.id}`;
  assert.equal((await request(`${path}/download`)).status,401);
  for(const suffix of ['/download','/link','/links'])assert.equal((await request(`${path}${suffix}`,other.token,suffix==='/link'?'POST':suffix==='/links'?'DELETE':'GET',suffix==='/link'?{}:undefined)).status,404);
  const direct=await request(`${path}/download`,owner.token);assert.equal(direct.status,200);assert.equal(await direct.text(),'PRIVATE_FILE_FIXTURE_ONLY');
  assert.match(direct.headers.get('cache-control')!,/no-store/);assert.equal(direct.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await request(`${path}/link`,owner.token,'POST',{expiresIn:301})).status,400);
  assert.equal((await request(`${path}/link`,owner.token,'POST',{expiresIn:60,userId:other.id})).status,400);
  const created=await request(`${path}/link`,owner.token,'POST',{expiresIn:60});assert.equal(created.status,200);
  const link=await created.json() as {url:string;expiresAt:string};
  const token=new URL(link.url,'http://127.0.0.1').searchParams.get('link')!;assert.ok(token);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,owner.token)).status,200);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,other.token)).status,404);
  assert.equal((await request(`${path}/download?link=`,owner.token)).status,404);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token.slice(0,-3)+'abc')}`,owner.token)).status,404);
  const row=await ownedFile(owner.context,owner.project,saved.id,admin);
  const expired=await signFileLink(owner.context,row,1,Date.now()-10_000);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(expired.token)}`,owner.token)).status,404);
  const revocations=await Promise.all(Array.from({length:4},()=>request(`${path}/links`,owner.token,'DELETE')));
  assert.ok(revocations.every(response=>response.status===200));
  const updated=await admin.from('project_files').select('delivery_version').eq('id',saved.id).single();assert.equal(updated.error,null);assert.equal(updated.data?.delivery_version,row.delivery_version+4);
  assert.ok((await admin.from('project_files').update({delivery_version:row.delivery_version}).eq('id',saved.id)).error);
  assert.equal((await request(`${path}/download?link=${encodeURIComponent(token)}`,owner.token)).status,404);
  assert.equal((await request(`${path}/download`,owner.token)).status,200);
  const range=await fetch(`${api}${path}/download`,{headers:{Authorization:`Bearer ${owner.token}`,Range:'bytes=0-6'}});assert.equal(range.status,206);assert.equal(await range.text(),'PRIVATE');
  assert.equal((await fetch(`${api}${path}/download`,{headers:{Authorization:`Bearer ${owner.token}`,Range:'bytes=999-1000'}})).status,416);
});

test('real RLS and metadata trigger deny client delivery forgery while preserving allowed owner inserts and server edits',async()=>{
  const [owner,other]=users;
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const ownRead=await client.from('project_files').select('id').eq('id',owner.file);assert.equal(ownRead.error,null);assert.equal(ownRead.data?.length,1);
  const ownInsert=await client.from('project_files').insert({project_id:owner.project,file_name:'legitimate isolated insert',content:'owner fixture'}).select('id');assert.equal(ownInsert.error,null);assert.equal(ownInsert.data?.length,1);
  // The complete historical chain permits browser SELECT/INSERT, NOT UPDATE.
  // Preserve that denial; never add a permissive policy to satisfy a mistaken fixture.
  const ownEdit=await client.from('project_files').update({content:'forbidden client edit'}).eq('id',owner.file).select('id');assert.equal(ownEdit.error,null);assert.equal(ownEdit.data?.length,0);
  await ownedFile(owner.context,owner.project,owner.file,admin);
  const serverEdit=await admin.from('project_files').update({content:'legitimate server edit'}).eq('id',owner.file).eq('project_id',owner.project).select('id');assert.equal(serverEdit.error,null);assert.equal(serverEdit.data?.length,1);
  const foreignEdit=await client.from('project_files').update({content:'forbidden edit'}).eq('id',other.file).select('id');assert.equal(foreignEdit.error,null);assert.equal(foreignEdit.data?.length,0);
  for(const patch of [{delivery_version:9},{storage_metadata:{provider:'database',ownerId:owner.id}}]) {
    const denied=await client.from('project_files').update(patch).eq('id',owner.file).select('id');
    assert.ok(denied.error || denied.data?.length===0);
    const preserved=await admin.from('project_files').select('delivery_version,storage_metadata,content').eq('id',owner.file).single();assert.equal(preserved.error,null);
    assert.equal(preserved.data?.delivery_version,1);assert.equal(preserved.data?.storage_metadata,null);assert.equal(preserved.data?.content,'legitimate server edit');
  }
  assert.ok((await client.from('project_files').insert({project_id:owner.project,file_name:'forged',storage_metadata:{ownerId:owner.id}})).error);
  assert.ok((await client.from('project_files').insert({project_id:other.project,file_name:'foreign'})).error);
  assert.ok((await client.rpc('revoke_project_file_links',{p_project_id:owner.project,p_file_id:owner.file,p_owner_id:owner.id})).error);
  const anon=createClient(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ok((await anon.rpc('revoke_project_file_links',{p_project_id:owner.project,p_file_id:owner.file,p_owner_id:owner.id})).error);
  const mismatch=await admin.from('project_files').update({storage_metadata:{ownerId:other.id}}).eq('id',owner.file);assert.ok(mismatch.error);
  const foreign=await admin.rpc('revoke_project_file_links',{p_project_id:other.project,p_file_id:other.file,p_owner_id:owner.id});assert.equal(foreign.error,null);assert.equal(foreign.data,null);
});

test('unconfigured binary storage issues no durable receipt and legacy public or data URLs are not delivered',async()=>{
  const [owner]=users;
  assert.equal(process.env.CLOUDFLARE_R2_PRIVATE_BUCKET,undefined);
  const filename=`missing-private-store-${randomUUID()}.bin`;
  await assert.rejects(storeProjectFile(owner.id,owner.project,filename,Buffer.from('FICTIONAL_BINARY'),'application/octet-stream','other'),{status:503});
  const rows=await admin.from('project_files').select('id').eq('project_id',owner.project).eq('file_name',filename);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);
  for(const file_url of ['https://public.example.invalid/private-object','data:text/plain,NOT_DURABLE']) {
    const id=await insert('project_files',{project_id:owner.project,file_name:'legacy-no-private-copy',file_url,content:null});
    const delivery=await request(`/api/projects/${owner.project}/files/${id}/download`,owner.token);assert.equal(delivery.status,503);
    const safe=await delivery.text();assert.ok(!safe.includes(file_url));assert.ok(!safe.includes('stack'));
    assert.equal((await request(`/api/projects/${owner.project}/files/${id}/link`,owner.token,'POST',{})).status,503);
    const listing=await request(`/api/projects/${owner.project}/files`,owner.token);const list=await listing.json() as Array<Record<string,unknown>>;
    const record=list.find(row=>row.id===id)!;assert.equal(record.file_url,null);assert.ok(!('storage_metadata' in record));assert.ok(!('delivery_version' in record));
  }
});
test('real run persistence concurrent collision never transfers the durable owner',async()=>{
  const [owner,other]=users,id=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>persistOwnedRun(admin,user.context,{id,user_id:user.id,prompt:'Concurrent fixture',status:'pending'})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const stored=await admin.from('swarm_runs').select('user_id').eq('id',id).single();assert.equal(stored.error,null);
  assert.ok([owner.id,other.id].includes(stored.data!.user_id));
  const loser=users.find(user=>user.id!==stored.data!.user_id)!;
  await assert.rejects(persistOwnedRun(admin,loser.context,{id,user_id:loser.id,prompt:'Forbidden overwrite',status:'failed'}),{status:404});
  const unchanged=await admin.from('swarm_runs').select('user_id,status').eq('id',id).single();assert.equal(unchanged.data?.user_id,stored.data!.user_id);assert.equal(unchanged.data?.status,'pending');
});

test('canonical execution store denies foreign overwrite and corrupt resume state against real database',async()=>{
  const admittedStore=async(user:{id:string},id:string)=>withRunAttempt(async()=>{
    await createRunDurable(user.id,'Synthetic checkpoint fixture',id);
    return new SupabaseExecutionStateStore(user.id,captureAdmittedRunAttempt(id,user.id));
  });
  const [owner,other]=users,runId=randomUUID(),foreignStore=await admittedStore(other,runId),ownStore=new SupabaseExecutionStateStore(owner.id);
  const state=createCanonicalExecutionState({runId,projectId:other.project,files:[{path:'private.txt',content:'FOREIGN_EXECUTION_STATE_CANARY'}]});
  await foreignStore.save(state);
  await assert.rejects(ownStore.save(createCanonicalExecutionState({runId,projectId:owner.project})),{code:'RUN_STATE_CONFLICT'});
  assert.equal(await ownStore.load(runId),null);
  const preserved=await foreignStore.load(runId);assert.ok(JSON.stringify(preserved).includes('FOREIGN_EXECUTION_STATE_CANARY'));
  for(const mutation of [{runId:randomUUID()},{projectId:owner.project}]) {
    assert.equal((await admin.from('execution_runs').update({state:{...state,...mutation}}).eq('run_id',runId)).error,null);
    assert.equal(await foreignStore.load(runId),null);
  }
  assert.equal((await admin.from('execution_runs').update({state}).eq('run_id',runId)).error,null);
  const collision=randomUUID();
  const winner=await admittedStore(owner,collision);
  const outcomes=await Promise.allSettled([winner.save(createCanonicalExecutionState({runId:collision,projectId:owner.project})),new SupabaseExecutionStateStore(other.id).save(createCanonicalExecutionState({runId:collision,projectId:other.project}))]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const actual=await admin.from('execution_runs').select('user_id').eq('run_id',collision).single();assert.equal(actual.error,null);assert.equal(actual.data?.user_id,owner.id);
});

test('real universal spec and plan collision cannot transfer ownership or reference a foreign parent',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context);
  const actor={userId:owner.id,projectId:owner.project},attacker={userId:other.id,projectId:owner.project};
  const spec=synthesizeUniversalProductSpec({prompt:'Build a fictional task API'}),plan=planArchitecture({spec});
  assert.equal((await a.saveSpec(actor,spec)).saved,true);
  assert.equal((await b.saveSpec(attacker,spec)).saved,false);
  const specId=`${owner.project}:${spec.createdAt}`;
  const row=await admin.from('project_specs').select('user_id').eq('spec_id',specId).single();assert.equal(row.error,null);assert.equal(row.data?.user_id,owner.id);
  assert.equal(await b.loadLatestSpec(attacker),null);
  assert.equal((await a.savePlan(actor,plan,specId)).saved,true);
  assert.equal((await b.savePlan(attacker,plan,specId)).saved,false);
  assert.equal((await b.savePlan(attacker,plan)).saved,false);
  const persisted=await admin.from('architecture_plans').select('user_id,spec_id').eq('plan_id',`${owner.project}:${plan.createdAt}`).single();assert.equal(persisted.error,null);assert.equal(persisted.data?.user_id,owner.id);assert.equal(persisted.data?.spec_id,specId);
});

test('real repository index cannot be read deleted overwritten or have children removed by another tenant',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context);
  const identity={projectId:owner.project,repositoryId:'fixture/local',repositoryOwner:'fixture',repositoryName:'local',branch:'main'};
  const index={identity,schemaVersion:'1.0.0',indexedCommitSha:'fixture-no-real-commit',treeSha:null,files:[{
    filePath:'private.txt',blobSha:'fixture-no-real-blob',summary:'PRIVATE_INDEX_CANARY',language:null,size:0,binary:false,
    componentRoot:null,componentAdapterId:null,workspaceRoot:null,symbols:[],imports:[],exports:[],embeddingRef:null,updatedAt:new Date().toISOString(),
  }],updatedAt:new Date().toISOString()};
  await a.save(index);
  const id=`${identity.projectId}:${identity.repositoryId}:${identity.branch}`;
  const savedFile=await admin.from('repository_index_files').select('id').eq('index_id',id).eq('user_id',owner.id).single();assert.equal(savedFile.error,null);const file=savedFile.data!.id;
  assert.equal(await b.load(identity),null);await b.delete(identity);
  await assert.rejects(b.save({...index,indexedCommitSha:'Forbidden overwrite'}),{status:404});
  const row=await admin.from('repository_indexes').select('user_id,indexed_commit_sha').eq('index_id',id).single();assert.equal(row.error,null);assert.equal(row.data?.user_id,owner.id);assert.equal(row.data?.indexed_commit_sha,'fixture-no-real-commit');
  const child=await admin.from('repository_index_files').select('id,summary').eq('id',file).single();assert.equal(child.error,null);assert.equal(child.data?.summary,'PRIVATE_INDEX_CANARY');
  assert.ok((await a.load(identity))?.files.some(entry=>entry.summary==='PRIVATE_INDEX_CANARY'));
});

test('real sanitized outcome learning record cannot transfer owner on a run-ID collision',async()=>{
  const [owner,other]=users,store=new SupabaseBuildOutcomeStore(),runId=randomUUID();
  const outcome=buildOutcomeFromTerminalRun({runId,userId:other.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]});
  await store.upsert(outcome);
  await assert.rejects(store.upsert({...outcome,userId:owner.id}),{status:404});
  const existing=await admin.from('build_outcomes').select('user_id,terminal_status').eq('run_id',runId).single();assert.equal(existing.error,null);assert.equal(existing.data?.user_id,other.id);assert.equal(existing.data?.terminal_status,'error');
  const collision=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>store.upsert(buildOutcomeFromTerminalRun({runId:collision,userId:user.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}))));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const persisted=await admin.from('build_outcomes').select('user_id').eq('run_id',collision).single();assert.equal(persisted.error,null);assert.ok(users.some(user=>user.id===persisted.data?.user_id));
});

test('real research parent and evidence collisions preserve source ownership and reject mismatched linkage',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context),foreignRun=randomUUID();
  const evidence=createEvidence({researchRunId:foreignRun,provider:'fixture',query:'Fictional only',sourceUrl:'https://example.invalid/fixture',content:'Fictional research canary',fact:'Fictional research canary',freshnessClass:'version_sensitive',conflictGroup:'fixture'});
  assert.equal((await b.saveResearchEvidence({userId:other.id,projectId:other.project},foreignRun,[evidence])).saved,true);
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},foreignRun,[evidence])).saved,false);
  const ownRun=randomUUID();
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},ownRun,[evidence])).saved,false);
  // Matching own parent does not authorize an evidence ID belonging to someone else.
  assert.equal((await a.saveResearchEvidence({userId:owner.id,projectId:owner.project},ownRun,[{...evidence,researchRunId:ownRun}])).saved,false);
  const parent=await admin.from('research_runs').select('user_id').eq('research_run_id',foreignRun).single();assert.equal(parent.error,null);assert.equal(parent.data?.user_id,other.id);
  const child=await admin.from('research_evidence').select('user_id,research_run_id,fact').eq('evidence_id',evidence.evidenceId).single();assert.equal(child.error,null);assert.equal(child.data?.user_id,other.id);assert.equal(child.data?.research_run_id,foreignRun);assert.equal(child.data?.fact,'Fictional research canary');
});

test('real planning mutation replay is append-only and a foreign collision is not reported as saved',async()=>{
  const [owner,other]=users,a=new SupabaseUniversalStore(admin,owner.context),b=new SupabaseUniversalStore(admin,other.context),runId=randomUUID();
  const mutation:PlanMutation={schemaVersion:'1.0.0',mutationKey:randomUUID(),kind:'add_task',runId,triggeredByTaskId:null,reason:'OWNER_MUTATION_CANARY',evidence:[],at:new Date().toISOString(),payload:{fixture:'no execution'}};
  const actor={userId:owner.id,projectId:owner.project},attacker={userId:other.id,projectId:other.project};
  assert.equal((await a.saveMutations(actor,runId,[mutation])).saved,true);
  assert.equal((await a.saveMutations(actor,runId,[{...mutation,reason:'Forbidden replay change'}])).saved,true);
  assert.equal((await b.saveMutations(attacker,runId,[mutation])).saved,false);
  assert.equal((await a.saveMutations(actor,randomUUID(),[mutation])).saved,false);
  assert.equal((await a.saveMutations({...actor,projectId:randomUUID()},runId,[mutation])).saved,false);
  assert.deepEqual(await b.loadMutations(attacker,runId),[]);
  assert.deepEqual(await a.loadMutations({...actor,projectId:randomUUID()},runId),[]);
  assert.equal((await a.loadMutations(actor,runId)).length,1);
  const stored=await admin.from('plan_mutations').select('user_id,reason').eq('mutation_key',mutation.mutationKey).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.reason,'OWNER_MUTATION_CANARY');
});

test('real outcome retention deletes only expired records owned by its captured actor',async()=>{
  const [owner,other]=users,store=new SupabaseBuildOutcomeStore(),ids=[randomUUID(),randomUUID()];
  const old=new Date(Date.now()-BUILD_OUTCOME_RETENTION_MS-86400000).toISOString();
  for(let index=0;index<users.length;index++)await store.upsert(buildOutcomeFromTerminalRun({runId:ids[index],userId:users[index].id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}));
  assert.equal((await admin.from('build_outcomes').update({updated_at:old}).in('run_id',ids)).error,null);
  const expired=await admin.from('build_outcomes').select('run_id,updated_at').in('run_id',ids);assert.equal(expired.error,null);assert.equal(expired.data?.length,2);assert.ok(expired.data?.every(row=>Date.parse(row.updated_at)<Date.now()-BUILD_OUTCOME_RETENTION_MS));
  await store.upsert(buildOutcomeFromTerminalRun({runId:randomUUID(),userId:owner.id,terminalStatus:'error',iterationCount:0,output:null,routingOutcomes:[]}));
  const own=await admin.from('build_outcomes').select('run_id').eq('run_id',ids[0]).maybeSingle();assert.equal(own.error,null);assert.equal(own.data,null);
  const foreign=await admin.from('build_outcomes').select('run_id,user_id').eq('run_id',ids[1]).single();assert.equal(foreign.error,null);assert.equal(foreign.data?.user_id,other.id);
});
test('real terminal autosave collision denies foreign id and preserves transcript',async()=>{
  const [owner,other]=users,id=`fixture-${randomUUID()}`;
  const row={githubRepoName:'fixture/local',messages:[{role:'user',content:'Private fixture'}],title:'Owner fixture'};
  assert.equal((await request(`/api/terminal-sessions/${id}`,owner.token,'PUT',row)).status,200);
  const denied=await request(`/api/terminal-sessions/${id}`,other.token,'PUT',{...row,title:'Forbidden takeover',userId:owner.id});assert.equal(denied.status,404);
  assert.equal((await request(`/api/terminal-sessions/${id}`,other.token)).status,404);
  const stored=await admin.from('terminal_sessions').select('user_id,title,messages').eq('id',id).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.title,'Owner fixture');
});

test('real run trace collision and concurrent creation preserve trace ownership and private evidence',async()=>{
  const [owner,other]=users;
  await persistOwnedRunTrace(admin,other.context,{run_id:other.run,user_id:other.id,stages:[{message:'FOREIGN_TRACE_CANARY'}],meta:{fixture:true}});
  await assert.rejects(persistOwnedRunTrace(admin,owner.context,{run_id:other.run,user_id:owner.id,stages:[{message:'Forbidden overwrite'}],meta:{}}),{status:404});
  const unchanged=await admin.from('swarm_run_traces').select('user_id,stages').eq('run_id',other.run).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.user_id,other.id);assert.ok(JSON.stringify(unchanged.data?.stages).includes('FOREIGN_TRACE_CANARY'));
  const run_id=randomUUID();
  const outcomes=await Promise.allSettled(users.map(user=>persistOwnedRunTrace(admin,user.context,{run_id,user_id:user.id,stages:[],meta:{}})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const persisted=await admin.from('swarm_run_traces').select('user_id').eq('run_id',run_id).single();assert.equal(persisted.error,null);assert.ok(users.some(user=>user.id===persisted.data?.user_id));
});
test('existing runtime session persistence cannot take over a foreign durable session',async()=>{
  const [owner,other]=users;
  await assert.rejects(persistOwnedRuntimeSession(admin,owner.context,{session_id:other.session,user_id:owner.id,project_id:owner.project,provider_id:'fixture-no-execution',runtime_class:'interactive',status:'failed',state:{}}),{status:404});
  const row=await admin.from('project_runtime_sessions').select('user_id,status').eq('session_id',other.session).single();
  assert.equal(row.error,null);assert.equal(row.data?.user_id,other.id);assert.equal(row.data?.status,'stopped');
});

test('real runtime restore rejects owner session and project mismatches in persisted JSON',async()=>{
  const owner=users[0],store=new SupabaseProjectRuntimeStore();
  // Binding fixture only: never passed to a provider or executed as a runtime.
  const state={userId:owner.id,sessionId:owner.session,projectId:owner.project,providerState:{fixture:'no execution'}};
  try {
    assert.equal((await admin.from('project_runtime_sessions').update({state}).eq('session_id',owner.session)).error,null);
    assert.equal((await store.loadSession(owner.id,owner.session))?.userId,owner.id);
    for(const mutation of [{userId:users[1].id},{sessionId:users[1].session},{projectId:users[1].project}]) {
      assert.equal((await admin.from('project_runtime_sessions').update({state:{...state,...mutation}}).eq('session_id',owner.session)).error,null);
      assert.equal(await store.loadSession(owner.id,owner.session),null);
    }
    assert.equal(await store.loadSession(users[1].id,owner.session),null);
  } finally {assert.equal((await admin.from('project_runtime_sessions').update({state:{}}).eq('session_id',owner.session)).error,null);}
});
test('provider metadata uses real schema and owner filters without returning encrypted/raw credentials',async()=>{
  const owner=users[0];
  const rows=await listUserProviderKeys(owner.id);assert.equal(rows.length,1);assert.equal(rows[0].provider,'openai');
  const response=await request('/api/integrations/provider-keys',owner.token);assert.equal(response.status,200);
  const text=await response.text();assert.ok(!text.includes('SYNTHETIC_PRIVATE_CANARY'));assert.ok(!text.includes('access_token'));
});

test('real private OAuth storage cannot be downloaded or signed by browser roles or another tenant',async()=>{
  const [owner,other]=users,bucket='xroga-github-tokens',path=`${owner.id}/github.json`;
  const canary='SYNTHETIC_PRIVATE_STORAGE_CANARY_NOT_A_PROVIDER_CREDENTIAL';
  try {
    assert.equal(await saveGitHubTokenToStorage(owner.id,{access_token:canary,username:'fixture',provider_user_id:'fixture',repo_strategy:'auto',default_repo:null,updated_at:new Date().toISOString()}),true);
    const config=await admin.storage.getBucket(bucket);assert.equal(config.error,null);assert.equal(config.data?.public,false);
    assert.equal((await getGitHubTokenFromStorage(owner.id))?.access_token,canary);
    assert.equal(await getGitHubTokenFromStorage(other.id),null);
    for(const bearer of [undefined,owner.token,other.token]) {
      const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{...(bearer?{global:{headers:{Authorization:`Bearer ${bearer}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
      const read=await client.storage.from(bucket).download(path);assert.ok(read.error);assert.equal(read.data,null);
      const signed=await client.storage.from(bucket).createSignedUrl(path,60);assert.ok(signed.error);assert.equal(signed.data,null);
    }
    const publicRead=await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`,{headers:{apikey:process.env.SUPABASE_ANON_KEY!}});assert.equal(publicRead.ok,false);assert.ok(!(await publicRead.text()).includes(canary));
    const status=await request('/api/github/status',other.token);assert.equal(status.status,200);assert.equal((await status.json() as {connected:boolean}).connected,false);
  } finally {const removed=await admin.storage.from(bucket).remove([path]);assert.equal(removed.error,null,'temporary private object cleanup failed');}
});

test('real GitHub disconnect persists owner-bound revocation despite a delayed legacy mirror',async()=>{
  const [owner,other]=users,bucket='xroga-github-tokens';
  const payload={access_token:'SYNTHETIC_DELAYED_GITHUB_COPY',username:'fixture',provider_user_id:'fixture',repo_strategy:'auto' as const,default_repo:null,updated_at:new Date().toISOString()};
  const authorize=async(userId:string)=>{
    const context=users.find(user=>user.id===userId)!.context;
    const state=randomUUID();await storePkceSession(context,'github_oauth_pkce',{verifier:'synthetic',state,redirect_uri:'https://example.invalid/callback',created_at:new Date().toISOString()});
    const session=await consumePkceSession(context,'github_oauth_pkce',state);assert.ok(session?.authorization_revision);return session.authorization_revision;
  };
  try {
    await saveGitHubConnection(owner.id,'SYNTHETIC_OWNER_GITHUB',{providerUserId:'owner-fixture',username:'owner-fixture',authorizationRevision:await authorize(owner.id)});
    await saveGitHubConnection(other.id,'SYNTHETIC_OTHER_GITHUB',{providerUserId:'other-fixture',username:'other-fixture',authorizationRevision:await authorize(other.id)});
    assert.equal(await getGitHubToken(owner.id),'SYNTHETIC_OWNER_GITHUB');
    const disconnect=await request('/api/github/disconnect',owner.token,'DELETE');
    assert.equal(disconnect.status,200);assert.equal((await disconnect.json() as {disconnected:boolean}).disconnected,true);
    assert.equal(await saveGitHubTokenToStorage(owner.id,payload),true);
    assert.equal(await getGitHubToken(owner.id),null);
    assert.equal(await getGitHubToken(other.id),'SYNTHETIC_OTHER_GITHUB');
    const revoked=await admin.from('github_integrations').select('access_token').eq('user_id',owner.id).single();
    assert.equal(revoked.error,null);assert.equal(revoked.data?.access_token,'');
    const status=await request('/api/github/status',owner.token);assert.equal(status.status,200);
    assert.equal((await status.json() as {connected:boolean}).connected,false);
    // Explicit reconnect replaces the tombstone through the authoritative DB.
    await saveGitHubConnection(owner.id,'SYNTHETIC_RECONNECTED_GITHUB',{providerUserId:'owner-fixture',username:'owner-fixture',authorizationRevision:await authorize(owner.id)});
    assert.equal(await getGitHubToken(owner.id),'SYNTHETIC_RECONNECTED_GITHUB');
  } finally {
    for(const user of users) await clearGitHubConnection(user.id);
    const removed=await admin.storage.from(bucket).remove(users.map(user=>`${user.id}/github.json`));
    assert.equal(removed.error,null,'GitHub synthetic mirror cleanup failed');
  }
});

test('real Vercel refresh persistence cannot overwrite a disconnect or another owner',async()=>{
  const [owner,other]=users,bucket='xroga-github-tokens',path=`${owner.id}/vercel.json`;
  try {
    await saveVercelConnection(owner.id,'SYNTHETIC_VERCEL_OWNER',{refreshToken:'synthetic-owner-lease',expiresIn:3600});
    await saveVercelConnection(other.id,'SYNTHETIC_VERCEL_OTHER',{});
    await saveVercelConnection(owner.id,'SYNTHETIC_VERCEL_ROTATED',{refreshToken:'synthetic-next-lease',expiresIn:3600},'synthetic-owner-lease');
    assert.equal(await getVercelToken(owner.id),'SYNTHETIC_VERCEL_ROTATED');
    const disconnect=await request('/api/vercel/disconnect',owner.token,'DELETE');assert.equal(disconnect.status,200);
    assert.equal((await disconnect.json() as {ok:boolean}).ok,true);
    await assert.rejects(saveVercelConnection(owner.id,'SYNTHETIC_LATE_ROTATION',{},'synthetic-next-lease'),/connection changed during refresh/);
    const delayed=await admin.storage.from(bucket).upload(path,JSON.stringify({access_token:'SYNTHETIC_DELAYED_VERCEL'}),{upsert:true,contentType:'application/json'});
    assert.equal(delayed.error,null);
    assert.equal(await getVercelToken(owner.id),null);
    assert.equal(await getVercelToken(other.id),'SYNTHETIC_VERCEL_OTHER');
    await saveVercelConnection(owner.id,'SYNTHETIC_VERCEL_RECONNECT',{});
    assert.equal(await getVercelToken(owner.id),'SYNTHETIC_VERCEL_RECONNECT');
  } finally {
    for(const user of users) await clearVercelConnection(user.context);
    const removed=await admin.storage.from(bucket).remove(users.map(user=>`${user.id}/vercel.json`));
    assert.equal(removed.error,null,'Vercel synthetic mirror cleanup failed');
  }
});

test('real OAuth policy authority rejects unused generic tokens and isolates issued preference updates',async()=>{
  const {getUserPluginPermissionMode,setUserPluginPermissionMode}=await import('../services/integrations/pluginPermissionPolicy.js');
  const [owner,other]=users,bucket='xroga-github-tokens',provider='xroga_plugin_permission_policy__fixture',pkce='supabase_oauth_pkce';
  const session={verifier:'SYNTHETIC_VERIFIER',state:randomUUID(),redirect_uri:'http://127.0.0.1/callback',created_at:new Date().toISOString()};
  try {
    await assert.rejects(storeProviderToken(owner.id,'synthetic_oauth',{access_token:'SYNTHETIC_OWNER'}),/Unsupported/);
    await assert.rejects(loadProviderToken(owner.id,'synthetic_oauth'),/Unsupported/);
    await assert.rejects(clearProviderToken(owner.id,'synthetic_oauth'),/Unsupported/);
    await setUserPluginPermissionMode(owner.context,'full_access','fixture');
    await setUserPluginPermissionMode(other.context,'read_only','fixture');
    assert.equal(await getUserPluginPermissionMode(owner.id,'fixture'),'full_access');
    assert.equal(await getUserPluginPermissionMode(other.id,'fixture'),'read_only');
    await assert.rejects(setUserPluginPermissionMode({...owner.context},'full_access','fixture'));
    await setUserPluginPermissionMode(owner.context,'always_ask','fixture');
    assert.equal(await getUserPluginPermissionMode(owner.id,'fixture'),'always_ask');
    assert.equal(await getUserPluginPermissionMode(other.id,'fixture'),'read_only');
    await storePkceSession(owner.context,pkce,session);
    await clearPkceSession(owner.context,pkce);
    for(const [path,payload] of [[`${owner.id}/oauth-${provider}.json`,{access_token:'full_access',metadata:{mode:'full_access'}}],[`${owner.id}/pkce-${pkce}.json`,session]] as const){
      const replay=await admin.storage.from(bucket).upload(path,JSON.stringify(payload),{upsert:true,contentType:'application/json'});assert.equal(replay.error,null);
    }
    assert.equal(await getUserPluginPermissionMode(owner.id,'fixture'),'always_ask');
    await assert.rejects(storeProviderToken(owner.id,provider,{access_token:'full_access'},'SYNTHETIC_OLD_REFRESH'),/do not support token refresh/);
    assert.equal(await consumePkceSession(owner.context,pkce,session.state),null);
    assert.equal((await loadProviderToken(other.id,provider))?.access_token,'read_only');
    await assert.rejects(clearProviderToken(owner.id,`../${other.id}`),/Invalid OAuth storage identity/);
    const removed=await admin.from('user_integrations').delete().eq('user_id',owner.id).eq('provider',provider);assert.equal(removed.error,null);
    assert.equal(await loadProviderToken(owner.id,provider),null,'Absent policy cannot read a permissive legacy mirror');
  } finally {
    for(const user of users){const removed=await admin.from('user_integrations').delete().eq('user_id',user.id).eq('provider',provider);assert.equal(removed.error,null);await clearPkceSession(user.context,pkce);}
    const cleanup=await admin.storage.from(bucket).remove([`${owner.id}/oauth-${provider}.json`]);assert.equal(cleanup.error,null);
  }
});

test('real credential helper denies a traversal provider without reading or deleting another owner object',async()=>{
  const [owner,other]=users,bucket='xroga-github-tokens',path=`${other.id}/vault-apikey_openai.json`;
  const canary='SYNTHETIC_FOREIGN_STORAGE_CANARY_NOT_A_CREDENTIAL';
  const body=JSON.stringify({access_token:`enc:${Buffer.from(`fixture:${canary}`).toString('base64')}`,metadata:{}});
  try {
    const upload=await admin.storage.from(bucket).upload(path,body,{contentType:'application/json',upsert:false});assert.equal(upload.error,null);
    const provider=`x/../../${other.id}/vault-apikey_openai`;
    await assert.rejects(getUserProviderKey(owner.id,provider),/Unsupported credential provider/);
    await assert.rejects(deleteUserProviderKey(owner.context,provider),/Unsupported credential provider/);
    const retained=await admin.storage.from(bucket).download(path);assert.equal(retained.error,null);assert.equal(await retained.data!.text(),body);
    assert.equal((await listUserProviderKeys(owner.id)).some(key=>JSON.stringify(key).includes(canary)),false);
  } finally {const removed=await admin.storage.from(bucket).remove([path]);assert.equal(removed.error,null,'foreign synthetic object cleanup failed');}
});

test('real credential writer refuses a public bucket without uploading or silently repairing it',async()=>{
  // Module-level admission requires the disposable CLI loopback deployment.
  // This bucket and every row/object are synthetic; never run on hosted storage.
  const bucket='xroga-github-tokens',owner=users[0],path=`${owner.id}/github.json`;
  const initial=await admin.storage.getBucket(bucket);assert.equal(initial.error,null);assert.equal(initial.data?.public,false);
  try {
    const changed=await admin.storage.updateBucket(bucket,{public:true});assert.equal(changed.error,null);
    assert.equal(await ensurePrivateOAuthBucket(admin),false);
    assert.equal(await saveGitHubTokenToStorage(owner.id,{access_token:'SYNTHETIC_REFUSED_WRITE_NOT_A_CREDENTIAL',username:'fixture',provider_user_id:'fixture',repo_strategy:'auto',default_repo:null,updated_at:new Date().toISOString()}),false);
    const absent=await admin.storage.from(bucket).download(path);assert.ok(absent.error);assert.equal(absent.data,null);
    const afterAttempt=await admin.storage.getBucket(bucket);assert.equal(afterAttempt.data?.public,true,'writer must not silently mutate existing bucket policy');
  } finally {
    const restored=await admin.storage.updateBucket(bucket,{public:false});assert.equal(restored.error,null,'disposable bucket privacy cleanup failed');
    const verified=await admin.storage.getBucket(bucket);assert.equal(verified.data?.public,false);
  }
});

test('notification list and mutations cannot read or alter another owner notification',async()=>{
  const [owner,other]=users;
  const own=await insert('notifications',{user_id:owner.id,title:'OWN_NOTIFICATION_CANARY',message:'Fixture only',read:false});
  const foreign=await insert('notifications',{user_id:other.id,title:'FOREIGN_NOTIFICATION_CANARY',message:'Fixture only',read:false});
  const listed=await request('/api/notifications',owner.token);assert.equal(listed.status,200);
  const text=await listed.text();assert.ok(text.includes('OWN_NOTIFICATION_CANARY'));assert.ok(!text.includes('FOREIGN_NOTIFICATION_CANARY'));
  // Existing idempotent mutation contract stays 200, but no foreign row changes.
  assert.equal((await request(`/api/notifications/${foreign}/read`,owner.token,'PATCH',{user_id:other.id})).status,200);
  assert.equal((await request(`/api/notifications/${foreign}`,owner.token,'DELETE')).status,200);
  const unchanged=await admin.from('notifications').select('user_id,read').eq('id',foreign).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.read,false);assert.equal(unchanged.data?.user_id,other.id);
  assert.equal((await request(`/api/notifications/${own}/read`,owner.token,'PATCH',{})).status,200);
  const updated=await admin.from('notifications').select('read').eq('id',own).single();assert.equal(updated.data?.read,true);
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const hidden=await client.from('notifications').select('id').eq('id',foreign);assert.equal(hidden.error,null);assert.deepEqual(hidden.data,[]);
  assert.equal((await request('/api/notifications')).status,401);
});

test('profile activity keeps own and project-less entries but redacts a corrupt foreign project join',async()=>{
  const [owner,other]=users;
  assert.equal((await admin.from('projects').update({name:'FOREIGN_PROJECT_NAME_CANARY'}).eq('id',other.project)).error,null);
  const own=await insert('activity_logs',{user_id:owner.id,project_id:owner.project,action:'OWN_ACTIVITY_CANARY'});
  const noProject=await insert('activity_logs',{user_id:owner.id,action:'PROJECTLESS_ACTIVITY_CANARY'});
  const corrupt=await insert('activity_logs',{user_id:owner.id,project_id:other.project,action:'CORRUPT_JOIN_CANARY'});
  await insert('activity_logs',{user_id:other.id,project_id:other.project,action:'FOREIGN_ACTIVITY_CANARY'});
  const response=await request('/api/profile/activity',owner.token);assert.equal(response.status,200);
  const entries=await response.json() as Array<{id:string;action:string;projects:{name:string}|null}>;
  assert.ok(entries.some(row=>row.id===own&&row.projects?.name));
  assert.ok(entries.some(row=>row.id===noProject&&row.projects===null));
  assert.ok(entries.some(row=>row.id===corrupt&&row.projects===null));
  assert.ok(!JSON.stringify(entries).includes('FOREIGN_PROJECT_NAME_CANARY'));assert.ok(!entries.some(row=>row.action==='FOREIGN_ACTIVITY_CANARY'));
  const dashboard=await request('/api/dashboard/summary',owner.token);assert.equal(dashboard.status,200);
  const dashboardBody=await dashboard.text();assert.ok(!dashboardBody.includes('FOREIGN_PROJECT_NAME_CANARY'));assert.ok(dashboardBody.includes('PROJECTLESS_ACTIVITY_CANARY'));
  assert.equal((await request('/api/profile')).status,401);
  const promotion=await request('/api/profile',owner.token,'PATCH',{role:'owner',user_id:other.id});assert.equal(promotion.status,400);
  const beforeOther=await admin.from('profiles').select('display_name,role').eq('id',other.id).single();assert.equal(beforeOther.error,null);
  const updated=await request('/api/profile',owner.token,'PATCH',{display_name:'Owned profile fixture',timezone:'UTC'});assert.equal(updated.status,200);
  const updatedProfile=await updated.json() as {id:string;display_name:string;timezone:string;role:string};
  assert.equal(updatedProfile.id,owner.id);assert.equal(updatedProfile.display_name,'Owned profile fixture');assert.equal(updatedProfile.timezone,'UTC');assert.equal(updatedProfile.role,'member');
  const afterOther=await admin.from('profiles').select('display_name,role').eq('id',other.id).single();assert.equal(afterOther.error,null);assert.deepEqual(afterOther.data,beforeOther.data);
  const profile=await request('/api/profile',owner.token);assert.equal(profile.status,200);
  const row=await profile.json() as {id:string;role:string};assert.equal(row.id,owner.id);assert.equal(row.role,'member');
});

test('real failed-build notification cannot disclose raw backend diagnostic text',async()=>{
  const owner=users[0];
  const notificationCount=await admin.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',owner.id);assert.equal(notificationCount.error,null);
  await assert.rejects(notifyBuildFailed({...owner.context} as TenantContext,{projectName:'Rejected notification',prompt:'Synthetic request only',error:'fixture'}),{code:'TENANT_AUTH_REQUIRED'});
  const rejected=await admin.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',owner.id);assert.equal(rejected.error,null);assert.equal(rejected.count,notificationCount.count);
  await notifyBuildFailed(createTenantContext({userId:owner.id,via:'persisted_owner'}),{projectName:'Isolated failure fixture',prompt:'Synthetic request only',error:'RAW_DIAGNOSTIC_PRIVATE_CANARY password=synthetic-not-a-secret SQL internal exception'});
  const stored=await admin.from('notifications').select('message,metadata').eq('user_id',owner.id).eq('title','XROGA build needs attention');assert.equal(stored.error,null);assert.ok(stored.data?.length);
  assert.ok(!JSON.stringify(stored.data).includes('RAW_DIAGNOSTIC_PRIVATE_CANARY'));
  assert.ok(stored.data?.some(row=>row.message.includes('could not finish')&&row.message.includes('retry')));
  const publicList=await request('/api/notifications',owner.token);assert.equal(publicList.status,200);assert.ok(!(await publicList.text()).includes('RAW_DIAGNOSTIC_PRIVATE_CANARY'));
});
test('actual member identity cannot fetch privileged operational endpoints',async()=>{
  for(const path of ['/api/admin/errors','/metrics']) assert.equal((await request(path,users[0].token)).status,403);
  const absent=await request(`/api/operations/products/${randomUUID()}`,users[0].token);
  const foreign=await request(`/api/operations/products/${users[1].project}`,users[0].token);
  assert.equal(absent.status,403);assert.equal(foreign.status,403);
  const safe=await absent.json() as {error:string;code:string};assert.equal(safe.code,'forbidden');assert.equal(safe.error,'Operation is not permitted');
});

test('real growth event replay cannot disclose a different project event',async()=>{
  const owner=users[0];
  const otherProject=await insert('projects',{user_id:owner.id,name:'Disposable growth scope',type:'app'});
  const service=new GrowthService(admin);
  const input={projectId:otherProject,name:'identity.linked.v1',idempotencyKey:randomUUID(),environment:'test' as const,consentState:'granted' as const,source:'isolated-fixture',evidenceReference:'isolated-growth-replay'};
  const created=await service.recordEvent(owner.id,input);assert.equal(created.duplicate,false);assert.ok(created.event.id);
  await assert.rejects(service.recordEvent(owner.id,{...input,projectId:owner.project}),{code:'idempotency_conflict',statusCode:409});
  const replay=await service.recordEvent(owner.id,input);assert.equal(replay.duplicate,true);assert.equal(replay.event.id,created.event.id);
  const rows=await admin.from('analytics_events').select('id,project_id').eq('tenant_id',owner.id).eq('idempotency_key',input.idempotencyKey);
  assert.equal(rows.error,null);assert.deepEqual(rows.data,[{id:created.event.id,project_id:otherProject}]);
});

test('real growth relation checks reject foreign segments and misbound experiment evidence', async () => {
  const [owner, foreign] = users, service = new GrowthService(admin);
  const segment = await insert('growth_segments', { tenant_id: foreign.id, project_id: foreign.project, name: 'Foreign segment', definition: { lifecycleStates: ['activated'] }, status: 'active' });
  const denied = { code: 'not_found', statusCode: 404 };
  await assert.rejects(service.createCampaign(owner.id, { projectId: owner.project, segmentId: segment, name: 'Denied campaign', channel: 'in_app', templateKey: 'fixture', idempotencyKey: randomUUID() }), denied);
  const campaign = await insert('growth_campaigns', { tenant_id: owner.id, project_id: owner.project, segment_id: segment, name: 'Misbound campaign', channel: 'in_app', template_key: 'fixture', status: 'running' });
  await assert.rejects(service.processCampaign(owner.id, campaign), denied);
  const messageRows = await admin.from('growth_messages').select('id').eq('campaign_id', campaign);
  assert.equal(messageRows.error, null); assert.deepEqual(messageRows.data, []);
  const experiment = await insert('growth_experiments', { tenant_id: foreign.id, project_id: owner.project, key: randomUUID(), variants: [{ key: 'a', weight: 1 }], allocation_seed: 'fixture', minimum_sample_size: 1 });
  await assert.rejects(service.assignExperiment(owner.id, experiment, 'fixture'), denied);
  await assert.rejects(service.experimentResult(owner.id, experiment), denied);
  const assignment = await insert('growth_experiment_assignments', { experiment_id: experiment, tenant_id: owner.id, subject_key: 'fixture', variant: 'a', exposed_at: new Date().toISOString() });
  await assert.rejects(service.exposeExperiment(owner.id, assignment, 'fixture'), denied);
  const input = { experimentId: experiment, assignmentId: assignment, eventId: randomUUID(), metricKey: 'fixture' };
  await assert.rejects(service.recordExperimentOutcome(owner.id, input), denied);
  // Repair only this synthetic fixture's parent to exercise the next boundary.
  assert.equal((await admin.from('growth_experiments').update({ tenant_id: owner.id }).eq('id', experiment)).error, null);
  await assert.rejects(service.recordEvent(foreign.id, { projectId: foreign.project, name: 'identity.linked.v1', idempotencyKey: randomUUID(), environment: 'test', consentState: 'granted', source: 'fixture', evidenceReference: 'fixture', experimentId: experiment }), denied);
  await assert.rejects(service.recordEvent(foreign.id, { projectId: foreign.project, name: 'identity.linked.v1', idempotencyKey: randomUUID(), environment: 'test', consentState: 'granted', source: 'fixture', evidenceReference: 'fixture', campaignId: campaign }), denied);
  const event = await insert('analytics_events', { user_id: foreign.id, tenant_id: foreign.id, project_id: foreign.project, event_type: 'identity.linked.v1', idempotency_key: randomUUID(), environment: 'test', experiment_id: experiment });
  await assert.rejects(service.recordExperimentOutcome(owner.id, { ...input, eventId: event }), denied);
  const outcomes = await admin.from('growth_experiment_outcomes').select('id').eq('experiment_id', experiment);
  assert.equal(outcomes.error, null); assert.deepEqual(outcomes.data, []);
  const ownEvent = await service.recordEvent(owner.id, { projectId: owner.project, name: 'identity.linked.v1', idempotencyKey: randomUUID(), environment: 'test', consentState: 'granted', source: 'fixture', evidenceReference: 'fixture', experimentId: experiment });
  const accepted = await service.recordExperimentOutcome(owner.id, { ...input, eventId: ownEvent.event.id });
  assert.equal(accepted.event_id, ownEvent.event.id); assert.equal(accepted.assignment_id, assignment);
});

test('real historical run states hydrate truthfully and remain owner scoped',async()=>{
  const owner=users[0],other=users[1];
  const expected=new Map<string,string>();
  for(const [status,normalized] of [['pending','running'],['verifying','running'],['failed','error'],['completed','complete'],['cancelled','cancelled']]){
    const id=randomUUID();await insert('swarm_runs',{id,user_id:owner.id,prompt:'Historical state fixture',status});
    expected.set(id,normalized);
    assert.equal((await getRunAsync(id,owner.id,true))?.status,normalized);
    assert.equal(await getRunAsync(id,other.id,true),null);
  }
  const foreignId=randomUUID();await insert('swarm_runs',{id:foreignId,user_id:other.id,prompt:'FOREIGN_HISTORY_CANARY',status:'failed'});
  const history=await listRunsForUserAsync(owner.id,200);
  for(const [id,status] of expected)assert.equal(history.find(row=>row.id===id)?.status,status);
  assert.ok(history.length>=5);assert.ok(history.every(row=>row.userId===owner.id));
  assert.ok(!history.some(row=>row.id===foreignId||row.prompt==='FOREIGN_HISTORY_CANARY'));
});

test('real durable creation cannot overwrite existing same-owner or foreign runs',async()=>{
  const [owner,other]=users;
  for(const existingOwner of [owner,other]) {
    const id=randomUUID();
    await insert('swarm_runs',{id,user_id:existingOwner.id,prompt:'RETAINED_RUN_CANARY',status:'cancelled'});
    const before=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(before.error,null);
    await assert.rejects(createRunDurable(owner.id,'must not overwrite',id),{code:'RUN_ALREADY_EXISTS'});
    const after=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(after.error,null);
    assert.deepEqual(after.data,before.data);
    assert.equal(getRun(id),null);assert.equal(activeRunIds().includes(id),false);
  }
  const id=randomUUID();
  const attempts=await Promise.allSettled([createRunDurable(owner.id,'first',id),createRunDurable(owner.id,'second',id)]);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  const stored=await admin.from('swarm_runs').select('user_id,prompt').eq('id',id).single();assert.equal(stored.error,null);
  assert.equal(stored.data?.user_id,owner.id);assert.equal(stored.data?.prompt,'first');
});

function independentRunClient() {
  return createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
test('actual run store uses fresh authority and competing resumes retain the admitted winner',async()=>{
  const owner=users[0],id=randomUUID(),remote=independentRunClient();
  const original=await withRunAttempt(()=>createRunDurable(owner.id,'Actual run store fixture',id));
  assert.equal(original.status,'running');
  const cancelled=await remote.from('swarm_runs').update({status:'cancelled',completed_at:new Date().toISOString(),worker_id:null,heartbeat_at:null,lease_generation:null})
    .eq('id',id).eq('user_id',owner.id).eq('status','running').select('id');
  assert.equal(cancelled.error,null);assert.equal(cancelled.data?.length,1);
  const results=await Promise.allSettled([0,1].map(()=>withRunAttempt(async()=>{
    const resumed=await resumeRunDurable(owner.id,'Continue',id);
    assert.ok(appendRunEvent(id,'progress',{message:'Current admitted worker'}));
    await persistRunState(id);
    return resumed;
  })));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.equal(getRun(id)?.status,'running');
  const row=await remote.from('swarm_runs').select('status,last_sequence,lease_generation').eq('id',id).single();
  assert.equal(row.error,null);assert.equal(row.data.status,'running');assert.equal(row.data.last_sequence,1);assert.ok(row.data.lease_generation);
});
function attemptState(status:'running'|'complete'='running',sequence=1) {
  return {prompt:'Attempt fencing fixture',status,output:status==='complete'?{result:'verified synthetic fixture'}:null,
    feature_category:null,token_usage:null,completed_at:status==='complete'?new Date().toISOString():null,
    iteration_count:status==='complete'?1:0,events:[],last_sequence:sequence};
}
async function seedAttempt(ownerId:string,workerId:string,generation:string) {
  return insert('swarm_runs',{user_id:ownerId,...attemptState('running',0),worker_id:workerId,
    lease_generation:generation,heartbeat_at:new Date().toISOString(),messages:[{role:'user',content:'ORIGINAL_CONVERSATION_CANARY'}]});
}

test('real two-client completion and cancellation race cannot resurrect a run or overwrite conversations',async()=>{
  const owner=users[0],worker=independentRunClient(),canceller=independentRunClient();
  for(let iteration=0;iteration<4;iteration++) {
    const generation=randomUUID(),workerId=`fixture-worker-${randomUUID()}`;
    const id=await seedAttempt(owner.id,workerId,generation),complete=attemptState('complete');
    const messages=[{role:'user',content:`CONCURRENT_CONVERSATION_CANARY_${iteration}`}];
    const [completion,cancellation,conversation]=await Promise.all([
      worker.rpc('persist_swarm_run_attempt',{p_run_id:id,p_owner_id:owner.id,p_worker_id:workerId,p_generation:generation,p_state:complete}),
      canceller.from('swarm_runs').update({status:'cancelled',completed_at:new Date().toISOString(),worker_id:null,heartbeat_at:null,lease_generation:null})
        .eq('id',id).eq('user_id',owner.id).eq('status','running').select('id'),
      canceller.from('swarm_runs').update({messages}).eq('id',id).eq('user_id',owner.id),
    ]);
    assert.equal(completion.error,null);assert.equal(cancellation.error,null);assert.equal(conversation.error,null);
    const final=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(final.error,null);
    assert.deepEqual(final.data.messages,messages);assert.equal(final.data.worker_id,null);
    if(cancellation.data!.length===1) {assert.equal(completion.data,false);assert.equal(final.data.status,'cancelled');assert.equal(final.data.lease_generation,null);}
    else {assert.equal(cancellation.data!.length,0);assert.equal(completion.data,true);assert.equal(final.data.status,'complete');}
    await assert.rejects(persistOwnedRunAttempt(worker,owner.context,id,workerId,generation,attemptState('running',2)),{code:'RUN_STATE_CONFLICT'});
    const retained=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,final.data);
  }
});

test('real same-worker resumed generation and transferred worker reject stale attempt writes',async()=>{
  const owner=users[0],oldClient=independentRunClient(),newClient=independentRunClient();
  const workerId=`fixture-worker-${randomUUID()}`,oldGeneration=randomUUID(),newGeneration=randomUUID();
  const id=await seedAttempt(owner.id,workerId,oldGeneration);
  // Model the durable resume CAS after cancellation. No worker/provider executes.
  assert.equal((await newClient.from('swarm_runs').update({status:'cancelled',completed_at:new Date().toISOString(),worker_id:null,lease_generation:null})
    .eq('id',id).eq('user_id',owner.id).eq('status','running')).error,null);
  const resumed=await newClient.from('swarm_runs').update({...attemptState('running',0),worker_id:workerId,lease_generation:newGeneration})
    .eq('id',id).eq('user_id',owner.id).eq('status','cancelled').is('worker_id',null).is('lease_generation',null).select('id');
  assert.equal(resumed.error,null);assert.equal(resumed.data?.length,1);
  const resumedRow=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(resumedRow.error,null);
  await assert.rejects(persistOwnedRunAttempt(oldClient,owner.context,id,workerId,oldGeneration,attemptState('complete')),{code:'RUN_STATE_CONFLICT'});
  const unchanged=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.deepEqual(unchanged.data,resumedRow.data);
  await persistOwnedRunAttempt(newClient,owner.context,id,workerId,newGeneration,attemptState('running',1));
  const nextWorker=`fixture-worker-${randomUUID()}`;
  assert.equal((await newClient.from('swarm_runs').update({worker_id:nextWorker}).eq('id',id).eq('user_id',owner.id).eq('worker_id',workerId)).error,null);
  const transferred=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(transferred.error,null);
  await assert.rejects(persistOwnedRunAttempt(oldClient,owner.context,id,workerId,newGeneration,attemptState('complete',2)),{code:'RUN_STATE_CONFLICT'});
  const stillTransferred=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.deepEqual(stillTransferred.data,transferred.data);
  await persistOwnedRunAttempt(newClient,owner.context,id,nextWorker,newGeneration,attemptState('running',2));
});

test('real attempt RPC rejects foreign owner and missing rows and is unavailable to browser identities',async()=>{
  const [owner,other]=users,first=independentRunClient(),second=independentRunClient();
  const generation=randomUUID(),workerId=`fixture-worker-${randomUUID()}`,id=await seedAttempt(owner.id,workerId,generation);
  const before=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(before.error,null);
  await assert.rejects(persistOwnedRunAttempt(second,other.context,id,workerId,generation,attemptState()),{code:'RUN_STATE_CONFLICT'});
  const absent=randomUUID();
  await assert.rejects(persistOwnedRunAttempt(first,owner.context,absent,workerId,generation,attemptState()),{code:'RUN_STATE_CONFLICT'});
  const missing=await admin.from('swarm_runs').select('id').eq('id',absent);assert.equal(missing.error,null);assert.deepEqual(missing.data,[]);
  const browser=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const denied=await browser.rpc('persist_swarm_run_attempt',{p_run_id:id,p_owner_id:owner.id,p_worker_id:workerId,p_generation:generation,p_state:attemptState()});
  assert.equal(denied.error?.code,'42501');
  const after=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
});

test('real exact terminal repeat succeeds but changed completed state and conversation injection fail',async()=>{
  const owner=users[0],first=independentRunClient(),second=independentRunClient();
  const generation=randomUUID(),workerId=`fixture-worker-${randomUUID()}`,id=await seedAttempt(owner.id,workerId,generation);
  const complete=attemptState('complete');
  await persistOwnedRunAttempt(first,owner.context,id,workerId,generation,complete);
  const before=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(before.error,null);
  await persistOwnedRunAttempt(second,owner.context,id,workerId,generation,complete);
  for(const changed of [{...complete,output:{result:'FORBIDDEN_REWRITE'}},{...complete,last_sequence:2},
    {...complete,messages:[{role:'user',content:'FORBIDDEN_CONVERSATION_REWRITE'}]}]) {
    await assert.rejects(persistOwnedRunAttempt(second,owner.context,id,workerId,generation,changed),{code:'RUN_STATE_CONFLICT'});
  }
  const after=await admin.from('swarm_runs').select('*').eq('id',id).single();assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
  assert.deepEqual(after.data.messages,[{role:'user',content:'ORIGINAL_CONVERSATION_CANARY'}]);
});

test('foreign durable business confirmations cannot be read approved or cancelled by changing IDs',async()=>{
  const [owner,other]=users;
  const id=await insert('business_action_confirmations',{user_id:other.id,status:'pending',plan:{fixture:'no executable action'},plan_digest:'a'.repeat(64),summary:'FOREIGN_ACTION_CANARY',toolkit:'fixture',risk:'write',expires_at:new Date(Date.now()+600000).toISOString()});
  for(const [suffix,method] of [['','GET'],['/confirm','POST'],['/cancel','POST']]) {
    const response=await request(`/api/phase1/business-actions/confirmations/${id}${suffix}`,owner.token,method,method==='GET'?undefined:{userId:other.id,tenantId:other.id});
    assert.equal(response.status,404);assert.ok(!(await response.text()).includes('FOREIGN_ACTION_CANARY'));
  }
  const unchanged=await admin.from('business_action_confirmations').select('user_id,status,claimed_at').eq('id',id).single();assert.equal(unchanged.error,null);assert.equal(unchanged.data?.user_id,other.id);assert.equal(unchanged.data?.status,'pending');assert.equal(unchanged.data?.claimed_at,null);
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  assert.equal((await client.from('business_action_confirmations').select('*').eq('id',id)).error?.code,'42501');
});
test('real concurrent chat confirmation phrases leave all pending action identities unchanged', async(t) => {
  const owner = users[0], ids: string[] = [];
  t.after(async () => { if (ids.length) assert.equal((await admin.from('business_action_confirmations').delete().in('id', ids)).error, null); });
  for (const conversation of ['first', 'second']) {
    ids.push(await insert('business_action_confirmations', {
      user_id: owner.id, status: 'pending', plan: { fixture: 'no executable action', conversation },
      plan_digest: 'a'.repeat(64), summary: `REVIEW_${conversation}`, toolkit: 'fixture', risk: 'write',
      expires_at: new Date(Date.now() + 600000).toISOString(),
    }));
  }
  const snapshot = async () => {
    const rows = await admin.from('business_action_confirmations').select('*').in('id', ids).order('id');
    assert.equal(rows.error, null); return rows.data;
  };
  const before = await snapshot();
  const replies = await Promise.all(['Confirm it', 'Cancel that action'].map((message, index) =>
    request('/api/phase1/plan', owner.token, 'POST', { message, conversationId: `thread-${index}`, confirmationId: ids[index] })));
  for (const reply of replies) {
    assert.equal(reply.status, 200);
    const body = await reply.json() as { directResponse: string };
    assert.match(body.directResponse, /specific connected-app action/);
  }
  assert.deepEqual(await snapshot(), before);
});

test('real profile column grants reject self-promotion and auth metadata cannot supply admin authority',async()=>{
  const owner=users[0];
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${owner.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const escalation=await client.from('profiles').update({role:'owner'}).eq('id',owner.id);
  assert.equal(escalation.error?.code,'42501');
  const metadata=await admin.auth.admin.updateUserById(owner.id,{user_metadata:{role:'owner',tenantId:users[1].id}});assert.equal(metadata.error,null);
  assert.equal((await request('/api/admin/errors',owner.token)).status,403);
  const actual=await admin.from('profiles').select('role').eq('id',owner.id).single();assert.equal(actual.data?.role,'member');
});
test('real operations membership allows its reviewed relation then denies immediately after revocation',async()=>{
  const [owner,member]=users;
  const id=await insert('operations_memberships',{user_id:owner.id,project_id:owner.project,member_user_id:member.id,role:'viewer',created_by:owner.id});
  try {
    assert.equal((await request(`/api/operations/products/${owner.project}`,member.token)).status,200);
    assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);
    assert.equal((await request(`/api/operations/products/${owner.project}`,member.token)).status,403);
  } finally {assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);}
});

test('browser cannot mint operations membership, and even a misbound service row cannot grant foreign access',async()=>{
  const [owner,other]=users;
  const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${other.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const forged={user_id:other.id,project_id:owner.project,member_user_id:other.id,role:'admin',created_by:other.id};
  assert.equal((await client.from('operations_memberships').insert(forged)).error?.code,'42501');
  // Simulate corrupt server-owned relation, not an actual browser privilege grant.
  const id=await insert('operations_memberships',forged);
  try {
    assert.equal((await request(`/api/operations/products/${owner.project}`,other.token)).status,403);
    const portfolio=await request('/api/operations/portfolio',other.token);assert.equal(portfolio.status,200);
    assert.ok(!(await portfolio.text()).includes(owner.project));
  } finally {assert.equal((await admin.from('operations_memberships').delete().eq('id',id)).error,null);}
});

test('portfolio does not disclose a misbound foreign resource while keeping legitimate owner evidence',async()=>{
  const [owner,other]=users;
  // Both owner IDs and both project IDs are now legitimately in the portfolio.
  // Independent IN predicates must not admit a cross-paired corrupt record.
  const membership=await insert('operations_memberships',{user_id:other.id,project_id:other.project,member_user_id:owner.id,role:'viewer',created_by:other.id});
  const legitimate=await insert('operations_resources',{user_id:owner.id,project_id:owner.project,kind:'service',name:'Owner fixture',source:'fixture',evidence_reference:'OWN_RESOURCE_EVIDENCE_CANARY'});
  const foreign=await insert('operations_resources',{user_id:other.id,project_id:owner.project,kind:'service',name:'FOREIGN_RESOURCE_CANARY',source:'fixture',status:'failed',evidence_reference:'FOREIGN_RESOURCE_EVIDENCE_CANARY'});
  try {
    for(const path of ['/api/operations/portfolio',`/api/operations/products/${owner.project}`]) {
      const response=await request(path,owner.token);assert.equal(response.status,200);
      const text=await response.text();assert.ok(text.includes('OWN_RESOURCE_EVIDENCE_CANARY'));assert.ok(!text.includes('FOREIGN_RESOURCE'));
    }
    const portfolio=await request('/api/operations/portfolio',owner.token);assert.ok((await portfolio.text()).includes(other.project),'Legitimate membership must remain visible');
  } finally {assert.equal((await admin.from('operations_resources').delete().in('id',[legitimate,foreign])).error,null);assert.equal((await admin.from('operations_memberships').delete().eq('id',membership)).error,null);}
});

test('misbound persisted operations actions cannot leak a receipt or grant confirmation or approval',async()=>{
  const [owner,other]=users;
  const id=await insert('operations_actions',{user_id:other.id,project_id:owner.project,requested_by:owner.id,action_type:'retry_job',target_type:'job',target_id:randomUUID(),permission_required:'retry_jobs',risk_level:'low',status:'verified',idempotency_key:randomUUID(),target_version:0,action_plan_digest:'a'.repeat(64),status_reason:'FOREIGN_ACTION_RECEIPT_CANARY'});
  try{
    for(const suffix of ['execute','confirm','approve']){
      const response=await request(`/api/operations/actions/${id}/${suffix}`,owner.token,'POST',suffix==='approve'?{decision:'approved',reason:'fixture approval'}:{});
      assert.equal(response.status,403);assert.ok(!(await response.text()).includes('CANARY'));
    }
    const actual=await admin.from('operations_actions').select('user_id,project_id,status').eq('id',id).single();
    assert.equal(actual.error,null);assert.deepEqual(actual.data,{user_id:other.id,project_id:owner.project,status:'verified'});
  }finally{assert.equal((await admin.from('operations_actions').delete().eq('id',id)).error,null);}
});

test('project-limited operators cannot retry another project job or webhook owned by the same tenant',async()=>{
  const [owner,member]=users;
  const restrictedProject=await insert('projects',{user_id:owner.id,name:'Owner separate private project',type:'app'});
  const membership=await insert('operations_memberships',{user_id:owner.id,project_id:owner.project,member_user_id:member.id,role:'operator',created_by:owner.id});
  const job=await insert('swarm_job_queue',{user_id:owner.id,project_id:restrictedProject,run_id:randomUUID(),prompt:'synthetic fixture only',status:'failed',attempt_count:0});
  const webhook=await insert('webhook_deliveries',{provider:'fixture-no-provider',delivery_id:randomUUID(),payload_digest:'a'.repeat(64),user_id:owner.id,project_id:restrictedProject,status:'failed',attempt_count:0},'delivery_id');
  const actionIds:string[]=[];
  try{
    for(const [actionType,targetType,targetId] of [['retry_job','job',job],['retry_webhook','webhook',webhook]]){
      const input={projectId:owner.project,actionType,targetType,targetId,targetVersion:0,idempotencyKey:randomUUID(),confirmed:true};
      const denied=await request('/api/operations/actions',member.token,'POST',input);assert.equal(denied.status,403);
      assert.equal((await denied.json() as {code:string}).code,'forbidden');
      const absent=await admin.from('operations_actions').select('id').eq('user_id',owner.id).eq('idempotency_key',input.idempotencyKey);
      assert.equal(absent.error,null);assert.deepEqual(absent.data,[],'Denied foreign target must not create an executable action');
    }
    const jobBefore=await admin.from('swarm_job_queue').select('status,attempt_count').eq('id',job).single();
    const webhookBefore=await admin.from('webhook_deliveries').select('status,attempt_count').eq('provider','fixture-no-provider').eq('delivery_id',webhook).single();
    assert.deepEqual(jobBefore.data,{status:'failed',attempt_count:0});assert.deepEqual(webhookBefore.data,{status:'failed',attempt_count:0});
    // The legitimate owner/project path still performs only the bounded DB transition.
    const allowed=await request('/api/operations/actions',owner.token,'POST',{projectId:restrictedProject,actionType:'retry_job',targetType:'job',targetId:job,targetVersion:0,idempotencyKey:randomUUID(),confirmed:true});
    assert.equal(allowed.status,201);const result=await allowed.json() as {action:{id:string;status:string}};actionIds.push(result.action.id);assert.equal(result.action.status,'verified');
    const jobAfter=await admin.from('swarm_job_queue').select('status,attempt_count').eq('id',job).single();assert.deepEqual(jobAfter.data,{status:'queued',attempt_count:1});
    const audit=await admin.from('production_audit_log').select('id,action').eq('user_id',owner.id).eq('project_id',restrictedProject).order('action');assert.equal(audit.error,null);assert.deepEqual(audit.data?.map(row=>row.action),['operations.action.completed','operations.action.requested']);
    // Direct mutation still fails. Parent deletion preserves the same history.
    const auditDelete=await admin.from('production_audit_log').delete().eq('id',audit.data![0].id);assert.equal(auditDelete.error?.code,'P0001');assert.equal(auditDelete.error?.message,'operational audit history is immutable');
    const unchanged=await admin.from('production_audit_log').select('id,action').eq('user_id',owner.id).eq('project_id',restrictedProject).order('action');assert.equal(unchanged.error,null);assert.deepEqual(unchanged.data,audit.data);
  }finally{
    if(actionIds.length)assert.equal((await admin.from('operations_actions').delete().in('id',actionIds)).error,null);
    assert.equal((await admin.from('swarm_job_queue').delete().eq('id',job)).error,null);
    assert.equal((await admin.from('webhook_deliveries').delete().eq('provider','fixture-no-provider').eq('delivery_id',webhook)).error,null);
    assert.equal((await admin.from('operations_memberships').delete().eq('id',membership)).error,null);
    const before=await admin.from('production_audit_log').select('*').eq('project_id',restrictedProject).order('id');assert.equal(before.error,null);
    assert.equal((await admin.from('projects').delete().eq('id',restrictedProject)).error,null);
    const retained=await admin.from('production_audit_log').select('*').eq('project_id',restrictedProject).order('id');assert.equal(retained.error,null);
    assert.deepEqual(retained.data,before.data);
  }
});

test('registered stale-run maintenance preserves fresh and terminal runs across tenants',async()=>{
  const [owner,other]=users,old=new Date(Date.now()-20*60000).toISOString();
  const stale=await insert('swarm_runs',{user_id:owner.id,prompt:'Stale fixture',status:'running',worker_id:'fixture-old-worker',heartbeat_at:old,created_at:old});
  const fresh=await insert('swarm_runs',{user_id:other.id,prompt:'Fresh fixture',status:'running',worker_id:'fixture-live-worker',heartbeat_at:new Date().toISOString(),created_at:old});
  const terminal=await insert('swarm_runs',{user_id:other.id,prompt:'Terminal fixture',status:'complete',heartbeat_at:old,created_at:old});
  assert.equal(await reconcileOrphanedRuns({graceMs:0}),1);
  const result=await admin.from('swarm_runs').select('id,user_id,status').in('id',[stale,fresh,terminal]);assert.equal(result.error,null);
  assert.equal(result.data?.find(row=>row.id===stale)?.status,'error');
  assert.equal(result.data?.find(row=>row.id===fresh)?.status,'running');
  assert.equal(result.data?.find(row=>row.id===terminal)?.status,'complete');
  assert.equal(result.data?.find(row=>row.id===fresh)?.user_id,other.id);
});

test('registered shutdown cannot alter an active ID owned by a different worker lease',async()=>{
  const [owner,other]=users,worker=randomUUID();
  const own=await insert('swarm_runs',{user_id:owner.id,prompt:'Shutdown fixture',status:'running',worker_id:worker,heartbeat_at:new Date().toISOString()});
  const foreign=await insert('swarm_runs',{user_id:other.id,prompt:'Foreign worker fixture',status:'running',worker_id:randomUUID(),heartbeat_at:new Date().toISOString()});
  await assert.rejects(failInFlightRuns([foreign],'deploy_interrupted'),/Worker lease identity required/);
  assert.equal(await failInFlightRuns([own,foreign],'deploy_interrupted',{workerId:worker}),1);
  const rows=await admin.from('swarm_runs').select('id,user_id,status').in('id',[own,foreign]);assert.equal(rows.error,null);
  assert.equal(rows.data?.find(row=>row.id===own)?.status,'error');assert.equal(rows.data?.find(row=>row.id===foreign)?.status,'running');assert.equal(rows.data?.find(row=>row.id===foreign)?.user_id,other.id);
});

test('private share token cannot grant another tenant access or revocation authority',async()=>{
  const [owner,other]=users;
  // Literal words survive the established Markdown-cleaning share contract.
  // Underscore canaries would be altered, weakening the negative leak assertion.
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'private',scope:'response',response:'Private share privacy canary',owner_id:other.id});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const stored=await admin.from('message_shares').select('owner_id').eq('token',body.share.token).single();assert.equal(stored.error,null);assert.equal(stored.data?.owner_id,owner.id);
  for(const token of [undefined,other.token]) {
    const denied=await request(`/api/message-shares/${body.share.token}`,token);assert.equal(denied.status,403);assert.ok(!(await denied.text()).includes('Private share privacy canary'));
  }
  const allowed=await request(`/api/message-shares/${body.share.token}`,owner.token);assert.equal(allowed.status,200);assert.ok((await allowed.text()).includes('Private share privacy canary'));
  assert.equal((await request(`/api/message-shares/${body.share.token}`,other.token,'DELETE')).status,404);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token,'DELETE')).status,200);
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token)).status,404);
});

test('owner opt-in public share is readable without auth but revocation is immediate and uncached',async()=>{
  const owner=users[0];
  const created=await request('/api/message-shares',owner.token,'POST',{visibility:'public',scope:'response',response:'Public fixture only'});assert.equal(created.status,201);
  const body=await created.json() as {share:{token:string}};
  const read=await request(`/api/message-shares/${body.share.token}`);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');assert.ok((await read.text()).includes('Public fixture only'));
  assert.equal((await request(`/api/message-shares/${body.share.token}`,owner.token,'DELETE')).status,200);
  assert.equal((await request(`/api/message-shares/${body.share.token}`)).status,404);
});

test('identical prompts cannot retrieve another tenant response through the privileged cache',async()=>{
  const [owner,other]=users,prompt=`Same fixture prompt ${randomUUID()}`;
  assert.equal(await setCachedResponse(prompt,'OWNER_CACHE_CANARY','fixture',owner.context),true);
  assert.equal(await getCachedResponse(prompt,owner.context),'OWNER_CACHE_CANARY');
  assert.equal(await getCachedResponse(prompt,other.context),null);
  assert.equal(await getCachedResponse(prompt),null);
  assert.equal(await setCachedResponse(prompt,'OTHER_CACHE_CANARY','fixture',other.context),true);
  assert.equal(await getCachedResponse(prompt,owner.context),'OWNER_CACHE_CANARY');
  assert.equal(await getCachedResponse(prompt,other.context),'OTHER_CACHE_CANARY');
});

test('real reservation concurrency and foreign settlement cannot transfer budget between tenants',async()=>{
  const [owner,other]=users,key=randomUUID();
  const input={modelId:'deepseek_v4_flash' as const,estimatedInputTokens:100,maximumOutputTokens:100,idempotencyKey:key};
  // Actual existing service RPCs against the complete isolated database, no provider request/payment.
  const replay=await Promise.all(Array.from({length:4},()=>reserveProviderBudget({...input,userId:owner.id})));
  assert.equal(new Set(replay.map(row=>row.id)).size,1);
  const foreign=await reserveProviderBudget({...input,userId:other.id});assert.notEqual(foreign.id,replay[0].id);
  const read=async()=>{
    const r=await admin.from('xroga_provider_reservations').select('id,user_id,status,reserved_micro_usd,settled_micro_usd').in('id',[replay[0].id,foreign.id]).order('id');assert.equal(r.error,null);assert.equal(r.data?.length,2);return r.data;
  };
  const before=await read();
  for (const changed of [{ modelId:'kimi_k3' as const },{purpose:'completion' as const},{estimatedInputTokens:101},{maximumOutputTokens:99}]) {
    await assert.rejects(reserveProviderBudget({...input,...changed,userId:owner.id}),/Provider reservation evidence is invalid/);
  }
  assert.deepEqual(await read(),before,'same-key changed intent must not mutate the original hold');
  await assert.rejects(settleProviderBudget({userId:other.id,modelId:input.modelId,reservation:replay[0],result:{inputTokens:10,outputTokens:10}}),/Provider reservation settlement failed/);
  const denied=await admin.rpc('release_xroga_provider_budget',{p_user_id:other.id,p_reservation_id:replay[0].id,p_error_category:'fixture',p_pending_reconciliation:false});assert.ok(denied.error);
  assert.deepEqual(await read(),before,'failed foreign writes must leave both reservations unchanged');
  await settleProviderBudget({userId:owner.id,modelId:input.modelId,reservation:replay[0],result:{inputTokens:10,outputTokens:10}});
  const after=await read();assert.equal(after?.find(r=>r.id===replay[0].id)?.status,'settled');assert.equal(after?.find(r=>r.id===foreign.id)?.status,'reserved');
  await assert.rejects(reserveProviderBudget({...input,userId:owner.id}),/Provider reservation evidence is invalid/);
  const released=await admin.rpc('release_xroga_provider_budget',{p_user_id:other.id,p_reservation_id:foreign.id,p_error_category:'fixture',p_pending_reconciliation:false});assert.equal(released.error,null);
  await assert.rejects(reserveProviderBudget({...input,userId:other.id}),/Provider reservation evidence is invalid/);
  const uncertainInput={...input,userId:owner.id,idempotencyKey:randomUUID()};
  const uncertain=await reserveProviderBudget(uncertainInput);
  const held=await admin.rpc('release_xroga_provider_budget',{p_user_id:owner.id,p_reservation_id:uncertain.id,p_error_category:'fixture',p_pending_reconciliation:true});assert.equal(held.error,null);
  await assert.rejects(reserveProviderBudget(uncertainInput),/Provider reservation evidence is invalid/);
  const count=await admin.from('xroga_provider_reservations').select('id',{count:'exact',head:true}).eq('user_id',owner.id).eq('idempotency_key',key);assert.equal(count.error,null);assert.equal(count.count,1);
});

test('audit history survives subject deletion and denies mutation, truncate and invalid new subjects',async()=>{
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const db=new pg.Client({connectionString:database.href,ssl:false});await db.connect();
  try {
    await db.query('begin');
    const owner=randomUUID(),project=randomUUID(),environment=randomUUID();
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",[owner,`audit-${owner}@example.invalid`]);
    await db.query("insert into public.projects(id,user_id,name,type) values($1,$2,'Audit lifecycle fixture','app')",[project,owner]);
    await db.query("insert into public.operations_environments(id,user_id,project_id,environment_key,environment_type) values($1,$2,$3,'audit-fixture','test')",[environment,owner,project]);
    await db.query('set local role service_role');
    const inserted=await db.query("insert into public.production_audit_log(actor_id,user_id,project_id,environment_id,action,target_type,outcome,metadata) values($1,$1,$2,$3,'fixture.audit','fixture','verified','{\"synthetic\":true}') returning *",[owner,project,environment]);
    const auditId=inserted.rows[0].id;
    for(const statement of ["update public.production_audit_log set outcome='forged' where id=$1",'delete from public.production_audit_log where id=$1']) {
      await db.query('savepoint denied_mutation');
      await assert.rejects(db.query(statement,[auditId]),{code:'P0001',message:'operational audit history is immutable'});
      await db.query('rollback to savepoint denied_mutation');
    }
    await db.query('savepoint denied_truncate');
    await assert.rejects(db.query('truncate public.production_audit_log'),{code:'42501'});
    await db.query('rollback to savepoint denied_truncate');
    for(const column of ['actor_id','user_id','project_id','environment_id']) {
      await db.query('savepoint invalid_subject');
      await assert.rejects(db.query(`insert into public.production_audit_log(${column},action,target_type,outcome) values($1,'fixture','fixture','denied')`,[randomUUID()]),{code:'23503'});
      await db.query('rollback to savepoint invalid_subject');
    }
    await db.query('reset role');
    await db.query('savepoint owner_truncate');
    await assert.rejects(db.query('truncate public.production_audit_log'),{code:'P0001',message:'operational audit history is immutable'});
    await db.query('rollback to savepoint owner_truncate');
    await db.query('delete from public.operations_environments where id=$1',[environment]);
    await db.query('delete from public.projects where id=$1',[project]);
    await db.query('delete from auth.users where id=$1',[owner]);
    assert.deepEqual((await db.query('select * from public.production_audit_log where id=$1',[auditId])).rows,inserted.rows);
    await db.query('set local role service_role');
    await db.query('savepoint deleted_subject');
    await assert.rejects(db.query("insert into public.production_audit_log(user_id,action,target_type,outcome) values($1,'fixture','fixture','denied')",[owner]),{code:'23503'});
    await db.query('rollback to savepoint deleted_subject');
    await db.query('reset role');
    for(const role of ['anon','authenticated']) {
      await db.query(`set local role ${role}`);
      await db.query('savepoint private_history');
      await assert.rejects(db.query('select * from public.production_audit_log where id=$1',[auditId]),{code:'42501'});
      await db.query('rollback to savepoint private_history');
      await db.query('reset role');
    }
  } finally {await db.query('rollback');await db.end();}
});

test('real catalog and RPC denial prevent browser roles mutating own or foreign billing authority',async()=>{
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(database.hostname));assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const db=new pg.Client({connectionString:database.href,ssl:false});await db.connect();
  try {
    const routines=[['ensure_xroga_free_cycle','public.ensure_xroga_free_cycle(uuid)',{}],['set_xroga_usage_pacing','public.set_xroga_usage_pacing(uuid,text,boolean)',{p_pacing:'full_access',p_confirm_full_access:true}],['set_user_ai_plan_budget','public.set_user_ai_plan_budget(uuid,text,numeric)',{p_plan_tier:'spark',p_plan_budget_usd:1000}]] as const;
    const before=await admin.from('user_token_usage').select('*').in('user_id',users.map(user=>user.id)).order('user_id');assert.equal(before.error,null);
    for(const [name,signature,args] of routines) {
      const privilege=await db.query("select to_regprocedure($1)::text as routine,has_function_privilege('authenticated',$1,'EXECUTE') as member_execute,has_function_privilege('anon',$1,'EXECUTE') as anon_execute",[signature]);
      assert.ok(privilege.rows[0].routine,'Missing real routine is not permission-denial proof');assert.equal(privilege.rows[0].member_execute,false);assert.equal(privilege.rows[0].anon_execute,false);
      for(const bearer of [undefined,users[0].token]) {
        const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{...(bearer?{global:{headers:{Authorization:`Bearer ${bearer}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
        for(const target of users) {
          const denied=await client.rpc(name,{...args,p_user_id:target.id});
          assert.ok(denied.error && ['42501','PGRST202'].includes(denied.error.code),'Privileged billing RPC must deny (catalog separately proves presence and no execute grant)');
        }
      }
    }
    const after=await admin.from('user_token_usage').select('*').in('user_id',users.map(user=>user.id)).order('user_id');assert.equal(after.error,null);assert.deepEqual(after.data,before.data);
  } finally {await db.end();}
});

test('generated external-project memory SQL denies browser roles and preserves server data on reapply',async()=>{
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const db=new pg.Client({connectionString:database.href,ssl:false});await db.connect();
  const tables=['xroga_project_memory','xroga_session_memory'] as const;
  try{
    await db.query('begin');
    for(const table of tables){
      const existing=await db.query('select to_regclass($1) as relation',[`public.${table}`]);
      assert.equal(existing.rows[0].relation,null,'Generated-customer-schema fixture must not overwrite existing platform tables');
    }
    const sql=buildUserSupabaseProvisionSql({includeAppSchema:false,includeStorage:false});
    await db.query(sql);
    await db.query('set local role service_role');
    for(const table of tables)await db.query(`insert into public.${table}(xroga_user_id,repo) values($1,$2)`,[users[0].id,'retained-fixture']);
    await db.query('reset role');
    // Model legacy overly broad grants/policies, then reapply the ACTUAL generator.
    for(const table of tables){
      await db.query(`grant all on public.${table} to anon, authenticated`);
      await db.query(`grant select(repo) on public.${table} to authenticated`);
      await db.query(`create policy legacy_permissive on public.${table} for all to anon, authenticated using(true) with check(true)`);
    }
    await db.query(sql);
    for(const table of tables){
      const catalog=await db.query("select relrowsecurity,has_table_privilege('anon',oid,'SELECT') as anon_read,has_table_privilege('authenticated',oid,'SELECT') as member_read from pg_class where oid=$1::regclass",[`public.${table}`]);
      assert.deepEqual(catalog.rows,[{relrowsecurity:true,anon_read:false,member_read:false}]);
      // Even a stale column grant or subsequently reintroduced table grant cannot
      // defeat restrictive RLS. An equal UUID in a different project is not ownership.
      await db.query(`grant all on public.${table} to anon,authenticated`);
      for(const role of ['anon','authenticated'])for(const actor of users){
        await db.query(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor.id,role})]);
        assert.equal((await db.query(`select * from public.${table}`)).rowCount,0);
        assert.equal((await db.query(`update public.${table} set repo='denied'`)).rowCount,0);
        assert.equal((await db.query(`delete from public.${table}`)).rowCount,0);
        await db.query('savepoint denied_insert');
        await assert.rejects(db.query(`insert into public.${table}(xroga_user_id,repo) values($1,$2)`,[actor.id,'denied']),{code:'42501'});
        await db.query('rollback to savepoint denied_insert');
        await db.query('reset role');
      }
      await db.query('set local role service_role');
      assert.deepEqual((await db.query(`select xroga_user_id,repo from public.${table}`)).rows,[{xroga_user_id:users[0].id,repo:'retained-fixture'}]);
      await db.query('reset role');
    }
  }finally{try{await db.query('rollback');}finally{await db.end();}}
});

test('real webhook delivery acknowledges only durable completion and serializes failed retries',async(t)=>{
  // Exercise the actual router and PostgREST with a synthetic unsupported event.
  // This event returns before account lookup, billing fulfillment or provider I/O.
  const previousSecret=process.env.WHOP_WEBHOOK_SECRET;
  const secret=`synthetic-${randomUUID()}`;
  process.env.WHOP_WEBHOOK_SECRET=secret;
  const app=express();app.use('/billing',billingWebhookRouter);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');
  const deliveryId=`fixture_${randomUUID()}`;
  t.after(async()=>{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    previousSecret===undefined?delete process.env.WHOP_WEBHOOK_SECRET:process.env.WHOP_WEBHOOK_SECRET=previousSecret;
    assert.equal((await admin.from('webhook_deliveries').delete().eq('provider','whop').eq('delivery_id',deliveryId)).error,null);
  });
  const raw=JSON.stringify({type:'fixture.unsupported',data:{id:'synthetic-no-fulfillment'}});
  const digest=createHash('sha256').update(raw).digest('hex');
  const send=()=>{
    const timestamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',secret).update(`${deliveryId}.${timestamp}.${raw}`).digest('base64');
    return fetch(`http://127.0.0.1:${address.port}/billing/whop`,{method:'POST',headers:{'content-type':'application/json','webhook-id':deliveryId,'webhook-timestamp':timestamp,'webhook-signature':`v1,${signature}`},body:raw});
  };
  const read=async()=>{const result=await admin.from('webhook_deliveries').select('*').eq('provider','whop').eq('delivery_id',deliveryId).single();assert.equal(result.error,null);return result.data;};
  assert.equal((await admin.from('webhook_deliveries').insert({provider:'whop',delivery_id:deliveryId,payload_digest:digest,status:'processing',event_type:'fixture.unsupported',signature_verified:true})).error,null);
  assert.equal((await send()).status,503);
  assert.equal((await read()).status,'processing');
  assert.equal((await admin.from('webhook_deliveries').update({status:'failed'}).eq('provider','whop').eq('delivery_id',deliveryId)).error,null);
  const responses=await Promise.all([send(),send()]);
  assert.ok(responses.some(response=>response.status===200));
  assert.ok(responses.every(response=>[200,503].includes(response.status)));
  const completed=await read();assert.equal(completed.status,'completed');assert.equal(completed.response_status,200);assert.equal(completed.payload_digest,digest);
  const duplicate=await send();assert.equal(duplicate.status,200);assert.equal((await duplicate.json() as {duplicate?:boolean}).duplicate,true);
  assert.deepEqual(await read(),completed,'completed duplicates cannot mutate the durable receipt');
});

test('real membership callbacks preserve existing ownership and reject competing tenant creation',async(t)=>{
  const [owner,other]=users;
  const previousPlan=process.env.WHOP_PLAN_ID,previousCompany=process.env.WHOP_COMPANY_ID;
  process.env.WHOP_PLAN_ID='plan_hlV1A10I5QfSP';process.env.WHOP_COMPANY_ID='biz_qhYONL4RebGX96';
  t.after(()=>{previousPlan===undefined?delete process.env.WHOP_PLAN_ID:process.env.WHOP_PLAN_ID=previousPlan;previousCompany===undefined?delete process.env.WHOP_COMPANY_ID:process.env.WHOP_COMPANY_ID=previousCompany;});
  const membership=`mem_fixture_${randomUUID()}`;
  await insert('whop_memberships',{user_id:other.id,whop_membership_id:membership,whop_plan_id:'plan_hlV1A10I5QfSP',whop_account_id:'biz_qhYONL4RebGX96',status:'active'});
  const read=async(id:string)=>{const r=await admin.from('whop_memberships').select('*').eq('whop_membership_id',id).single();assert.equal(r.error,null);return r.data;};
  const event=(id:string,user:string)=>({type:'membership.activated' as const,account_id:'biz_qhYONL4RebGX96',data:{id,plan_id:'plan_hlV1A10I5QfSP',status:'active',metadata:{xroga_user_id:user,source:'xroga',plan_tier:'spark'}}});
  const before=await read(membership);
  await assert.rejects(BillingService.handleWebhookEvent(event(membership,owner.id),'fixture'),/membership_owner_mismatch/);
  assert.deepEqual(await read(membership),before);
  assert.deepEqual(await BillingService.handleWebhookEvent(event(membership,other.id),'fixture'),{fulfilled:false});
  const race=`mem_fixture_${randomUUID()}`;
  const results=await Promise.allSettled(users.map(user=>BillingService.handleWebhookEvent(event(race,user.id),'fixture')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const denied=results.find(r=>r.status==='rejected');assert.ok(denied?.status==='rejected');assert.match(String(denied.reason),/membership_owner_mismatch/);
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.equal((await read(race))?.user_id,users[winner].id);
});

test('real referral linking serializes concurrent requests without rewarding or accepting a forged actor', async(t) => {
  const [owner, referrer] = users;
  let rewardFixture: string | undefined;
  t.after(async () => {
    if (rewardFixture) assert.equal((await admin.from('referral_rewards').delete().eq('id', rewardFixture)).error, null);
    assert.equal((await admin.from('referrals').delete().eq('referred_id', owner.id)).error, null);
    assert.equal((await admin.from('user_referral_profiles').delete().in('user_id', [owner.id, referrer.id])).error, null);
  });
  assert.equal((await admin.from('user_referral_profiles').insert({ user_id: referrer.id, code: 'XROGA-ABC234' })).error, null);
  const before = await admin.from('user_referral_profiles').select('*').eq('user_id', referrer.id).single();
  assert.equal(before.error, null);
  // Synthetic foreign ledger canary only, not a token grant or real reward.
  rewardFixture = await insert('referral_rewards', { user_id: referrer.id, ai_token_amount: 8765, xrg_amount: 12345, type: 'referrer_bonus', status: 'rewarded' });
  const rewardsBefore = await admin.from('referral_rewards').select('*').in('user_id', [owner.id, referrer.id]).order('id');
  assert.equal(rewardsBefore.error, null);
  const responses = await Promise.all([0, 1].map(() => request('/api/referrals/apply', owner.token, 'POST', { code: 'XROGA-ABC234', userId: referrer.id })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  const rows = await admin.from('referrals').select('*').eq('referred_id', owner.id);
  assert.equal(rows.error, null); assert.equal(rows.data?.length, 1);
  assert.equal(rows.data![0].referrer_id, referrer.id); assert.equal(rows.data![0].qualification_status, 'pending');
  assert.equal(rows.data![0].referrer_rewarded, false); assert.equal(rows.data![0].new_user_rewarded, false);
  const linked = await admin.from('user_referral_profiles').select('referred_by_user_id,referred_by_code').eq('user_id', owner.id).single();
  assert.equal(linked.error, null); assert.deepEqual(linked.data, { referred_by_user_id: referrer.id, referred_by_code: 'XROGA-ABC234' });
  const summary = await request(`/api/referrals/summary?userId=${referrer.id}`, owner.token);
  assert.equal(summary.status, 200);
  const displayed = await summary.json() as { profile: { code: string }; totalAiTokensEarned: number; totalXrgEarned: number };
  assert.notEqual(displayed.profile.code, 'XROGA-ABC234');
  assert.equal(displayed.totalAiTokensEarned, 0); assert.equal(displayed.totalXrgEarned, 0);
  assert.deepEqual((await admin.from('user_referral_profiles').select('*').eq('user_id', referrer.id).single()).data, before.data);
  assert.deepEqual((await admin.from('referral_rewards').select('*').in('user_id', [owner.id, referrer.id]).order('id')).data, rewardsBefore.data);
  const self = await admin.rpc('apply_referral_code_atomic', { p_owner_id: referrer.id, p_code: 'XROGA-ABC234' });
  assert.equal(self.error, null); assert.equal(self.data, 'self_referral');
  for (const bearer of [undefined, owner.token]) {
    const browser = createClient(url, process.env.SUPABASE_ANON_KEY!, { ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await browser.rpc('apply_referral_code_atomic', { p_owner_id: referrer.id, p_code: 'XROGA-ABC234' })).error);
  }
});

test('real referral summary refuses corrupt label relationships and preserves valid linked labels', async(t) => {
  const [referrer, referred] = users;
  const before = await admin.from('profiles').select('display_name').eq('id', referred.id).single();
  assert.equal(before.error, null);
  let referralId: string | undefined;
  t.after(async () => {
    if (referralId) assert.equal((await admin.from('referrals').delete().eq('id', referralId)).error, null);
    assert.equal((await admin.from('user_referral_profiles').delete().in('user_id', [referrer.id, referred.id])).error, null);
    assert.equal((await admin.from('profiles').update({ display_name: before.data!.display_name }).eq('id', referred.id)).error, null);
  });
  const label = 'PRIVATE_UNRELATED_PROFILE_LABEL';
  assert.equal((await admin.from('profiles').update({ display_name: label }).eq('id', referred.id)).error, null);
  assert.equal((await admin.from('user_referral_profiles').insert([
    { user_id: referrer.id, code: 'XROGA-DEF234' }, { user_id: referred.id, code: 'XROGA-DEF235' },
  ])).error, null);
  referralId = await insert('referrals', { referrer_id: referrer.id, referred_id: referred.id, code: 'XROGA-DEF234', qualification_status: 'pending' });
  const denied = async () => {
    const response = await request('/api/referrals/summary', referrer.token);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes(label));
  };
  await denied();
  assert.equal((await admin.from('user_referral_profiles').update({ referred_by_user_id: referred.id, referred_by_code: 'XROGA-DEF234' }).eq('user_id', referred.id)).error, null);
  await denied();
  assert.equal((await admin.from('user_referral_profiles').update({ referred_by_user_id: referrer.id, referred_by_code: 'XROGA-DEF235' }).eq('user_id', referred.id)).error, null);
  await denied();
  assert.equal((await admin.from('user_referral_profiles').update({ referred_by_code: 'XROGA-DEF234' }).eq('user_id', referred.id)).error, null);
  const valid = await request('/api/referrals/summary', referrer.token);
  assert.equal(valid.status, 200);
  const result = await valid.json() as { referrals: Array<{ id: string; referredLabel: string }> };
  assert.deepEqual(result.referrals.map(row => ({ id: row.id, referredLabel: row.referredLabel })), [{ id: referralId, referredLabel: label }]);
  assert.equal((await admin.from('referrals').update({ code: 'XROGA-DEF235' }).eq('id', referralId)).error, null);
  await denied();
});

test('real project deletion serializes requests, denies foreign actors and retains one durable activity receipt', async(t) => {
  const [owner, foreign] = users;
  const project = await insert('projects', { user_id: owner.id, name: 'Atomic deletion fixture', type: 'app' });
  t.after(async () => {
    assert.equal((await admin.from('activity_logs').delete().eq('user_id', owner.id).eq('action', 'deleted_project').contains('details', { projectId: project })).error, null);
    assert.equal((await admin.from('projects').delete().eq('id', project).eq('user_id', owner.id)).error, null);
  });
  assert.equal((await request(`/api/projects/${project}`, foreign.token, 'DELETE')).status, 404);
  assert.ok((await admin.from('projects').select('id').eq('id', project).single()).data);
  const results = await Promise.all([0, 1].map(() => request(`/api/projects/${project}`, owner.token, 'DELETE', { user_id: foreign.id })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 404]);
  const audit = await admin.from('activity_logs').select('user_id,project_id,action,details').eq('user_id', owner.id).eq('action', 'deleted_project').contains('details', { projectId: project });
  assert.equal(audit.error, null);
  assert.deepEqual(audit.data, [{ user_id: owner.id, project_id: null, action: 'deleted_project', details: { projectId: project, name: 'Atomic deletion fixture' } }]);
  for (const token of [undefined, owner.token]) {
    const browser = createClient(url, process.env.SUPABASE_ANON_KEY!, { ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });
    assert.ok((await browser.rpc('delete_owned_project_atomic', { p_owner_id: owner.id, p_project_id: project })).error);
  }
});

test('real project deletion rolls back when its activity receipt cannot persist', async () => {
  const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
  const db = new pg.Client({ connectionString: database.href, ssl: false }); await db.connect();
  try {
    await db.query('begin');
    const owner = randomUUID(), project = randomUUID();
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')", [owner, `delete-${owner}@example.invalid`]);
    await db.query("insert into public.projects(id,user_id,name,type) values($1,$2,'Retained project','app')", [project, owner]);
    await db.query("insert into public.project_messages(project_id,role,content) values($1,'user','Retained message')", [project]);
    await db.query("alter table public.activity_logs add constraint fixture_project_delete_rollback check(action <> 'deleted_project') not valid");
    await db.query('savepoint before_delete');
    await assert.rejects(db.query('select public.delete_owned_project_atomic($1,$2)', [owner, project]), (error: unknown) => (error as { code?: string }).code === '23514');
    await db.query('rollback to savepoint before_delete');
    assert.equal((await db.query('select id from public.projects where id=$1 and user_id=$2', [project, owner])).rowCount, 1);
    assert.equal((await db.query('select content from public.project_messages where project_id=$1', [project])).rows[0].content, 'Retained message');
    assert.equal((await db.query("select id from public.activity_logs where user_id=$1 and action='deleted_project'", [owner])).rowCount, 0);
  } finally { await db.query('rollback'); await db.end(); }
});

test('real referral transaction rolls back its insert when the profile update fails', async () => {
  const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
  assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
  const db = new pg.Client({ connectionString: database.href, ssl: false }); await db.connect();
  try {
    await db.query('begin');
    const owner = randomUUID(), referrer = randomUUID();
    for (const id of [owner, referrer]) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')", [id, `referral-${id}@example.invalid`]);
    await db.query('insert into public.user_referral_profiles(user_id,code) values($1,$2),($3,$4)', [owner, 'XROGA-XYZ234', referrer, 'XROGA-XYZ235']);
    await db.query('alter table public.user_referral_profiles add constraint fixture_referral_rollback check(referred_by_user_id is null) not valid');
    await db.query('savepoint before_link');
    await assert.rejects(db.query('select public.apply_referral_code_atomic($1,$2)', [owner, 'XROGA-XYZ235']), (error: unknown) => (error as { code?: string }).code === '23514');
    await db.query('rollback to savepoint before_link');
    assert.equal((await db.query('select id from public.referrals where referred_id=$1', [owner])).rowCount, 0);
    assert.equal((await db.query('select referred_by_user_id from public.user_referral_profiles where user_id=$1', [owner])).rows[0].referred_by_user_id, null);
  } finally { await db.query('rollback'); await db.end(); }
});

test('real GitHub metadata receipt isolates owners and cannot resurrect a concurrent disconnect', async(t) => {
  const [owner, foreign] = users;
  t.after(async () => {
    assert.equal((await admin.from('github_integrations').delete().in('user_id', [owner.id, foreign.id])).error, null);
    assert.equal((await admin.from('user_integrations').delete().eq('user_id', owner.id).eq('provider', 'github')).error, null);
  });
  for (const user of [owner, foreign]) {
    assert.equal((await admin.from('github_integrations').upsert({ user_id: user.id, access_token: `synthetic-${user.id}`, default_repo: 'fixture/original' }, { onConflict: 'user_id' })).error, null);
  }
  const foreignBefore = await admin.from('github_integrations').select('*').eq('user_id', foreign.id).single();
  assert.equal(foreignBefore.error, null);
  const response = await request('/api/github/settings', owner.token, 'PATCH', {
    repoStrategy: 'manual', defaultRepo: 'fixture/selected', userId: foreign.id,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual((await admin.from('github_integrations').select('*').eq('user_id', foreign.id).single()).data, foreignBefore.data);
  const peer = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const [, revoked] = await Promise.all([
    saveGitHubSettings(owner.id, 'manual', 'fixture/racing'),
    peer.rpc('revoke_github_oauth_connection', { p_owner_id: owner.id }),
  ]);
  assert.equal(revoked.error, null); assert.equal(revoked.data, true);
  const afterRace = await admin.from('github_integrations').select('access_token').eq('user_id', owner.id).single();
  assert.equal(afterRace.error, null); assert.equal(afterRace.data?.access_token, '');
  assert.equal(await saveGitHubSettings(owner.id, 'manual', 'fixture/late'), false);
  assert.equal((await request('/api/github/settings', owner.token, 'PATCH', { repoStrategy: 'auto' })).status, 409);
  assert.equal((await admin.from('github_integrations').delete().eq('user_id', owner.id)).error, null);
  assert.equal(await saveGitHubSettings(owner.id, 'auto', null), false);
  assert.deepEqual((await admin.from('github_integrations').select('*').eq('user_id', foreign.id).single()).data, foreignBefore.data);
});

test('real Whop fulfillment rolls back foreign membership collisions and binds concurrent payment replay',async()=>{
  const [owner,other]=users;
  const member=`mem_fixture_${randomUUID()}`;
  await insert('whop_memberships',{user_id:other.id,whop_membership_id:member,whop_plan_id:'plan_hlV1A10I5QfSP',whop_account_id:'biz_qhYONL4RebGX96',status:'active'});
  const args=(userId:string,payment:string,membership:string)=>({p_user_id:userId,p_webhook_id:`msg_${payment}`,p_payment_id:payment,p_membership_id:membership,p_member_id:null,p_checkout_configuration_id:null,p_plan_id:'plan_hlV1A10I5QfSP',p_account_id:'biz_qhYONL4RebGX96',p_starts_at:'2026-10-15T00:00:00Z',p_ends_at:'2026-11-14T00:00:00Z',p_manage_url:null});
  const snapshot=async()=>{
    const result:Record<string,unknown>={};
    for(const table of ['whop_memberships','whop_payment_fulfillments','xroga_billing_cycles','user_actions','action_transactions','user_token_usage']){
      const r=await admin.from(table).select('*').in('user_id',users.map(u=>u.id));assert.equal(r.error,null);
      result[table]=(r.data??[]).map(row=>JSON.stringify(row)).sort();
    }
    return result;
  };
  const before=await snapshot();
  const denied=await admin.rpc('fulfill_whop_payment',args(owner.id,`pay_fixture_${randomUUID()}`,member));
  assert.match(denied.error?.message??'',/membership_owner_mismatch/);
  assert.deepEqual(await snapshot(),before,'all preceding entitlement, budget and payment changes must roll back');
  for(const bearer of [undefined,owner.token]){
    const client=createClient(url,process.env.SUPABASE_ANON_KEY!,{...(bearer?{global:{headers:{Authorization:`Bearer ${bearer}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
    const forbidden=await client.rpc('fulfill_whop_payment',args(owner.id,`pay_fixture_${randomUUID()}`,member));
    assert.ok(forbidden.error&&['42501','PGRST202'].includes(forbidden.error.code));
  }
  assert.deepEqual(await snapshot(),before);
  const raceMember=`mem_fixture_${randomUUID()}`;
  const payments=users.map(()=>`pay_fixture_${randomUUID()}`);
  const raced=await Promise.all(users.map((user,index)=>admin.rpc('fulfill_whop_payment',args(user.id,payments[index],raceMember))));
  assert.equal(raced.filter(r=>r.data===true&&!r.error).length,1);
  assert.equal(raced.filter(r=>r.error?.message.includes('membership_owner_mismatch')).length,1);
  const winner=raced.findIndex(r=>r.data===true&&!r.error),loser=1-winner;
  const stored=await admin.from('whop_memberships').select('user_id,whop_payment_id').eq('whop_membership_id',raceMember).single();assert.equal(stored.error,null);assert.equal(stored.data?.user_id,users[winner].id);assert.equal(stored.data?.whop_payment_id,payments[winner]);
  const missing=await admin.from('whop_payment_fulfillments').select('id').eq('whop_payment_id',payments[loser]);assert.equal(missing.error,null);assert.deepEqual(missing.data,[]);
  const replay=await admin.rpc('fulfill_whop_payment',args(users[winner].id,payments[winner],raceMember));assert.equal(replay.error,null);assert.equal(replay.data,false);
  const foreignReplay=await admin.rpc('fulfill_whop_payment',args(users[loser].id,payments[winner],raceMember));assert.match(foreignReplay.error?.message??'',/payment_owner_mismatch/);
});
