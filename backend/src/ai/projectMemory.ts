/**
 * Project memory — hot in-process cache + Supabase persistence
 * so same-repo updates survive API restarts.
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import { ensureShipLoopSchema } from '../db/ensureShipLoopSchema.js';
import type { ProjectFile } from './patches.js';

const LOCAL_REPO = '_local';

export interface ProjectMemory {
  userId: string;
  repo: string | null;
  branch: string;
  projectName?: string;
  files: ProjectFile[];
  paths: string[];
  aiSummary?: string;
  aiSummaryModel?: string;
  commitSha?: string;
  updatedAt: number;
  hits: number;
}

const store = new Map<string, ProjectMemory>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d hot cache
const MAX_FILE_CHARS = 120_000;

function normalizeRepo(repo: string | null | undefined): string {
  return repo?.includes('/') ? repo : LOCAL_REPO;
}

function key(userId: string, repo: string | null, branch: string): string {
  return `${userId}:${normalizeRepo(repo)}:${branch || 'main'}`;
}

function trimFiles(files: ProjectFile[]): ProjectFile[] {
  let total = 0;
  const out: ProjectFile[] = [];
  for (const f of files) {
    const content = f.content.length > 80_000 ? f.content.slice(0, 80_000) : f.content;
    total += content.length;
    if (total > MAX_FILE_CHARS && out.length >= 3) break;
    out.push({ path: f.path, content });
  }
  return out;
}

function fromRow(row: Record<string, unknown>): ProjectMemory {
  const files = Array.isArray(row.files) ? (row.files as ProjectFile[]) : [];
  const rawRepo = typeof row.repo === 'string' ? row.repo : null;
  return {
    userId: String(row.user_id),
    repo: rawRepo && rawRepo.includes('/') ? rawRepo : null,
    branch: String(row.branch || 'main'),
    projectName: typeof row.project_name === 'string' ? row.project_name : undefined,
    files,
    paths: Array.isArray(row.paths) ? (row.paths as string[]) : files.map((f) => f.path),
    aiSummary: typeof row.ai_summary === 'string' ? row.ai_summary : undefined,
    aiSummaryModel: typeof row.ai_summary_model === 'string' ? row.ai_summary_model : undefined,
    commitSha: typeof row.commit_sha === 'string' ? row.commit_sha : undefined,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).getTime() : Date.now(),
    hits: Number(row.hits || 0),
  };
}

async function loadFromDb(
  userId: string,
  repo: string | null,
  branch: string,
): Promise<ProjectMemory | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    await ensureShipLoopSchema();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('project_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('branch', branch || 'main')
      .eq('repo', normalizeRepo(repo))
      .maybeSingle();
    if (error || !data) return null;
    return fromRow(data as Record<string, unknown>);
  } catch (err) {
    console.warn('[projectMemory] load failed:', (err as Error).message);
    return null;
  }
}

async function saveToDb(mem: ProjectMemory): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await ensureShipLoopSchema();
    const supabase = getSupabaseAdmin();
    await supabase.from('project_memory').upsert(
      {
        user_id: mem.userId,
        repo: normalizeRepo(mem.repo),
        branch: mem.branch,
        project_name: mem.projectName ?? null,
        files: mem.files,
        paths: mem.paths,
        ai_summary: mem.aiSummary ?? null,
        ai_summary_model: mem.aiSummaryModel ?? null,
        commit_sha: mem.commitSha ?? null,
        hits: mem.hits,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,repo,branch' },
    );
  } catch (err) {
    console.warn('[projectMemory] save failed:', (err as Error).message);
  }
}

export function getProjectMemory(
  userId: string,
  repo: string | null | undefined,
  branch?: string,
): ProjectMemory | null {
  const k = key(userId, repo ?? null, branch || 'main');
  const mem = store.get(k);
  if (!mem) return null;
  if (Date.now() - mem.updatedAt > TTL_MS) {
    store.delete(k);
    return null;
  }
  mem.hits += 1;
  return mem;
}

/** Hot cache first, then Supabase — use in hydratePriorFiles. */
export async function getProjectMemoryAsync(
  userId: string,
  repo: string | null | undefined,
  branch?: string,
): Promise<ProjectMemory | null> {
  const hot = getProjectMemory(userId, repo, branch);
  if (hot?.files?.length) return hot;

  const b = branch || 'main';
  const db = await loadFromDb(userId, repo ?? null, b);
  if (!db?.files?.length) return null;
  store.set(key(userId, repo ?? null, b), db);
  return db;
}

export function setProjectMemory(input: {
  userId: string;
  repo?: string | null;
  branch?: string;
  projectName?: string;
  files: ProjectFile[];
  aiSummary?: string;
  aiSummaryModel?: string;
  commitSha?: string;
}): ProjectMemory {
  const repo = input.repo?.includes('/') ? input.repo : null;
  const branch = input.branch || 'main';
  const files = trimFiles(input.files);
  const prev = getProjectMemory(input.userId, repo, branch);
  const mem: ProjectMemory = {
    userId: input.userId,
    repo,
    branch,
    projectName: input.projectName || prev?.projectName,
    files,
    paths: files.map((f) => f.path),
    aiSummary: input.aiSummary ?? prev?.aiSummary,
    aiSummaryModel: input.aiSummaryModel ?? prev?.aiSummaryModel,
    commitSha: input.commitSha ?? prev?.commitSha,
    updatedAt: Date.now(),
    hits: (prev?.hits ?? 0) + 1,
  };
  store.set(key(input.userId, repo, branch), mem);
  void saveToDb(mem);
  return mem;
}

export function patchProjectMemory(
  userId: string,
  repo: string | null | undefined,
  branch: string | undefined,
  changed: ProjectFile[],
  deletedPaths: string[] = [],
  meta?: { commitSha?: string; projectName?: string },
): ProjectMemory | null {
  const mem = getProjectMemory(userId, repo, branch);
  if (!mem) {
    // Still persist a fresh snapshot from changed files
    if (!changed.length) return null;
    return setProjectMemory({
      userId,
      repo,
      branch,
      projectName: meta?.projectName,
      files: changed,
      commitSha: meta?.commitSha,
    });
  }
  const map = new Map(mem.files.map((f) => [f.path, f.content]));
  for (const f of changed) map.set(f.path, f.content);
  for (const p of deletedPaths) map.delete(p);
  return setProjectMemory({
    userId,
    repo: repo ?? mem.repo,
    branch: branch || mem.branch,
    projectName: meta?.projectName || mem.projectName,
    files: [...map.entries()].map(([path, content]) => ({ path, content })),
    aiSummary: mem.aiSummary,
    aiSummaryModel: mem.aiSummaryModel,
    commitSha: meta?.commitSha || mem.commitSha,
  });
}

export function userWantsRepoIntelligence(prompt: string): boolean {
  return (
    /\b(analyze|analyse|understand|explain)\b[\s\S]{0,40}\b(repo|repository|codebase|project)\b/i.test(
      prompt,
    ) ||
    /\b(architecture|refactor\s+(the\s+)?(whole|entire|full)|project[- ]level)\b/i.test(prompt)
  );
}

export function shouldGenerateAiSummary(
  prompt: string,
  mem: ProjectMemory | null,
  fileCount: number,
): boolean {
  if (mem?.aiSummary?.trim()) return false;
  if (userWantsRepoIntelligence(prompt)) return true;
  if (fileCount >= 12 && /\b(refactor|migrate|restructure|overhaul)\b/i.test(prompt)) {
    return true;
  }
  return false;
}
