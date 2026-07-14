/**
 * Durable terminal sessions per GitHub repo — #1, #2, … for each user.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { ensureTerminalSessionsSchema } from '../db/ensureTerminalSessionsSchema.js';

const router = Router();

const upsertSchema = z.object({
  id: z.string().min(8).max(120),
  githubRepoName: z.string().regex(/^[^/]+\/[^/]+$/),
  githubBranch: z.string().max(120).optional(),
  title: z.string().max(120).optional(),
  prompt: z.string().max(20_000).optional(),
  preview: z.string().max(500).optional(),
  messages: z.array(z.unknown()).max(400),
  kind: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
});

type SessionRow = {
  id: string;
  user_id: string;
  github_repo_name: string;
  github_branch: string;
  terminal_number: number;
  title: string;
  prompt: string;
  preview: string;
  messages: unknown;
  kind: string;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

function toSummary(row: SessionRow) {
  return {
    id: row.id,
    githubRepoName: row.github_repo_name,
    githubBranch: row.github_branch,
    terminalNumber: row.terminal_number,
    title: row.title,
    prompt: row.prompt,
    preview: row.preview,
    kind: row.kind,
    status: row.status,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFull(row: SessionRow) {
  return {
    ...toSummary(row),
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

async function nextTerminalNumber(
  userId: string,
  repo: string
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('terminal_sessions')
    .select('terminal_number')
    .eq('user_id', userId)
    .eq('github_repo_name', repo)
    .order('terminal_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.terminal_number ?? 0) + 1;
}

/** GET /api/terminal-sessions?repo=owner/name — list for sidebar (no heavy messages) */
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  await ensureTerminalSessionsSchema().catch(() => false);

  const repo =
    typeof req.query.repo === 'string' && req.query.repo.includes('/')
      ? req.query.repo.trim()
      : null;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('terminal_sessions')
      .select(
        'id, user_id, github_repo_name, github_branch, terminal_number, title, prompt, preview, kind, status, message_count, created_at, updated_at'
      )
      .eq('user_id', userId)
      .limit(200);

    if (repo) {
      query = query.eq('github_repo_name', repo).order('terminal_number', { ascending: true });
    } else {
      query = query.order('updated_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ sessions: (data as SessionRow[] | null)?.map(toSummary) ?? [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/terminal-sessions/:id — full session for restore */
router.get('/:id', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'id required' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('terminal_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session: toFull(data as SessionRow) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** PUT /api/terminal-sessions/:id — upsert full session (permanent store) */
router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = String(req.params.id || '').trim();
  await ensureTerminalSessionsSchema().catch(() => false);

  const parsed = upsertSchema.safeParse({ ...req.body, id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  if (body.id !== id) {
    res.status(400).json({ error: 'id mismatch' });
    return;
  }

  const messages = body.messages.slice(-300);
  const messageCount = messages.length;
  if (messageCount === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('terminal_sessions')
      .select('id, terminal_number, created_at')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();

    const terminalNumber =
      existing?.terminal_number ?? (await nextTerminalNumber(userId, body.githubRepoName));

    const row = {
      id,
      user_id: userId,
      github_repo_name: body.githubRepoName,
      github_branch: body.githubBranch?.trim() || 'main',
      terminal_number: terminalNumber,
      title: (body.title || `Terminal #${terminalNumber}`).slice(0, 120),
      prompt: (body.prompt || '').slice(0, 20_000),
      preview: (body.preview || '').slice(0, 500),
      messages,
      kind: body.kind || 'chat',
      status: body.status || 'active',
      message_count: messageCount,
      updated_at: new Date().toISOString(),
      created_at: existing?.created_at ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('terminal_sessions')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ session: toFull(data as SessionRow) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/terminal-sessions/:id */
router.delete('/:id', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = String(req.params.id || '').trim();
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('terminal_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
