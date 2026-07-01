import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

router.get('/unread-count', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userId!)
    .eq('read', false);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ count: count ?? 0 });
});

router.patch('/:id/read', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', String(req.params.id))
    .eq('user_id', req.userId!);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

router.patch('/read-all', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.userId!)
    .eq('read', false);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', String(req.params.id))
    .eq('user_id', req.userId!);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

export default router;
