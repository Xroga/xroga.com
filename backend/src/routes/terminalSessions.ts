/**
 * Durable terminal sessions per GitHub repo — #1, #2, … for each user.
 *
 * Egress note: list responses are metadata only. `messages` (up to 300 per row) and
 * `prompt` (up to 20 KB per row) are deliberately absent — the sidebar renders a
 * title, a number and a count, and never read either. Fetching them for up to 200
 * rows made a single sidebar refresh worth megabytes. Full bodies come from
 * `GET /:id`, which loads exactly one session the user actually opened.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { approximateBytes, recordSupabaseCall } from '../lib/supabaseCallCounters.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { persistOwnedTerminal } from '../security/ownedTerminalPersistence.js';
import { TenantAccessError } from '../security/tenantErrors.js';

const router = Router();
router.use((req: AuthRequest,res,next) => {
  try { req.userId=requireTenantContext(req.tenantContext).userId;next(); }
  catch { res.status(401).json({error:'Sign in again and retry.'}); }
});

/** Columns the sidebar needs. Excludes `messages` and `prompt` by construction. */
export const SUMMARY_COLUMNS =
  'id, github_repo_name, github_branch, terminal_number, title, preview, kind, status, message_count, created_at, updated_at';

/** Columns a write needs to return: enough to place the row in the UI, no bodies. */
const WRITE_RETURN_COLUMNS = SUMMARY_COLUMNS;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

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

/**
 * Metadata for one session. `prompt` is intentionally not returned: it is up to
 * 20 KB, the sidebar shows `preview` instead, and including it dominated the
 * response size of every list call.
 */
export function toSummary(row: Partial<SessionRow>) {
  return {
    id: row.id,
    githubRepoName: row.github_repo_name,
    githubBranch: row.github_branch,
    terminalNumber: row.terminal_number,
    title: row.title,
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
    prompt: row.prompt,
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

export function parsePageSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function parseOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 10_000);
}

async function nextTerminalNumber(
  userId: string,
  repo: string
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('terminal_sessions')
    .select('terminal_number')
    .eq('user_id', userId)
    .eq('github_repo_name', repo)
    .order('terminal_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  return Number(data?.terminal_number ?? 0) + 1;
}

/** GET /api/terminal-sessions?repo=owner/name&limit=&offset= — metadata only */
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const repo =
    typeof req.query.repo === 'string' && req.query.repo.includes('/')
      ? req.query.repo.trim()
      : null;

  const limit = parsePageSize(req.query.limit);
  const offset = parseOffset(req.query.offset);

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('terminal_sessions')
      .select(SUMMARY_COLUMNS)
      .eq('user_id', userId)
      // `range` is inclusive on both ends, so ask for one extra row to learn
      // whether another page exists without running a second COUNT query.
      .range(offset, offset + limit);

    if (repo) {
      query = query.eq('github_repo_name', repo).order('terminal_number', { ascending: true });
    } else {
      query = query.order('updated_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      recordSupabaseCall({ table: 'terminal_sessions', operation: 'select', outcome: 'error' });
      res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
      return;
    }

    const rows = (data as Partial<SessionRow>[] | null) ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const sessions = page.map(toSummary);

    recordSupabaseCall(
      { table: 'terminal_sessions', operation: 'select', outcome: 'ok' },
      approximateBytes(sessions)
    );

    res.json({
      sessions,
      pagination: { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null },
    });
  } catch (err) {
    res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
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
      res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session: toFull(data as SessionRow) });
  } catch (err) {
    res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
  }
});

/** PUT /api/terminal-sessions/:id — upsert full session (permanent store) */
router.put('/:id', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = String(req.params.id || '').trim();

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
    const { data: existing, error: existingError } = await supabase
      .from('terminal_sessions')
      .select('id, terminal_number, created_at, github_repo_name')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');

    // Sticky: once a terminal is under a repo, never relocate it on upsert.
    const githubRepoName =
      typeof existing?.github_repo_name === 'string' && existing.github_repo_name.includes('/')
        ? existing.github_repo_name
        : body.githubRepoName;

    const terminalNumber =
      existing?.terminal_number ?? (await nextTerminalNumber(userId, githubRepoName));

    const row = {
      id,
      user_id: userId,
      github_repo_name: githubRepoName,
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

    // Preserve metadata-only response; never merge over a different user's id.
    let { data, error } = await persistOwnedTerminal(supabase,requireTenantContext(req.tenantContext),row,WRITE_RETURN_COLUMNS);

    // Unique (user, repo, terminal_number) race — reallocate and retry once.
    if (error && /terminal_number|uq_terminal_sessions|duplicate key/i.test(error.message || '')) {
      const retryNumber = await nextTerminalNumber(userId, githubRepoName);
      const retryRow = {
        ...row,
        terminal_number: retryNumber,
        title: (body.title || `Terminal #${retryNumber}`).slice(0, 120),
      };
      const retry = await persistOwnedTerminal(supabase,requireTenantContext(req.tenantContext),retryRow,WRITE_RETURN_COLUMNS);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      recordSupabaseCall({ table: 'terminal_sessions', operation: 'upsert', outcome: 'error' });
      res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
      return;
    }

    const session = toSummary(data as Partial<SessionRow>);
    recordSupabaseCall(
      { table: 'terminal_sessions', operation: 'upsert', outcome: 'ok' },
      approximateBytes(session)
    );
    res.json({ session });
  } catch (err) {
    if(err instanceof TenantAccessError) {res.status(err.status).json({error:err.message,code:err.code});return;}
    res.status(503).json({ error: 'Session could not be saved. Retry shortly.' });
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
      res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
      return;
    }
    res.json({ success: true, id });
  } catch (err) {
    res.status(503).json({ error: 'Session could not be updated or loaded. Retry shortly.' });
  }
});

export default router;
