import { Router } from 'express';
import { z } from 'zod';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';
import { createPrivateFileLink,downloadPrivateFile,revokePrivateFileLinks,publicFileView } from '../services/storage/privateFileDelivery.js';
import { FileDeliveryError,fileResponseHeaders,selectFileRange } from '../services/storage/fileDeliveryPolicy.js';

const router = Router();

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

  if (parsed.data.github_repo_name) {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', req.userId!)
      .eq('github_repo_name', parsed.data.github_repo_name)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('projects')
        .update({
          name: parsed.data.name,
          type: parsed.data.type,
          github_repo_url: parsed.data.github_repo_url ?? null,
          github_repo_name: parsed.data.github_repo_name,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', req.userId!)
        .select()
        .single();
      if (error) {
        res.status(503).json({ error: 'Project could not be saved. Retry shortly.' });
        return;
      }
      if (parsed.data.user_prompt?.trim()) {
        await supabase.from('project_messages').insert({
          project_id: existing.id,
          role: 'user',
          content: parsed.data.user_prompt.slice(0, 8000),
          metadata: {
            deployUrl: parsed.data.deploy_url,
            githubRepoName: parsed.data.github_repo_name,
            githubBranch: parsed.data.github_branch ?? 'main',
            source: 'client_create',
          },
        });
      }
      res.status(200).json(data);
      return;
    }
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: req.userId!,
      name: parsed.data.name,
      type: parsed.data.type,
      status: 'completed',
      github_repo_url: parsed.data.github_repo_url ?? null,
      github_repo_name: parsed.data.github_repo_name ?? null,
    })
    .select()
    .single();

  if (error) {
    res.status(503).json({ error: 'Project could not be saved. Retry shortly.' });
    return;
  }

  if (parsed.data.user_prompt?.trim()) {
    await supabase.from('project_messages').insert({
      project_id: data.id,
      role: 'user',
      content: parsed.data.user_prompt.slice(0, 8000),
      metadata: {
        deployUrl: parsed.data.deploy_url,
        githubRepoName: parsed.data.github_repo_name,
        githubBranch: parsed.data.github_branch ?? 'main',
        source: 'client_create',
      },
    });
  }

  await supabase.from('activity_logs').insert({
    user_id: req.userId!,
    project_id: data.id,
    action: 'created_project',
    details: { name: data.name, type: data.type },
  });

  res.status(201).json(data);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('user_id', req.userId!)
    .maybeSingle();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { error } = await supabase.from('projects').delete().eq('id', projectId).eq('user_id', req.userId!);

  if (error) {
    res.status(503).json({ error: 'Project could not be removed. Retry shortly.' });
    return;
  }

  await supabase.from('activity_logs').insert({
    user_id: req.userId!,
    project_id: projectId,
    action: 'deleted_project',
    details: { name: project.name },
  });

  res.json({ success: true, id: projectId });
});

router.get('/:id/files', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', req.userId!)
    .single();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(503).json({ error: 'Files could not be loaded. Retry shortly.' });
    return;
  }
  res.json((data??[]).map(row=>publicFileView(row)));
});

/** Fetch stored code files for a project (AI + user restore). */
router.get('/:id/code', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const projectId = String(req.params.id);

  const { data: project } = await supabase
    .from('projects')
    .select('id, github_repo_name')
    .eq('id', projectId)
    .eq('user_id', req.userId!)
    .single();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { data, error } = await supabase
    .from('project_files')
    .select('id, project_id, file_name, content, file_url, file_type, storage_metadata')
    .eq('project_id', projectId)
    .eq('file_type', 'code')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(503).json({ error: 'Files could not be loaded. Retry shortly.' });
    return;
  }

  res.json({ projectId, githubRepoName: project.github_repo_name, files: (data??[]).map(row=>publicFileView(row)) });
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
