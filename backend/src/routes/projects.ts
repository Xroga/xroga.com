import { Router } from 'express';
import { z } from 'zod';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createPrivateFileLink,downloadPrivateFile,revokePrivateFileLinks,publicFileView } from '../services/storage/privateFileDelivery.js';
import { FileDeliveryError,fileResponseHeaders,selectFileRange } from '../services/storage/fileDeliveryPolicy.js';

const router = Router();
function fileParentMatches(row: {project_id?: unknown; projects?: unknown}, projectId: string, userId: string): boolean {
  const parent = row.projects;
  return row.project_id === projectId && !!parent && typeof parent === 'object' && !Array.isArray(parent)
    && (parent as {user_id?: unknown}).user_id === userId;
}

router.use((req: AuthRequest, res, next) => {
  try { req.userId = requireTenantContext(req.tenantContext).userId; next(); }
  catch { res.status(401).json({ error: 'Sign in again and retry.' }); }
});

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const githubOnly = req.query.github === '1' || req.query.github === 'true';

  let query = supabase
    .from('projects')
    .select('*')
    .eq('user_id', req.userId!)
    .order('updated_at', { ascending: false });

  if (githubOnly) {
    query = query.not('github_repo_name', 'is', null).neq('github_repo_name', '');
  }

  const { data, error } = await query;

  if (error) {
    res.status(503).json({ error: 'Projects could not be loaded. Retry shortly.' });
    return;
  }
  res.json(data);
});

// Same canonical auth router, not a public object proxy. Links still require their owner identity.
router.get('/:id/files/:fileId/download',async(req:AuthRequest,res)=>{
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  try {
    if(req.query.link!==undefined && typeof req.query.link!=='string')throw new FileDeliveryError(404,'FILE_LINK_UNAVAILABLE');
    const result=await downloadPrivateFile(requireTenantContext(req.tenantContext),String(req.params.id),String(req.params.fileId),req.query.link as string|undefined);
    const selected=selectFileRange(result.buffer,req.headers.range);
    res.set({...fileResponseHeaders(result.row.file_name,result.contentType),...selected.headers}).status(selected.status).send(selected.body);
  }catch(error){res.status(error instanceof FileDeliveryError?error.status:503).json({error:error instanceof FileDeliveryError?error.message:'Secure file delivery is unavailable. Retry shortly.'});}
});
router.post('/:id/files/:fileId/link',async(req:AuthRequest,res)=>{
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
  const parsed=z.object({expiresIn:z.number().int().min(1).max(300).default(60)}).strict().safeParse(req.body??{});
  if(!parsed.success){res.status(400).json({error:'Choose a link expiry between 1 and 300 seconds.'});return;}
  try{res.json(await createPrivateFileLink(requireTenantContext(req.tenantContext),String(req.params.id),String(req.params.fileId),parsed.data.expiresIn));}
  catch(error){res.status(error instanceof FileDeliveryError?error.status:503).json({error:error instanceof FileDeliveryError?error.message:'File link could not be created. Retry shortly.'});}
});
router.delete('/:id/files/:fileId/links',async(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  try{await revokePrivateFileLinks(requireTenantContext(req.tenantContext),String(req.params.id),String(req.params.fileId));res.json({revoked:true});}
  catch(error){res.status(error instanceof FileDeliveryError?error.status:503).json({error:error instanceof FileDeliveryError?error.message:'File links could not be revoked. Retry shortly.'});}
});

router.post('/', async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['app', 'website', 'video', 'game', 'research', 'automation']),
    github_repo_url: z.string().optional(),
    github_repo_name: z.string().optional(),
    github_branch: z.string().optional(),
    deploy_url: z.string().optional(),
    user_prompt: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));

  const { data, error } = await supabase.rpc('save_owned_project_atomic', {
    p_owner_id: req.userId!, p_project: parsed.data,
  });
  if (error || !data || Array.isArray(data) || typeof data.created !== 'boolean'
    || !data.project || Array.isArray(data.project) || data.project.user_id !== req.userId
    || !z.string().uuid().safeParse(data.project.id).success) {
    res.status(503).json({ error: 'Project could not be saved. Retry shortly.' });
    return;
  }
  res.status(data.created ? 201 : 200).json(data.project);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  if (!z.string().uuid().safeParse(projectId).success) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const { data, error } = await supabase.rpc('delete_owned_project_atomic', { p_owner_id: req.userId!, p_project_id: projectId });
  if (error || (data !== null && (!data || Array.isArray(data) || data.id !== projectId || data.user_id !== req.userId))) {
    res.status(503).json({ error: 'Project could not be removed. Retry shortly.' });
    return;
  }
  if (data === null) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ success: true, id: projectId });
});

router.get('/:id/files', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', req.userId!)
    .maybeSingle();

  if (projectError) { res.status(503).json({ error: 'Project authority is unavailable. Retry shortly.' }); return; }

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { data, error } = await supabase
    .from('project_files')
    .select('*,projects!inner(user_id)')
    .eq('project_id', projectId)
    .eq('projects.user_id', req.userId!)
    .order('created_at', { ascending: false });

  if (error || data?.some(row => !fileParentMatches(row, projectId, req.userId!))) {
    res.status(503).json({ error: 'Files could not be loaded. Retry shortly.' });
    return;
  }
  res.json((data??[]).map(({projects: _authority, ...row})=>publicFileView(row)));
});

/** Fetch stored code files for a project (AI + user restore). */
router.get('/:id/code', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, github_repo_name')
    .eq('id', projectId)
    .eq('user_id', req.userId!)
    .maybeSingle();

  if (projectError) { res.status(503).json({ error: 'Project authority is unavailable. Retry shortly.' }); return; }

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { data, error } = await supabase
    .from('project_files')
    .select('id, project_id, file_name, content, file_url, file_type, storage_metadata,projects!inner(user_id)')
    .eq('project_id', projectId)
    .eq('projects.user_id', req.userId!)
    .eq('file_type', 'code')
    .order('created_at', { ascending: false });

  if (error || data?.some(row => !fileParentMatches(row, projectId, req.userId!))) {
    res.status(503).json({ error: 'Files could not be loaded. Retry shortly.' });
    return;
  }

  res.json({ projectId, githubRepoName: project.github_repo_name, files: (data??[]).map(({projects: _authority, ...row})=>publicFileView(row)) });
});

router.get('/:id', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_files(*), project_messages(*)')
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .single();

  if (error) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({...data,project_files:(data.project_files??[]).map((row:Record<string,unknown>)=>publicFileView(row))});
});

export default router;
