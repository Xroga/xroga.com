import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.userId!)
    .single();

  if (error) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(data);
});

router.patch('/', async (req: AuthRequest, res) => {
  const schema = z.object({
    display_name: z.string().max(100).optional(),
    avatar_url: z.union([z.string().url(), z.literal('')]).optional(),
    timezone: z.string().max(64).optional(),
    language: z.string().max(16).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const patch: Record<string, string> = {};
  if (parsed.data.display_name !== undefined) {
    patch.display_name = parsed.data.display_name.trim() || 'User';
  }
  if (parsed.data.avatar_url !== undefined) {
    patch.avatar_url = parsed.data.avatar_url;
  }
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: 'No profile fields to update' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', req.userId!)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.get('/activity', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, projects(name)')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
