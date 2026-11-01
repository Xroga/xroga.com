/**
 * EAS workflow dispatch for user-owned Expo projects.
 * Uses original actor and owned provider metadata for every operation.
 * App creation and workflows require exact durable action confirmation.
 */

import {
  prepareUserProviderKeyWrite,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {captureExpoAccess,beforeExpoRequest,readExpoResponse,verifyExpoProject,requireExpoAccess,validExpoId,type ExpoAccess,type ExpoQuery} from './expoAccess.js';
import {requireTenantContext,requireResourceOwner,type TenantContext}from'../../security/tenantContext.js';
import type{AuthorityPermit}from'../../security/authority/types.js';
import type{BusinessActionPlan}from'../integrations/businessAction.js';

const EXPO_API = 'https://api.expo.dev';

export type MobilePlatform = 'android' | 'ios';
export interface ExpoActorInput{userId:string;tenantContext?:TenantContext;signal?:AbortSignal}

async function expoFetch(
  token: string,
  path: string,
  init?: RequestInit,
  access?:ExpoAccess,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const signal=await beforeExpoRequest(access,token,path,init);
  let res:Response;
  try{res = await fetch(`${EXPO_API}${path}`, {
    ...init,
    redirect:'manual',signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });}catch{await access!.check();if(signal.aborted)throw new DOMException('Expo request cancelled.','AbortError');throw new Error('Expo request is unavailable. No automatic retry was made.');}
  return readExpoResponse(access!,res);
}
const queryFor=(access:ExpoAccess):ExpoQuery=>async<T>(query:string,variables?:Record<string,unknown>)=>{
 const response=await expoFetch(access.token,'/graphql',{method:'POST',body:JSON.stringify({query,variables})},access),body=response.json as{data?:T};
 if(!response.ok||!body?.data)throw new Error('Expo metadata is unavailable.');return body.data;
};
const denied=()=>new AuthorityError('EXPO_PUBLICATION_ADMISSION_DENIED');

function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30).replace(/-+$/g,'');
  return slug.length >= 3 ? slug : `app-${Date.now().toString(36).slice(-6)}`;
}

/** List EAS apps visible to this Expo token (for project picker). */
export async function listExpoApps(token: string,input?:ExpoActorInput,_access?:ExpoAccess): Promise<
  Array<{ id: string; name: string; slug?: string; accountId?: string; accountName?: string }>
> {
  if(!input)throw denied();const context=requireTenantContext(input.tenantContext);requireResourceOwner(context,input.userId);
  const access=_access?requireExpoAccess(_access,context):await captureExpoAccess(input.userId,context,input.signal);
  try{if(token!==access.token)throw denied();
  const query = `
    query XrogaListApps {
      me {
        accounts {
          id
          name
          apps(limit: 50, offset: 0) {
            id
            name
            slug
            fullName
          }
        }
      }
    }
  `;
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query }),
  },access);
  if (!res.ok) {
    throw new Error(
      `Expo GraphQL ${res.status}: ${(res.json as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message || res.text.slice(0, 160)}`,
    );
  }
  const data = res.json as {
    data?: {
      me?: {
        accounts?: Array<{
          id?: string;
          name?: string;
          apps?: Array<{ id?: string; name?: string; slug?: string; fullName?: string }>;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) {
    throw new Error(data.errors[0]?.message || 'Expo GraphQL error');
  }
  const apps: Array<{
    id: string;
    name: string;
    slug?: string;
    accountId?: string;
    accountName?: string;
  }> = [];
  const accounts=data.data?.me?.accounts;
  if(!Array.isArray(accounts)||accounts.length>100||accounts.some(row=>!row||!validExpoId(row.id)||typeof row.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(row.name)||!Array.isArray(row.apps)||row.apps.length>50)||new Set(accounts.map(row=>row.id)).size!==accounts.length)throw denied();
  for (const account of accounts) {
    for (const app of account.apps ?? []) {
      if(!validExpoId(app.id)||typeof app.slug!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(app.slug)||typeof app.name!=='string'||app.name.length>500)throw denied();
      if (app.id) {
        apps.push({
          id: app.id,
          name: app.fullName || app.name || app.slug || app.id,
          slug: app.slug,
          accountId: account.id,
          accountName: account.name,
        });
      }
    }
  }
  if(new Set(apps.map(app=>app.id)).size!==apps.length)throw denied();await access.check();
  return apps;
  }finally{if(!_access)access.close();}
}

async function listExpoAccounts(token: string,access:ExpoAccess): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query XrogaAccounts {
      me {
        accounts {
          id
          name
        }
      }
    }
  `;
  const res = await expoFetch(token, '/graphql', {
    method: 'POST',
    body: JSON.stringify({ query }),
  },access);
  if (!res.ok) {
    throw new Error(`Expo accounts ${res.status}: ${res.text.slice(0, 160)}`);
  }
  const data = res.json as {
    data?: { me?: { accounts?: Array<{ id?: string; name?: string }> } };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'Expo GraphQL error');
  const rows=data.data?.me?.accounts;if(!Array.isArray(rows)||rows.length>100||rows.some(a=>!validExpoId(a.id)||typeof a.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(a.name))||new Set(rows.map(a=>a.id)).size!==rows.length)throw denied();
  return rows
    .filter((a): a is { id: string; name: string } => Boolean(a.id && a.name))
    .map((a) => ({ id: a.id, name: a.name }));
}

/** Retained legacy signature. A raw token never grants remote creation authority. */
export async function createExpoApp(
  _token: string,
  _opts: { accountId: string; projectName: string },
): Promise<string> {
  // A token is adapter authentication, never authority to create an app.
  // The canonical native executor owns the approved creation operation.
  throw denied();
}

/**
 * Verify a selected project, show the existing picker, or prepare creation
 * under the sole owned account. Creation never silently changes the saved selection.
 */
export async function ensureExpoProjectLinked(opts: {
  userId: string;
  tenantContext?:TenantContext;
  signal?:AbortSignal;
  projectName?: string;
  explicitProjectId?: string;
}): Promise<{
  projectId: string | null;
  created: boolean;
  message: string;
  error?: string;
  needsConfirmation?:boolean;
  reviewUrl?:string;
}> {
  opts={...opts};const access=await captureExpoAccess(opts.userId,opts.tenantContext,opts.signal);
  try{
    const selected=opts.explicitProjectId?.trim()||await access.pin('expo_project_id');
    if(selected){await verifyExpoProject(access,queryFor(access),selected);return{projectId:selected,created:false,message:'Owned EAS project verified.'};}
    const apps=await listExpoApps(access.token,opts,access);
    if(apps.length)return{projectId:null,created:false,message:'Select an owned Expo project in Publish to link it.',error:'NEED_PROJECT_PICK'};
    const rows=await listExpoAccounts(access.token,access);
    if(rows.length!==1)return{projectId:null,created:false,message:'Choose the account and create an app directly in Expo, then select it in Publish.',error:'EXACT_ACCOUNT_REQUIRED'};
    const account=rows[0]!,slug=slugifyProjectName(opts.projectName||'xroga-app');
    const{prepareExpoNativeAction}=await import('./expoApproval.js');
    const prepared=await prepareExpoNativeAction({context:access.context,operation:'XROGA_EXPO_CREATE_APP',accountId:account.id,
      arguments:{accountId:account.id,accountName:account.name,slug,connection:access.bindings(),destination:EXPO_API+'/graphql'},
      summary:`Create unpublished Expo app @${account.name}/${slug}. Select it in Publish afterward to link it. No build starts.`,check:access.check});
    return{...prepared,projectId:null,created:false};
  }finally{access.close();}
}

/** Patch app.json extra.eas.projectId in generated files (in-memory before GitHub push). */
export function patchExpoProjectIdInFiles(
  files: ProjectFile[],
  projectId: string,
): ProjectFile[] {
  return files.map((f) => {
    if (f.path !== 'app.json' && !f.path.endsWith('/app.json')) return f;
    try {
      const json = JSON.parse(f.content) as {
        expo?: {
          extra?: { eas?: { projectId?: string }; [k: string]: unknown };
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
      if (!json.expo) return f;
      const extra = { ...(json.expo.extra || {}) };
      const eas = { ...((extra.eas as Record<string, unknown>) || {}), projectId };
      extra.eas = eas;
      json.expo = { ...json.expo, extra };
      return { ...f, content: `${JSON.stringify(json, null, 2)}\n` };
    } catch {
      // Fallback string replace for placeholder
      if (f.content.includes('REPLACE_WITH_EAS_PROJECT_ID')) {
        return {
          ...f,
          content: f.content.replace(/REPLACE_WITH_EAS_PROJECT_ID/g, projectId),
        };
      }
      return f;
    }
  });
}

export async function resolveExpoProjectId(
  userId: string,
  explicit?: string,
  tenantContext?:TenantContext,
): Promise<string | null> {
  const access=await captureExpoAccess(userId,tenantContext);
  try{const projectId=explicit?.trim()||await access.pin('expo_project_id');if(!projectId)return null;await verifyExpoProject(access,queryFor(access),projectId);return projectId;}finally{access.close();}
}

export async function linkOwnedExpoProject(input:ExpoActorInput&{projectId:string}){
 const context=requireTenantContext(input.tenantContext);requireResourceOwner(context,input.userId);
 const writeAdmission=await prepareUserProviderKeyWrite(input.userId,'expo_project_id');
 const access=await captureExpoAccess(input.userId,context,input.signal);
 try{await verifyExpoProject(access,queryFor(access),input.projectId);await access.check();const saved=await saveUserProviderKey(input.userId,'expo_project_id',input.projectId,{writeAdmission});await access.check();return saved;}finally{access.close();}
}

/**
 * Prepare an exact immutable-source workflow approval. Dispatch belongs only
 * to the canonical executor. Store submission requires verified Expo configuration.
 */
export async function triggerEasPublish(opts: {
  userId: string;
  tenantContext?:TenantContext;
  signal?:AbortSignal;
  platform: MobilePlatform;
  projectId?: string;
  databaseProjectId?:string;
  gitRef?: string;
  submit?: boolean;
  projectName?: string;
}): Promise<{
  ok: boolean;
  workflowRunId?: string;
  url?: string;
  fileName: string;
  message: string;
  error?: string;
  projectId?: string;
  needsConfirmation?:boolean;
  reviewUrl?:string;
  manualSetupRequired?:boolean;
  setupUrl?:string;
}> {
  const{prepareExpoWorkflow}=await import('./expoWorkflow.js');
  return prepareExpoWorkflow({...opts},queryFor);
}

/** Native effects stay behind the existing exact durable executor and transport. */
export async function executeExpoNativeAction(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){
 const{executeExpoAction}=await import('./expoWorkflow.js');
 return executeExpoAction(userId,plan,permit,{queryFor,request:(access,path,init)=>expoFetch(access.token,path,init,access),accounts:access=>listExpoAccounts(access.token,access)});
}
