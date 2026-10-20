import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HACKATHON_MAX_STORED_FILES } from '../../config/modelRegistry.js';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { requireTenantContext,requireResourceOwner,type TenantContext } from '../../security/tenantContext.js';

/**
 * Persist build output to projects + project_files so users and AI can access old code.
 */
import { storeProjectFile } from '../storage/projectFiles.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds the project a build belongs to from the repository it targets.
 *
 * The client sends a project id only when the browser is on `/dashboard/projects/<id>`,
 * because that is the single place the id appears — it is parsed out of the URL. Builds
 * are typed into the terminal dock, which is present on every route, so a real build
 * usually arrives with no project id at all.
 *
 * That is fine for the legacy pipeline, which never asks. It is not fine for the
 * universal rollout: `routeProject` buckets on project id, so an absent id means a build
 * can never be allowlisted and never falls inside a percentage. Left alone, raising the
 * rollout to 50% would still route approximately nothing, because the identity it buckets
 * on is missing from most requests.
 *
 * Resolving from the target repository is not a fallback guess. `upsertBuildProject`
 * already treats `(user_id, github_repo_name)` as the identity of a project — this reads
 * the same key it writes, so the id recovered here is the id the build would be recorded
 * under when it completes.
 *
 * Returns null rather than throwing: a failed lookup must leave the build on the legacy
 * path, never break it.
 */
export async function findProjectIdByRepo(
  context: TenantContext,
  githubRepoName: string | null | undefined,
): Promise<string | null> {
  const {userId}=requireTenantContext(context);
  const repoName = githubRepoName ? normalizeRepoIdentity(githubRepoName) : null;
  if (!repoName || !userId) return null;
  try {
    return await lookupProjectIdByRepo(context, repoName);
  } catch {
    return null;
  }
}

/** Mutation callers must distinguish an absent row from unavailable authority. */
async function lookupProjectIdByRepo(context: TenantContext, repoName: string): Promise<string | null> {
    const {userId}=requireTenantContext(context);
    const { data, error } = await getSupabaseAdmin()
      .from('projects')
      .select('id,user_id,github_repo_name')
      .eq('user_id', userId)
      .ilike('github_repo_name', repoName.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle();
    if (error) throw new Error('Project identity lookup unavailable');
    if (!data) return null;
    return typeof data.id === 'string' && UUID.test(data.id) && data.user_id===userId
      && typeof data.github_repo_name==='string' && normalizeRepoIdentity(data.github_repo_name)===repoName ? data.id : null;
}

function normalizeRepoIdentity(value: string): string | null {
  const normalized = value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[^/\s]+\/[^/\s]+$/.test(normalized) ? normalized : null;
}

/**
 * Stable UUID for the repository-level persistence row.
 *
 * Branch and projectRoot remain part of the canonical ActiveProjectContext used by the
 * universal writer. The existing `projects` table is the repository container, so its id
 * is deliberately stable across branches while branch-specific files, commits and
 * checkpoints remain isolated by the full context key.
 */
export function projectIdentityId(userId: string, githubRepoName: string): string | null {
  const repoName = normalizeRepoIdentity(githubRepoName);
  if (!userId.trim() || !repoName) return null;
  const bytes = createHash('sha256').update(`${userId.trim()}\0${repoName}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Ensures a selected GitHub repository has the stable persistence identity required by
 * the universal writer before its first build.
 *
 * This is intentionally idempotent and generic. It does not inspect or classify the
 * repository. `type: app` only satisfies the legacy table constraint and is never used
 * to select a framework, language, capability or deployment path.
 */
export async function ensureProjectIdByRepo(
  context: TenantContext,
  githubRepoName: string | null | undefined,
): Promise<string | null> {
  const {userId}=requireTenantContext(context);
  const repoName = githubRepoName ? normalizeRepoIdentity(githubRepoName) : null;
  if (!repoName || !userId.trim()) return null;

  let existing: string | null;
  try { existing = await lookupProjectIdByRepo(context, repoName); }
  catch { return null; }
  if (existing) return existing;

  const id = projectIdentityId(userId, repoName);
  if (!id) return null;
  const repoLabel = repoName.slice(repoName.indexOf('/') + 1);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .upsert({
        id,
        user_id: userId,
        name: repoLabel.slice(0, 200),
        type: 'app',
        status: 'in_progress',
        github_repo_url: `https://github.com/${repoName}`,
        github_repo_name: repoName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id,user_id,github_repo_name')
      .maybeSingle();
    if (error || (data && (data.id !== id || data.user_id!==userId || data.github_repo_name!==repoName))) return null;
    if (data?.id === id && data.user_id===userId && data.github_repo_name===repoName) return id;

    // `ignoreDuplicates` may return no row. Re-read the deterministic id so concurrent
    // first requests converge on the same project rather than falling back to legacy.
    const { data: persisted, error: readError } = await supabase
      .from('projects')
      .select('id,user_id,github_repo_name')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!readError && persisted?.id === id && persisted.user_id===userId && persisted.github_repo_name===repoName) return id;
    console.warn('[buildProjectStore] project identity unavailable');
    return null;
  } catch {
    console.warn('[buildProjectStore] project identity unavailable');
    return null;
  }
}

export interface UpsertBuildProjectInput {
  userId: string;
  name: string;
  type?: 'website' | 'app' | 'game' | 'research' | 'automation' | 'video';
  userPrompt: string;
  githubRepoUrl?: string;
  githubRepoName?: string;
  githubBranch?: string;
  deployUrl?: string;
  projectFiles: ProjectFile[];
  runId?: string;
  summaryText?: string;
  isHackathon?: boolean;
}

const CORE_FILES = new Set([
  'index.html',
  'styles.css',
  'script.js',
  'package.json',
  'README.md',
]);

/** Upsert a project row and store core build files for later restore. */
export async function upsertBuildProject(context: TenantContext,input: UpsertBuildProjectInput): Promise<string | null> {
  const {userId}=requireTenantContext(context);
  requireResourceOwner(context,input.userId);
  // A delayed ownership lookup must not let a caller replace the admitted owner,
  // repository or file contents while this persistence operation is underway.
  input = structuredClone(input);
  const supabase = getSupabaseAdmin();
  const repoName = input.githubRepoName?.trim();

  let projectId: string | null = null;

  if (repoName) {
    const { data: existing, error: lookupError } = await supabase
      .from('projects')
      .select('id,user_id,github_repo_name')
      .eq('user_id', input.userId)
      .eq('github_repo_name', repoName)
      .maybeSingle();
    if (lookupError) return null;
    if (existing && (typeof existing.id !== 'string' || !UUID.test(existing.id) || existing.user_id!==userId || existing.github_repo_name!==repoName)) return null;
    projectId = existing?.id ?? null;
  }

  const row = {
    name: input.name.slice(0, 200),
    type: input.type ?? 'website',
    ...(input.githubRepoUrl!==undefined||repoName?{github_repo_url:input.githubRepoUrl??`https://github.com/${repoName}`} : {}),
    ...(repoName?{github_repo_name:repoName}:{}),
  };
  const build={user_prompt:input.userPrompt.slice(0,8000),...(input.summaryText?.trim()?{summary_text:input.summaryText.slice(0,12000)}:{}),
    ...(input.runId!==undefined?{run_id:input.runId}:{}),...(input.deployUrl!==undefined?{deploy_url:input.deployUrl}:{}),github_branch:input.githubBranch??'main'};
  const initial=await supabase.rpc('save_owned_build_project_atomic',{p_owner_id:userId,p_expected_id:projectId,p_project:row,p_build:build});
  const saved=initial.data?.project,messages=initial.data?.messages;
  const expectedMessages=[{role:'user',content:build.user_prompt,metadata:{...(input.runId!==undefined?{runId:input.runId}:{}),...(input.deployUrl!==undefined?{deployUrl:input.deployUrl}:{}),...(repoName?{githubRepoName:repoName}:{}),githubBranch:build.github_branch,source:'build'}},
    ...(build.summary_text!==undefined?[{role:'assistant',content:build.summary_text,metadata:{...(input.deployUrl!==undefined?{deployUrl:input.deployUrl}:{}),...(repoName?{githubRepoName:repoName}:{}),source:'build_summary'}}]:[])];
  if(initial.error || !initial.data || Array.isArray(initial.data) || typeof initial.data.created!=='boolean'
    || !saved || Array.isArray(saved) || typeof saved.id!=='string' || !UUID.test(saved.id) || (projectId!==null&&saved.id!==projectId)
    || saved.user_id!==userId || saved.status!=='in_progress' || saved.name!==row.name || saved.type!==row.type
    || saved.github_repo_name!==(repoName||null) || saved.github_repo_url!==(row.github_repo_url??null)
    || !Array.isArray(messages) || messages.length!==expectedMessages.length || new Set(messages.map((m:any)=>m?.id)).size!==messages.length
    || messages.some((m:any,n:number)=>!m || typeof m.id!=='string' || !UUID.test(m.id) || m.project_id!==saved.id
      || !isDeepStrictEqual({role:m.role,content:m.content,metadata:m.metadata},expectedMessages[n])))return null;
  projectId=saved.id;

  const maxFiles =
    input.isHackathon || input.type === 'research' || input.projectFiles.length > 40
      ? HACKATHON_MAX_STORED_FILES
      : 64;
  const toStore =
    input.isHackathon || input.projectFiles.length > 40
      ? input.projectFiles
      : input.projectFiles.filter(
          (f) =>
            CORE_FILES.has(f.path) ||
            f.path.startsWith('src/') ||
            f.path.startsWith('contracts/') ||
            f.path.startsWith('apps/') ||
            f.path.includes('/')
        );
  for (const file of toStore.slice(0, maxFiles)) {
    try {
      await storeProjectFile(
        context,
        projectId!,
        file.path.replace(/\//g, '_'),
        file.content,
        file.path.endsWith('.json') ? 'application/json' : 'text/plain',
        'code'
      );
    } catch {
      // A partial metadata row is not a completed/durable artifact receipt.
      // Preserve any successful rows for owner recovery; do not claim all files saved.
      console.warn('[buildProjectStore] private file persistence incomplete; no completed receipt');
      return null;
    }
  }

  const completed=await supabase.from('projects').update({status:'completed'}).eq('id',projectId).eq('user_id',userId).select('id,user_id,status').maybeSingle();
  if(completed.error || completed.data?.id!==projectId || completed.data.user_id!==userId || completed.data.status!=='completed')return null;
  return projectId;
}
