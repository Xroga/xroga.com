'use client';

import { createClient } from '@/lib/supabase/client';
import { meaningfulSidebarTitle } from '@/lib/sidebarOrganization';
import { rankWorkspaceSearch, type WorkspaceSearchCandidate } from './workspaceSearchIndex';
import { workspaceSearchFilter } from './workspaceSearchQuery';

const LIMIT = 24;
const storedId = /^[a-z0-9._:-]{1,160}$/i;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const chatFields = 'id,title,prompt,preview,updated_at';
const projectFields = 'id,name,github_repo_name,updated_at';
type Chat = { id: string; title: string; prompt: string; preview: string; updated_at: string };
type Project = { id: string; name: string; github_repo_name: string | null; updated_at: string | null };
type Section = { id: string; title: string; project_id: string; created_at: string };
type Label = { item_id: string; item_type: 'conversation' | 'project'; title_override: string };

function snippet(fields: string[], terms: string[]) {
  const clean = fields.map(value => value.replace(/\s+/g, ' ').trim());
  const match = clean.find(value => terms.some(term => value.toLowerCase().includes(term))) ?? clean.find(Boolean) ?? '';
  const position = terms.map(term => match.toLowerCase().indexOf(term)).filter(index => index >= 0);
  const start = position.length ? Math.max(0, Math.min(...position) - 24) : 0;
  return (start ? '…' : '') + match.slice(start, start + 145) + (start + 145 < match.length ? '…' : '');
}

export async function searchOwnedWorkspace(userId: string, terms: string[], signal: AbortSignal) {
  if (!uuid.test(userId)) throw new Error('Sign in to search saved work');
  const db = createClient();
  // Every source is a bounded projection using the signed-in client, explicit
  // verified account ID and the table's existing row-level security. No messages
  // arrays, browser-history imports, service credentials, or hosted index.
  const primaryChats = db.from('xroga_sidebar_chats').select(chatFields).eq('user_id', userId).gt('message_count', 0);
  const repoChats = db.from('terminal_sessions').select(`${chatFields},github_repo_name`).eq('user_id', userId).gt('message_count', 0);
  const projects = db.from('projects').select(projectFields).eq('user_id', userId);
  const sections = db.from('xroga_sidebar_sections').select('id,title,project_id,created_at').eq('user_id', userId);
  const labels = db.from('xroga_sidebar_items').select('item_type,item_id,title_override').eq('user_id', userId).not('title_override', 'is', null);
  const [chats, terminals, projectsFound, sectionsFound, labelsFound] = await Promise.all([
    (terms.length ? primaryChats.or(workspaceSearchFilter(terms, ['title', 'prompt', 'preview'])) : primaryChats).order('updated_at', { ascending: false }).limit(LIMIT).abortSignal(signal),
    (terms.length ? repoChats.or(workspaceSearchFilter(terms, ['title', 'prompt', 'preview', 'github_repo_name'])) : repoChats).order('updated_at', { ascending: false }).limit(LIMIT).abortSignal(signal),
    (terms.length ? projects.or(workspaceSearchFilter(terms, ['name', 'github_repo_name'])) : projects).order('updated_at', { ascending: false }).limit(LIMIT).abortSignal(signal),
    (terms.length ? sections.or(workspaceSearchFilter(terms, ['title'])) : sections).order('created_at', { ascending: false }).limit(LIMIT).abortSignal(signal),
    (terms.length ? labels.or(workspaceSearchFilter(terms, ['title_override'])) : labels).order('updated_at', { ascending: false }).limit(LIMIT).abortSignal(signal),
  ]);
  signal.throwIfAborted();
  if ([chats, terminals, projectsFound, sectionsFound, labelsFound].some(result => result.error)) {
    throw new Error('Workspace search data unavailable');
  }
  const titles = (labelsFound.data ?? []) as Label[];
  const chatIds = titles.filter(row => row.item_type === 'conversation' && storedId.test(row.item_id)).map(row => row.item_id);
  const projectIds = titles.filter(row => row.item_type === 'project' && uuid.test(row.item_id)).map(row => row.item_id);
  // A renamed result still needs a real, currently accessible destination.
  // Verify the underlying record rather than presenting a metadata-only hit.
  const [renamedChats, renamedTerminals, renamedProjects] = await Promise.all([
    chatIds.length ? db.from('xroga_sidebar_chats').select(chatFields).eq('user_id', userId).gt('message_count', 0).in('id', chatIds).limit(LIMIT).abortSignal(signal) : null,
    chatIds.length ? db.from('terminal_sessions').select(`${chatFields},github_repo_name`).eq('user_id', userId).gt('message_count', 0).in('id', chatIds).limit(LIMIT).abortSignal(signal) : null,
    projectIds.length ? db.from('projects').select(projectFields).eq('user_id', userId).in('id', projectIds).limit(LIMIT).abortSignal(signal) : null,
  ]);
  signal.throwIfAborted();
  if ([renamedChats, renamedTerminals, renamedProjects].some(result => result?.error)) {
    throw new Error('Renamed workspace results unavailable');
  }
  const titleById = new Map(titles.map(row => [`${row.item_type}:${row.item_id}`, row.title_override]));
  const candidates: WorkspaceSearchCandidate[] = [];
  for (const row of [...(chats.data ?? []), ...(renamedChats?.data ?? []), ...(terminals.data ?? []), ...(renamedTerminals?.data ?? [])] as Array<Chat & { github_repo_name?: string }>) {
    candidates.push({
      id: row.id, kind: 'chat', title: titleById.get(`conversation:${row.id}`) || meaningfulSidebarTitle(row.title, row.prompt),
      detail: snippet([row.preview, row.prompt, row.github_repo_name ?? ''], terms),
      keywords: `${row.title} ${row.prompt} ${row.preview} ${row.github_repo_name ?? ''}`, updatedAt: row.updated_at,
      href: `/workspace?conversation=${encodeURIComponent(row.id)}`,
    });
  }
  for (const row of [...(projectsFound.data ?? []), ...(renamedProjects?.data ?? [])] as Project[]) {
    candidates.push({
      id: row.id, kind: 'project', title: titleById.get(`project:${row.id}`) || row.name,
      detail: row.github_repo_name ?? '', keywords: row.name, updatedAt: row.updated_at ?? '',
      href: `/workspace?project=${encodeURIComponent(row.id)}`,
    });
  }
  for (const row of (sectionsFound.data ?? []) as Section[]) {
    candidates.push({
      id: row.id, kind: 'section', title: row.title, detail: 'Opens its project', keywords: '', updatedAt: row.created_at,
      href: `/workspace?project=${encodeURIComponent(row.project_id)}`,
    });
  }
  return rankWorkspaceSearch(candidates, terms);
}
