import{createHash}from'node:crypto';import{isDeepStrictEqual}from'node:util';
import{AuthorityError}from'../../security/authority/enforce.js';import type{AuthorityPermit}from'../../security/authority/types.js';
import{containsCredentialSecretText}from'../../security/egress/dataClassification.js';
import type{BusinessActionPlan}from'../integrations/businessAction.js';
import{getGitHubToken}from'../integrations/githubAuth.js';import{createGitHubSourceReader}from'../integrations/githubSourceRead.js';
import{nativeReleaseActor,nativeReleaseConnection}from'./nativeReleaseAdmission.js';
import{inspectNativeArtifactSource,requireNativeArtifactProject}from'./nativeArtifact.js';
import{captureExpoAccess,verifyExpoProject,installExpoWriteGuard,validExpoId,type ExpoAccess,type ExpoQuery,type ExpoOwnedProject}from'./expoAccess.js';
import{prepareExpoNativeAction,readExpoNativeAction,type ExpoNativeOperation}from'./expoApproval.js';
import{syncGooglePlayCredentialsToExpo,syncAppleAscApiKeyToExpo}from'./easCredentials.js';
import type{ExpoActorInput,MobilePlatform}from'./easPublish.js';
import{isTerminalModelFailure}from'../../ai/providerRuntime.js';

const denied=()=>new AuthorityError('EXPO_WORKFLOW_ADMISSION_DENIED');
const destination='https://api.expo.dev/v2/workflows/dispatch';
const CREATE='mutation XrogaCreateApp($appInput: AppInput!) { app { createApp(appInput: $appInput) { id } } }';
type QueryFor=(access:ExpoAccess)=>ExpoQuery;
interface WorkflowInput extends ExpoActorInput{platform:MobilePlatform;projectId?:string;databaseProjectId?:string;gitRef?:string;submit?:boolean;projectName?:string}
interface WorkflowResult{ok:boolean;fileName:string;message:string;projectId?:string;error?:string;needsConfirmation?:boolean;reviewUrl?:string;manualSetupRequired?:boolean;setupUrl?:string}
type StoreInput={userId:string;projectId:string;platform:MobilePlatform;submit:boolean};
async function storeReadiness(input:StoreInput,access:ExpoAccess){
 if(!input.submit)return null;
 await access.pin(input.platform==='android'?'google_play':'apple_asc_api');
 const result=input.platform==='android'?await syncGooglePlayCredentialsToExpo({...input,tenantContext:access.context}):await syncAppleAscApiKeyToExpo({...input,tenantContext:access.context});
 await access.check();return result;
}
/** Reuse the canonical GitHub source reader. It grants no write authority.
 * Both full source connections and exact immutable file bytes survive every wait. */
async function workflowSource(access:ExpoAccess,project:ExpoOwnedProject,input:{platform:MobilePlatform;gitRef:string;submit:boolean;signal?:AbortSignal;databaseProjectId?:string},checkClaim?:()=>Promise<void>){
 const sourceSignal=AbortSignal.any([AbortSignal.timeout(120000),...(input.signal?[input.signal]:[])]);
 if(!project.repository||!['android','ios'].includes(input.platform)||typeof input.gitRef!=='string'||!input.gitRef||input.gitRef.length>120||/[\x00-\x20\x7f]/.test(input.gitRef)||containsCredentialSecretText(input.gitRef))throw denied();
 const databaseProjectId=await requireNativeArtifactProject(access.context,project.repository,input.databaseProjectId);
 const connection=await nativeReleaseConnection(access.context),token=await getGitHubToken(access.context.userId);if(!token)throw denied();
 if([token,access.token].some(value=>value.length>=8&&input.gitRef.includes(value)))throw denied();
 const reader=await createGitHubSourceReader(access.context.userId,token,project.repository,access.context);
 const check=async()=>{sourceSignal.throwIfAborted();await access.check();await requireNativeArtifactProject(access.context,project.repository!,databaseProjectId);await reader.assertCurrent();if(await nativeReleaseConnection(access.context)!==connection)throw denied();if(checkClaim)await checkClaim();sourceSignal.throwIfAborted();};
 const request=async(path:string)=>{
  await check();
  try{const response=await reader.request(token,path,{signal:sourceSignal});await check();if(!response.ok)throw new Error('Source unavailable');return await response.json();}
  catch(error){await check();if(isTerminalModelFailure(error))throw denied();throw new Error('The selected Expo workflow source is unavailable. No build was queued.');}
 };
 const commit=await request(`/repos/${project.repository}/commits/${encodeURIComponent(input.gitRef)}`) as{sha?:unknown};
 if(typeof commit.sha!=='string'||!/^[a-f0-9]{40}$/.test(commit.sha))throw denied();
 const fileName=`${input.submit?'publish':'build'}-${input.platform}.yml`,path='.eas/workflows/'+fileName;
 const source=await request(`/repos/${project.repository}/contents/${path}?ref=${commit.sha}`) as{type?:string;path?:string;name?:string;encoding?:string;size?:number;content?:string};
 if(source.type!=='file'||source.path!==path||source.name!==fileName||source.encoding!=='base64'||typeof source.content!=='string'||!Number.isSafeInteger(source.size)||source.size!<1||source.size!>256*1024)throw denied();
 const encoded=source.content.replace(/\s/g,''),bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded||bytes.length!==source.size)throw denied();
 const text=bytes.toString('utf8');if(containsCredentialSecretText(text)||[token,access.token].some(value=>value.length>=8&&[value,Buffer.from(value).toString('base64'),Buffer.from(value).toString('base64url')].some(secret=>text.includes(secret))))throw denied();
 const gitCommit=await request(`/repos/${project.repository}/git/commits/${commit.sha}`) as{sha?:string;tree?:{sha?:string}};
 if(gitCommit.sha!==commit.sha||typeof gitCommit.tree?.sha!=='string'||!/^[a-f0-9]{40}$/.test(gitCommit.tree.sha))throw denied();
 const tree=await request(`/repos/${project.repository}/git/trees/${gitCommit.tree.sha}?recursive=1`) as{sha?:string;truncated?:boolean;tree?:Array<{path:string;type:string;mode:string;sha:string;size?:number}>};
 if(tree.sha!==gitCommit.tree.sha||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>2000||tree.tree.some(row=>!row||typeof row.path!=='string'||!['tree','blob'].includes(row.type)||!/^[a-f0-9]{40}$/.test(row.sha)||row.type==='blob'&&!['100644','100755'].includes(row.mode)))throw denied();
 const entries=tree.tree.filter(row=>row.type==='blob');if(!entries.length||entries.length>1000||entries.some(row=>!Number.isSafeInteger(row.size)||row.size!<0||row.size!>8*1024*1024)||entries.reduce((sum,row)=>sum+row.size!,0)>24*1024*1024)throw denied();
 // Reuse the existing strict file-name checks before retrieving blob bodies.
 inspectNativeArtifactSource(entries.map(row=>({path:row.path,content:''})),[token,access.token]);
 const files:Array<{path:string;content:string}>=[],facts:Array<{path:string;sha256:string;size:number}>=[];
 // Bounded read concurrency, no checkout, cache, disk artifact or provider write.
 let cursor=0,failed:unknown,hasFailure=false;
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
  while(cursor<entries.length&&!hasFailure){const row=entries[cursor++];try{
   const blob=await request(`/repos/${project.repository}/git/blobs/${row.sha}`) as{sha?:string;encoding?:string;size?:number;content?:string};
   if(blob.sha!==row.sha||blob.encoding!=='base64'||blob.size!==row.size||typeof blob.content!=='string')throw denied();
   const encoded=blob.content.replace(/\s/g,''),body=Buffer.from(encoded,'base64');
   if(body.toString('base64')!==encoded||body.length!==row.size||createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex')!==row.sha)throw denied();
   files.push({path:row.path,content:body.length>=2&&body[0]===255&&body[1]===254?body.toString('utf16le'):body.toString('utf8')});facts.push({path:row.path,sha256:createHash('sha256').update(body).digest('hex'),size:body.length});
  }catch(error){failed=error;hasFailure=true;}}
 }));
 if(hasFailure)throw failed instanceof Error?failed:denied();if(files.length!==entries.length||facts.length!==entries.length)throw denied();inspectNativeArtifactSource(files,[token,access.token]);
 if(files.some(file=>/^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/.test(file.content.trimStart())))throw Object.assign(new AuthorityError('EXPO_SOURCE_LFS_UNINSPECTED'),{message:'Git LFS objects cannot be inspected by this source gateway. Use regular Git files or run the workflow directly in Expo.'});
 const workflowFile=files.find(row=>row.path===path);if(!workflowFile||workflowFile.content!==text)throw denied();
 const sourceSha256=createHash('sha256').update(JSON.stringify(facts.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))).digest('hex');
 await check();return{connection,databaseProjectId,sourceTreeSha:tree.sha,sourceSha256,sourceFiles:files.length,commitSha:commit.sha,fileName,workflowSha256:createHash('sha256').update(bytes).digest('hex'),check};
}
export async function prepareExpoWorkflow(input:WorkflowInput,queryFor:QueryFor):Promise<WorkflowResult>{
 const access=await captureExpoAccess(input.userId,input.tenantContext,input.signal);
 try{
  const projectId=input.projectId?.trim()||await access.pin('expo_project_id');if(!projectId)return{ok:false,fileName:'',error:'NO_PROJECT',message:'Link an owned Expo project before preparing a build.'};
  const project=await verifyExpoProject(access,queryFor(access),projectId),submit=input.submit===true;
  const store=await storeReadiness({...input,projectId,submit},access);if(store&&!store.ok)return{...store,fileName:'',projectId};
  const gitRef=input.gitRef??'main',source=await workflowSource(access,project,{platform:input.platform,gitRef,submit,signal:input.signal,databaseProjectId:input.databaseProjectId});
  const args={accountId:project.accountId,project,connection:access.bindings(),githubConnection:source.connection,databaseProjectId:source.databaseProjectId,sourceTreeSha:source.sourceTreeSha,sourceSha256:source.sourceSha256,sourceFiles:source.sourceFiles,gitRef,commitSha:source.commitSha,fileName:source.fileName,workflowSha256:source.workflowSha256,platform:input.platform,submit,storeKeyId:store?.keyId??null,destination};
  const prepared=await prepareExpoNativeAction({context:access.context,operation:'XROGA_EXPO_WORKFLOW',accountId:project.accountId,arguments:args,summary:`Run ${source.fileName} for @${project.accountName}/${project.slug} from ${project.repository} at ${source.commitSha}${submit?', including store submission':''}. Expo account usage and store fees remain your responsibility.`,check:source.check});
  return{...prepared,fileName:source.fileName,projectId};
 }finally{access.close();}
}
interface Transport{queryFor:QueryFor;request:(access:ExpoAccess,path:string,init:RequestInit)=>Promise<{ok:boolean;status:number;json:unknown}>;accounts:(access:ExpoAccess)=>Promise<Array<{id:string;name:string}>>}
export async function executeExpoAction(userId:string,plan:BusinessActionPlan,permit:AuthorityPermit|undefined,transport:Transport){
 const actor=nativeReleaseActor(userId,undefined,plan,permit),operation=plan.toolSlug as ExpoNativeOperation;
 const admission=await readExpoNativeAction(actor,operation,permit),access=await captureExpoAccess(userId,actor.context,undefined,admission.checkClaim);
 try{
  const args=admission.plan.arguments;
  if(operation==='XROGA_EXPO_CREATE_APP'){
   await access.pin('expo_project_id');const rows=await transport.accounts(access),account=rows.find(row=>row.id===args.accountId);
   if(!account||account.name!==args.accountName||typeof args.slug!=='string'||!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(args.slug))throw denied();
   admission.assertArguments({accountId:account.id,accountName:account.name,slug:args.slug,connection:access.bindings(),destination:'https://api.expo.dev/graphql'});
   const variables={appInput:{accountId:account.id,projectName:args.slug}};
   const checkAccount=async()=>{await access.check();const current=(await transport.accounts(access)).find(row=>row.id===account.id);if(!current||current.name!==account.name)throw denied();await access.check();};
   installExpoWriteGuard(access,permit,admission.binding!,async(query,body)=>{if(query!==CREATE||!isDeepStrictEqual(body,variables))throw denied();await admission.begin(checkAccount);});
   const created=await transport.queryFor(access)<{app?:{createApp?:{id?:string}}}>(CREATE,variables),id=created.app?.createApp?.id;if(!validExpoId(id))throw denied();
   const project=await verifyExpoProject(access,transport.queryFor(access),id);if(project.accountId!==account.id||project.slug!==args.slug)throw denied();
   return{ok:true,projectId:id,message:'Expo app created and verified. Select it in Publish to link it before preparing a build.'};
  }
  if(operation!=='XROGA_EXPO_WORKFLOW')throw denied();
  const expected=args.project as ExpoOwnedProject;
  if(!expected||!validExpoId(expected.id)||!['android','ios'].includes(String(args.platform))||typeof args.submit!=='boolean'||typeof args.gitRef!=='string'||typeof args.commitSha!=='string'||!args.connection||typeof args.connection!=='object'||Array.isArray(args.connection))throw denied();
  if(Object.hasOwn(args.connection,'expo_project_id'))await access.pin('expo_project_id');
  const project=await verifyExpoProject(access,transport.queryFor(access),expected.id);if(!isDeepStrictEqual(project,expected))throw denied();
  const input={userId,projectId:project.id,platform:args.platform as MobilePlatform,submit:args.submit};
  const store=await storeReadiness(input,access);if(store&&!store.ok)throw denied();
  if(typeof args.databaseProjectId!=='string')throw denied();
  const source=await workflowSource(access,project,{...input,gitRef:args.commitSha,databaseProjectId:args.databaseProjectId},admission.checkClaim);
  admission.assertArguments({accountId:project.accountId,project,connection:access.bindings(),githubConnection:source.connection,databaseProjectId:source.databaseProjectId,sourceTreeSha:source.sourceTreeSha,sourceSha256:source.sourceSha256,sourceFiles:source.sourceFiles,gitRef:args.gitRef,commitSha:source.commitSha,fileName:source.fileName,workflowSha256:source.workflowSha256,platform:input.platform,submit:input.submit,storeKeyId:store?.keyId??null,destination});
  const body={appId:project.id,gitRef:source.commitSha,fileName:source.fileName};
  const checkTarget=async()=>{
   await source.check();const currentProject=await verifyExpoProject(access,transport.queryFor(access),project.id);if(!isDeepStrictEqual(currentProject,project))throw denied();
   const currentStore=await storeReadiness(input,access);if(currentStore&&!currentStore.ok||currentStore?.keyId!==store?.keyId)throw denied();await source.check();
  };
  installExpoWriteGuard(access,permit,admission.binding!,async(path,value)=>{
   if(path!=='/v2/workflows/dispatch'||!isDeepStrictEqual(value,body))throw denied();
   await admission.begin(checkTarget);
  });
  const response=await transport.request(access,'/v2/workflows/dispatch',{method:'POST',body:JSON.stringify(body)}),run=(response.json as{data?:{id?:string;url?:string}})?.data;
  if(!response.ok||!run?.id||!/^[a-f0-9-]{36}$/i.test(run.id))throw new Error('Expo dispatch is unverified. No automatic retry will run.');
  const url=`https://expo.dev/accounts/${project.accountName}/projects/${project.slug}/workflows/${run.id}`;if(run.url!==url)throw denied();
  const responseReceipt=await transport.request(access,`/v2/workflows/runs/${run.id}`,{method:'GET'}),receipt=(responseReceipt.json as{data?:{id?:string;url?:string;gitCommitHash?:string;requestedGitRef?:string;status?:string}})?.data;
  if(!responseReceipt.ok||receipt?.id!==run.id||receipt.url!==url||receipt.gitCommitHash!==source.commitSha||receipt.requestedGitRef!==source.commitSha||!['new','in-progress','action-required','success','failure','canceled'].includes(receipt.status??''))throw new Error('Expo workflow receipt is unverified. No automatic retry will run.');
  await source.check();return{ok:true,workflowRunId:run.id,url,workflowStatus:receipt.status,projectId:project.id,fileName:source.fileName,message:`The approved Expo workflow was dispatched and its source verified. Current run status: ${receipt.status}. Build completion and store approval are not verified by this dispatch receipt.`};
 }finally{access.close();}
}
