import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', req.userId!)
    .order('updated_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.post('/', async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['app', 'website', 'video', 'game', 'research', 'automation']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: req.userId!, ...parsed.data })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await supabase.from('activity_logs').insert({
    user_id: req.userId!,
    project_id: data.id,
    action: 'created_project',
    details: { name: data.name, type: data.type },
  });

  res.status(201).json(data);
});

router.get('/:id/files', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
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
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.get('/:id', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
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
  res.json(data);
});

export default router;
