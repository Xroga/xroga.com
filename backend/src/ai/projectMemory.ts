/**
 * Cost-effective project memory — keep file snapshots + optional AI summary
 * so updates do not re-read / re-analyze the whole repo every turn.
 */

import type { ProjectFile } from './patches.js';

export interface ProjectMemory {
  userId: string;
  repo: string | null;
  branch: string;
  projectName?: string;
  /** Full file snapshot for the active project */
  files: ProjectFile[];
  /** Path index only (cheap listing for prompts) */
  paths: string[];
  /** Cached AI understanding — filled once, reused */
  aiSummary?: string;
  /** Which model wrote aiSummary */
  aiSummaryModel?: string;
  commitSha?: string;
  updatedAt: number;
  hits: number;
}

const store = new Map<string, ProjectMemory>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_FILE_CHARS = 120_000;

function key(userId: string, repo: string | null, branch: string): string {
  return `${userId}:${repo || 'local'}:${branch || 'main'}`;
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
  const repo = input.repo ?? null;
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
  if (!mem) return null;
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

/** True when user explicitly wants repo understanding / big refactor. */
export function userWantsRepoIntelligence(prompt: string): boolean {
  return /\b(analyze|analyse|understand|explain)\b[\s\S]{0,40}\b(repo|repository|codebase|project)\b/i.test(
    prompt,
  ) || /\b(architecture|refactor\s+(the\s+)?(whole|entire|full)|project[- ]level)\b/i.test(prompt);
}

/** Prefer AI summary only when missing and the job is complex / large. */
export function shouldGenerateAiSummary(
  prompt: string,
  mem: ProjectMemory | null,
  fileCount: number,
): boolean {
  if (mem?.aiSummary?.trim()) return false;
  if (userWantsRepoIntelligence(prompt)) return true;
  // Large projects before a complex update — once only
  if (fileCount >= 12 && /\b(refactor|migrate|restructure|overhaul)\b/i.test(prompt)) {
    return true;
  }
  return false;
}
