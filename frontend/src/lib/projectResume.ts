import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ChatMessage } from '@/context/TerminalChatContext';
import { api, type Project } from '@/lib/api';
import { saveSelectedRepoContext } from '@/lib/repoContext';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';

export interface GithubProjectSession {
  project: Project;
  prompt: string;
  messages: ChatMessage[];
  sessionId: string;
  branch: string;
}

/** Load messages + prompt for continuing a GitHub-linked project. */
export async function loadGithubProjectSession(
  project: Project,
  opts?: { branch?: string }
): Promise<GithubProjectSession> {
  const branch = opts?.branch ?? 'main';
  if (project.github_repo_name?.includes('/')) {
    saveSelectedRepoContext({ repo: project.github_repo_name, branch });
    notifyGithubRepoContext(project.github_repo_name, branch);
  }

  let prompt = `Continue work on ${project.name}`;
  let messages: ChatMessage[] = [];
  let sessionId = project.id;

  if (project.id.startsWith('history-')) {
    sessionId = project.id.replace(/^history-/, '');
    const session = await loadTerminalHistoryEntry(sessionId);
    if (session?.messages?.length) {
      messages = session.messages;
      prompt = session.prompt || session.title;
    }
  } else {
    try {
      const detail = await api.projects.get(project.id);
      const msgs = detail.project_messages ?? [];
      if (msgs.length) {
        messages = msgs
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        if (lastUser?.content?.trim()) prompt = lastUser.content.trim();
      }
    } catch {
      /* use default prompt */
    }
  }

  const fixHint = project.github_repo_name
    ? `\n\nConnected repo: ${project.github_repo_name}. Analyze ALL existing files in GitHub, fix bugs/errors, and apply updates — do NOT rebuild from scratch.`
    : '';

  return {
    project,
    prompt: `${prompt}${fixHint}`,
    messages,
    sessionId,
    branch,
  };
}

/** Restore workspace + GitHub repo context so user continues exactly where they left off. */
export async function continueGithubProject(
  project: Project,
  router: AppRouterInstance,
  opts?: { branch?: string; onHydrate?: () => void }
): Promise<GithubProjectSession> {
  const session = await loadGithubProjectSession(project, opts);

  resumeToDashboard({
    prompt: session.prompt,
    messages: session.messages.length ? session.messages : undefined,
    sessionId: session.sessionId,
    selectedId: project.id,
    selectedLabel: project.name,
    source: 'projects',
  });

  router.push('/workspace');
  setTimeout(() => opts?.onHydrate?.(), 150);
  return session;
}
