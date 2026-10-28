import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import {requireOwnedProject} from '../../security/ownership.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import type {BusinessActionPlan} from './businessAction.js';
import {getGitHubToken,setGithubDefaultRepo,getGitHubStorageMeta} from './githubAuth.js';
import {createGitHubRequestScope,type GitHubCall} from './githubRequest.js';
import {ghFetch,parseRepoName,type ProjectFile,type GitHubPushOptions} from './githubDeploy.js';
import {prepareGitHubAction,readGitHubAction,type GitHubNativeKind} from './githubApproval.js';
import {inspectNativeArtifactSource} from '../publish/nativeArtifact.js';
import {makeAtomicWriteApi} from './githubAtomicTransport.js';
import {writeAtomically,type AtomicWriteRequest,type AtomicWriteRecord} from './githubAtomicWrite.js';
import {deriveFileSyncMutations,planMutation,finalizeTreeEntries} from './githubMutationPlan.js';
import {planRunBranch} from './githubRunBranch.js';
import {nextCandidateName,MAX_NAME_COLLISION_RETRIES} from './githubRepoCreation.js';

const denied=()=>new AuthorityError('GITHUB_PUBLICATION_NOT_VERIFIED');
const fullSha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const branchValid=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_./-]{0,199}$/.test(value)&&!value.includes('..')&&!value.includes('//')&&!value.endsWith('/')&&!value.endsWith('.lock')&&!value.endsWith('.');
const gitBlob=(content:string)=>{const bytes=Buffer.from(content,'utf8');return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');};
const urlFor=(repo:string)=>'https://github.com/'+repo;
const readJSON=async(response:Response)=>{if(!response.ok)throw denied();return await response.json() as Record<string,any>;};

type Parameters={repository:string;connection:string;branch:string;defaultBranch:string;head:string|null;createFrom:string|null;creating:boolean;visibility:'private'|'public';allowEmptyBootstrap:boolean;deletePaths:string[];message:string;pullRequest?:{base:string;title:string;body:string};restore?:{commit:string;tree:string};template?:{id:string;version:string;skipped:number}};
function parameters(value:Record<string,unknown>):Parameters{
 const p=structuredClone(value) as unknown as Parameters;const{owner,repo}=parseRepoName(p.repository);if(owner+'/'+repo!==p.repository||!branchValid(p.branch)||!branchValid(p.defaultBranch)||!['private','public'].includes(p.visibility)||typeof p.connection!=='string'||p.head!==null&&!fullSha(p.head)||p.createFrom!==null&&!fullSha(p.createFrom)||typeof p.creating!=='boolean'||typeof p.allowEmptyBootstrap!=='boolean'||!Array.isArray(p.deletePaths)||p.deletePaths.some(x=>typeof x!=='string')||typeof p.message!=='string'||p.message.length>2000||p.restore&&(!fullSha(p.restore.commit)||!fullSha(p.restore.tree)))throw denied();return p;
}
async function credentials(userId:string,supplied?:TenantContext,projectId?:string){const context=requireTenantContext(supplied);requireResourceOwner(context,userId);if(projectId)await requireOwnedProject(context,projectId);const token=await getGitHubToken(userId);if(!token)throw denied();return{context,token};}

export async function prepareGitHubPush(userId:string,input:ProjectFile[],opts:GitHubPushOptions){
 const {context,token}=await credentials(userId,opts.tenantContext,opts.projectId),files=inspectNativeArtifactSource(input,[token]);
 const snapshot={targetRepo:opts.targetRepo,targetBranch:opts.targetBranch,slug:opts.slug,deletePaths:[...(opts.deletePaths??[])],runId:opts.runId,expectedStartingHeadSha:opts.expectedStartingHeadSha,directWriteAuthorized:opts.directWriteAuthorized===true,allowEmptyBootstrap:opts.allowEmptyBootstrap===true,visibility:opts.visibility??'private'};
 const stored=await getGitHubStorageMeta(userId),selected=snapshot.targetRepo??stored?.default_repo;let repository:string,creating=!selected;
 if(selected){const{owner,repo}=parseRepoName(selected);repository=owner+'/'+repo;}
 else{
  const identity=await createGitHubRequestScope(context,token,null,opts.signal);let login:string;try{const user=await readJSON(await ghFetch(token,'/user',undefined,identity.scope));login=user.login;if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login))throw denied();}finally{identity.close();}
  repository='';for(let attempt=0;attempt<MAX_NAME_COLLISION_RETRIES;attempt++){const candidate=nextCandidateName(snapshot.slug??'xroga-build',attempt),name=login+'/'+candidate;parseRepoName(name);const probe=await createGitHubRequestScope(context,token,name,opts.signal);try{const res=await ghFetch(token,'/repos/'+name,undefined,probe.scope);if(res.status===404){repository=name;break;}if(!res.ok)throw denied();}finally{probe.close();}}if(!repository)throw denied();
 }
 const access=await createGitHubRequestScope(context,token,repository,opts.signal);
 try{
  let visibility=snapshot.visibility;let branch=snapshot.targetBranch??'main',defaultBranch='main',head:string|null=null,createFrom:string|null=null,pullRequest:Parameters['pullRequest'];if(!branchValid(branch))throw denied();
  if(!creating){const meta=await readJSON(await ghFetch(token,'/repos/'+repository,undefined,access.scope));if(meta.full_name!==repository||meta.permissions?.push!==true||!branchValid(meta.default_branch))throw denied();defaultBranch=meta.default_branch;visibility=meta.private?'private':'public';
   const api=makeAtomicWriteApi((t,p,i)=>ghFetch(t,p,i,access.scope),token,...Object.values(parseRepoName(repository)) as [string,string]);
   if(await api.isRepositoryEmpty()){if(!snapshot.allowEmptyBootstrap||branch!==defaultBranch)throw denied();}
   else{const ref=await api.getRef(branch);if(!ref||!fullSha(ref.sha))throw denied();head=ref.sha;if(snapshot.expectedStartingHeadSha&&snapshot.expectedStartingHeadSha!==head)throw denied();const protectedBranch=await api.isBranchProtected(branch);if(protectedBranch===null)throw denied();if((branch===defaultBranch||protectedBranch)&&!snapshot.directWriteAuthorized){if(!snapshot.runId)throw denied();const run=await planRunBranch(api,{runId:snapshot.runId,sourceSha:head,baseBranch:branch});createFrom=head;branch=run.branch;pullRequest={base:run.baseBranch,title:'Xroga build update',body:'Review the exact source change before merging.'};}}
  }else if(branch!=='main')throw denied();
  const p:Parameters={repository,connection:access.fingerprint,branch,defaultBranch,head,createFrom,creating,visibility,allowEmptyBootstrap:creating||snapshot.allowEmptyBootstrap,deletePaths:snapshot.deletePaths,message:'Xroga approved build update',...(pullRequest?{pullRequest}:{})};
  const pending=await prepareGitHubAction({context,kind:'PUSH',parameters:p as unknown as Record<string,unknown>,token,files,projectId:opts.projectId,check:access.check,summary:`${creating?'Create '+snapshot.visibility+' repository and publish':'Publish'} ${repository}, exact branch ${branch}${head?' from '+head:''}. Review source, deletions and repository workflows before approving. Existing repository hooks and Actions may run under its own billing.`});
  return{...pending,repoName:repository,repoUrl:urlFor(repository),htmlUrl:urlFor(repository),branch};
 }finally{access.close();}
}

export async function prepareGitHubRestore(userId:string,repoName:string,commit:string,branch:string,supplied?:TenantContext){
 const{context,token}=await credentials(userId,supplied),{owner,repo}=parseRepoName(repoName),repository=owner+'/'+repo;if(!fullSha(commit)||!branchValid(branch))throw denied();const access=await createGitHubRequestScope(context,token,repository);
 try{const meta=await readJSON(await ghFetch(token,'/repos/'+repository,undefined,access.scope));if(meta.full_name!==repository||meta.permissions?.push!==true||!branchValid(meta.default_branch))throw denied();const api=makeAtomicWriteApi((t,p,i)=>ghFetch(t,p,i,access.scope),token,owner,repo),head=await api.getRef(branch),tree=await api.getCommitTreeSha(commit);if(!head||!fullSha(head.sha)||!fullSha(tree))throw denied();const p:Parameters={repository,connection:access.fingerprint,branch,defaultBranch:meta.default_branch,head:head.sha,createFrom:null,creating:false,visibility:meta.private?'private':'public',allowEmptyBootstrap:false,deletePaths:[],message:'Xroga approved restoration of '+commit,restore:{commit,tree}};return{...await prepareGitHubAction({context,kind:'RESTORE',parameters:p as unknown as Record<string,unknown>,token,check:access.check,summary:`Restore ${repository} branch ${branch} from ${head.sha} using tree of ${commit}. A new restoration commit preserves history. Repository hooks may run. Deployment is a separate approval.`}),ok:false,branch,commitSha:commit,htmlUrl:urlFor(repository)};}finally{access.close();}
}

/** Execute only the immutable canonical producer plan. No client boolean grants authority. */
export async function executePublication(userId:string,plan:BusinessActionPlan,permit:AuthorityPermit|undefined,kind:GitHubNativeKind){
 const action=await readGitHubAction(userId,plan,permit);if(action.plan.toolSlug!=='XROGA_GITHUB_'+kind)throw denied();const{source:_source,...raw}=action.plan.arguments,p=parameters(raw);action.assertParameters(raw);const token=await getGitHubToken(userId);if(!token)throw denied();const files=action.files?inspectNativeArtifactSource(action.files,[token]):undefined;if(kind!=='RESTORE'&&!files)throw denied();
 const access=await createGitHubRequestScope(action.context,token,p.repository),{owner,repo}=parseRepoName(p.repository),base='/repos/'+p.repository;
 let record:AtomicWriteRecord|undefined;
 let expected:GitHubCall|undefined,expectedTree:unknown,treeSha:string|undefined,commitSha:string|undefined,parent=p.head,bootstrap=false,refCreated=false,created=false,refUpdated=false;
 const blobContents=new Map((files??[]).map(f=>[Buffer.from(f.content,'utf8').toString('base64'),gitBlob(f.content)]));
 const before=async(call:GitHubCall)=>{
  if(!expected||!isDeepStrictEqual(call,expected))throw denied();const b=call.body!;
  if(call.path==='/user/repos'){if(!p.creating||created||b.name!==repo||b.private!==(p.visibility==='private')||b.auto_init!==false)throw denied();}
  else if(call.path===base+'/git/blobs'){if(b.encoding!=='base64'||!blobContents.has(String(b.content)))throw denied();}
  else if(call.path===base+'/git/trees'){if(!expectedTree||!isDeepStrictEqual(b,expectedTree))throw denied();}
  else if(call.path===base+'/git/commits'){if(b.message!==p.message||b.tree!==(p.restore?.tree??treeSha)||!isDeepStrictEqual(b.parents,parent?[parent]:[]))throw denied();}
  else if(call.path===base+'/git/refs'){if(!p.createFrom||refCreated||b.ref!=='refs/heads/'+p.branch||b.sha!==p.createFrom)throw denied();}
  else if(call.path===base+'/git/refs/heads/'+p.branch.split('/').map(encodeURIComponent).join('/')){if(refUpdated||b.force!==false||!commitSha||b.sha!==commitSha)throw denied();}
  else if(call.path===base+'/contents/.xroga/bootstrap'){if(!p.allowEmptyBootstrap||parent||bootstrap||b.branch!==p.branch||b.content!==Buffer.from('Initialized by Xroga AI. This marker is removed by the first product commit.\n').toString('base64'))throw denied();}
  else if(call.path===base+'/pulls'){if(!p.pullRequest||!isDeepStrictEqual(b,{head:p.branch,...p.pullRequest}))throw denied();}
  else throw denied();
 };
 const after=async(call:GitHubCall,status:number,result:unknown)=>{
  if(call.method==='GET'||status<200||status>=300)return;const data=result as Record<string,any>;
  if(call.path==='/user/repos'){if(status!==201||data.full_name!==p.repository||data.private!==(p.visibility==='private')||data.default_branch!==p.defaultBranch)throw denied();created=true;}
  else if(call.path.endsWith('/git/blobs')){if(data.sha!==blobContents.get(String(call.body!.content)))throw denied();}
  else if(call.path.endsWith('/git/trees')){if(!fullSha(data.sha))throw denied();treeSha=data.sha;}
  else if(call.path.endsWith('/git/commits')){if(!fullSha(data.sha)||data.tree?.sha!==(p.restore?.tree??treeSha)||!isDeepStrictEqual(data.parents?.map((v:{sha:string})=>v.sha),parent?[parent]:[]))throw denied();commitSha=data.sha;}
  else if(call.path.endsWith('/git/refs')){if(status!==201||data.ref!=='refs/heads/'+p.branch||data.object?.sha!==p.createFrom||data.object?.type!=='commit')throw denied();refCreated=true;}
  else if(call.method==='PATCH'){if(data.ref!=='refs/heads/'+p.branch||data.object?.sha!==commitSha||data.object?.type!=='commit')throw denied();refUpdated=true;}
  else if(call.method==='PUT'){if(!fullSha(data.commit?.sha))throw denied();parent=data.commit.sha;bootstrap=true;}
  else if(call.path.endsWith('/pulls')){if(!Number.isSafeInteger(data.number)||data.number<1||data.html_url!==urlFor(p.repository)+'/pull/'+data.number)throw denied();}
 };
 const request=async(t:string,path:string,init?:RequestInit)=>{if((init?.method??'GET')!=='GET')expected=Object.freeze({method:init!.method!,path,body:JSON.parse(String(init!.body))});try{return await ghFetch(t,path,init,access.scope);}finally{expected=undefined;}};
 try{
  action.install(access,before,after);await action.check();
  const existing=await ghFetch(token,base,undefined,access.scope);
  if(p.creating){if(existing.status!==404)throw denied();const response=await request(token,'/user/repos',{method:'POST',body:JSON.stringify({name:repo,private:p.visibility==='private',auto_init:false,description:'Built with Xroga'})});if(!response.ok)throw denied();}
  else{const meta=await readJSON(existing);if(meta.full_name!==p.repository||meta.permissions?.push!==true||meta.default_branch!==p.defaultBranch||meta.private!==(p.visibility==='private'))throw denied();}
  const api=makeAtomicWriteApi(request,token,owner,repo);
  if(p.createFrom&&await api.getRef(p.branch))throw denied();
  if(kind==='RESTORE'){
   const current=await api.getRef(p.branch),restoreTree=await api.getCommitTreeSha(p.restore!.commit);if(current?.sha!==p.head||restoreTree!==p.restore!.tree)throw denied();
   await api.createCommit(p.message,p.restore!.tree,p.head);const updated=await api.updateRef(p.branch,commitSha!);if(!updated.ok||(await api.getRef(p.branch))?.sha!==commitSha)throw denied();
  }else{
   record=await writeAtomically(api,{owner,repo},{branch:p.branch,defaultBranch:p.defaultBranch,expectedStartingHeadSha:p.head,createBranchFromSha:p.createFrom,allowEmptyBootstrap:p.allowEmptyBootstrap,directWriteAuthorized:true,message:p.message,...(p.pullRequest?{pullRequest:p.pullRequest}:{}),mutations:tree=>{
    const mutations=deriveFileSyncMutations(tree,files!,p.deletePaths);const all=bootstrap?[...mutations,{kind:'delete' as const,path:'.xroga/bootstrap'}]:mutations,mutation=planMutation(tree,all);const byPath=new Map(mutation.pendingBlobs.map(f=>[f.path,gitBlob(f.content)]));expectedTree={base_tree:tree.treeSha,tree:finalizeTreeEntries(mutation,byPath)};return mutations;
   }} satisfies AtomicWriteRequest);
   await access.check();await action.check();if(!record.verified||record.resultingCommitSha!==commitSha)throw denied();
  }
  await action.completed();await access.check();return{ok:true,repoName:p.repository,repoUrl:urlFor(p.repository),htmlUrl:urlFor(p.repository),branch:p.branch,commitSha,...(p.restore?{restoredFrom:p.restore.commit}:{}),...(p.template?{template:p.template}:{}),verified:true,...(record?.pullRequest?{pullRequestUrl:record.pullRequest.htmlUrl}:{}),...(record?.pullRequestWarning?{warning:record.pullRequestWarning}:{})};
 }catch(error){await access.check();await action.check();throw error;}finally{access.close();}
}
export async function executeApprovedGitHubPush(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){const result=await executePublication(userId,plan,permit,'PUSH');await setGithubDefaultRepo(userId,result.repoName);return result;}
export async function executeApprovedGitHubRestore(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){return executePublication(userId,plan,permit,'RESTORE');}
