import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import type {BusinessActionPlan} from '../integrations/businessAction.js';
import {prepareGitHubAction} from '../integrations/githubApproval.js';
import {createGitHubRequestScope} from '../integrations/githubRequest.js';
import {makeAtomicWriteApi} from '../integrations/githubAtomicTransport.js';
import {readStartingTree} from '../integrations/githubTreeSnapshot.js';
import {inspectNativeArtifactSource} from '../publish/nativeArtifact.js';
import {executePublication} from '../integrations/githubPublication.js';
/**
 * Copies a showcase template into a repository the user owns, on a feature branch,
 * and opens a pull request.
 *
 * Safety rules enforced here:
 *  - the template id is resolved against a server allow-list, never a client path
 *  - push permission is verified before anything is written
 *  - the target directory and every file path are checked for traversal
 *  - existing files are inspected first and never silently overwritten
 *  - work always lands on a new feature branch, never the default branch
 *  - the shared template source is only ever read, never modified
 */

import { ghFetch, parseRepoName, type ProjectFile } from '../integrations/githubDeploy.js';
import { getGitHubToken } from '../integrations/githubAuth.js';
import {
  buildTemplateFiles,
  isSafeRepoPath,
  normalizeTargetDirectory,
  resolveTemplateSource,
} from './templateSources.js';

export interface ExportPlanFile {
  path: string;
  status: 'create' | 'skip-conflict';
  bytes: number;
}

export interface ExportResult {
  needsConfirmation?:boolean;
  reviewUrl?:string;
  ok: boolean;
  repoFullName: string;
  branch: string;
  baseBranch: string;
  commitSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  filesCreated: number;
  filesSkipped: number;
  plan: ExportPlanFile[];
  /** Populated when a conflict or partial result needs reporting honestly. */
  warnings: string[];
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_connected'
      | 'unknown_template'
      | 'bad_repo'
      | 'no_permission'
      | 'unsafe_path'
      | 'branch_failed'
      | 'push_failed'
      | 'nothing_to_write',
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export async function exportTemplateToRepo(opts:{userId:string;tenantContext?:TenantContext;templateId:string;repoFullName:string;branch:string;projectName:string;userPrompt?:string;targetDirectory?:unknown;baseBranch?:string}):Promise<ExportResult>{
 const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
 const token=await getGitHubToken(opts.userId);if(!token)throw new ExportError('GitHub is not connected.','not_connected',409);
 const source=resolveTemplateSource(opts.templateId),target=normalizeTargetDirectory(opts.targetDirectory);if(!source)throw new ExportError('Unknown template.','unknown_template');if(target===null)throw new ExportError('Unsafe target directory.','unsafe_path');
 const {owner,repo}=parseRepoName(opts.repoFullName),repository=owner+'/'+repo;
 if(!/^xroga\/template-[a-z0-9-]{1,40}-[a-z0-9]{1,8}$/.test(opts.branch))throw new ExportError('A new template feature branch is required.','branch_failed');
 const access=await createGitHubRequestScope(context,token,repository);
 try{
  const read=(path:string)=>ghFetch(token,path,undefined,access.scope),res=await read('/repos/'+repository);if(!res.ok)throw new ExportError('Repository is unavailable.','bad_repo');const meta=await res.json() as{full_name?:string;default_branch?:string;private?:boolean;permissions?:{push?:boolean}};
  if(meta.full_name!==repository||meta.permissions?.push!==true||!meta.default_branch)throw new ExportError('Repository write access is required.','no_permission',403);
  const baseBranch=opts.baseBranch?.trim()||meta.default_branch;if(opts.branch===baseBranch||opts.branch===meta.default_branch)throw new ExportError('Feature branch must be distinct.','branch_failed');
  const api=makeAtomicWriteApi((t,p,i)=>ghFetch(t,p,i,access.scope),token,owner,repo),head=await api.getRef(baseBranch);if(!head||!/^[a-f0-9]{40}$/.test(head.sha)||await api.getRef(opts.branch))throw new ExportError('Base is unavailable or the feature branch already exists.','branch_failed',409);
  const tree=await readStartingTree(api,head.sha),existing=new Set(tree.entries.map(f=>f.path)),built=buildTemplateFiles({templateId:opts.templateId,projectName:opts.projectName,userPrompt:opts.userPrompt});if(!built)throw new ExportError('Unknown template.','unknown_template');
  const plan:ExportPlanFile[]=[],files:ProjectFile[]=[];for(const file of built.files){const path=target?target+'/'+file.path:file.path;if(!isSafeRepoPath(path))throw new ExportError('Unsafe template file path.','unsafe_path');const conflict=existing.has(path);plan.push({path,status:conflict?'skip-conflict':'create',bytes:Buffer.byteLength(file.content)});if(!conflict)files.push({path,content:file.content});}
  inspectNativeArtifactSource(files,[token]);if(!files.length)throw new ExportError('All template files already exist. Choose another target directory.','nothing_to_write',409);
  const skipped=plan.length-files.length,parameters={repository,connection:access.fingerprint,branch:opts.branch,defaultBranch:meta.default_branch,head:head.sha,createFrom:head.sha,creating:false,visibility:meta.private?'private':'public',allowEmptyBootstrap:false,deletePaths:[],message:'Add '+source.slug+' template via Xroga',pullRequest:{base:baseBranch,title:'Add '+source.slug+' template',body:'Review the exact template source before merging.'},template:{id:source.slug,version:String(source.version),skipped}};
  const pending=await prepareGitHubAction({context,kind:'TEMPLATE',parameters,token,files,rebuildTemplate:{templateId:opts.templateId,projectName:opts.projectName,userPrompt:opts.userPrompt,targetDirectory:target??'',paths:files.map(f=>f.path)},check:access.check,summary:`Copy ${source.slug} v${source.version} to ${repository} on new branch ${opts.branch}, based on ${head.sha}, and open a pull request to ${baseBranch}. ${skipped} existing files remain untouched. Repository hooks may run under its own billing.`});
  return{...pending,ok:false,repoFullName:repository,branch:opts.branch,baseBranch,filesCreated:0,filesSkipped:skipped,plan,warnings:[]};
 }finally{access.close();}
}
export async function executeApprovedTemplateExport(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){return executePublication(userId,plan,permit,'TEMPLATE');}
