import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ChatMessage } from '@/context/TerminalChatContext';
import { api, type Project } from '@/lib/api';
import { saveSelectedRepoContext } from '@/lib/repoContext';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { loadTerminalHistory } from '@/lib/terminalHistory';

/** Restore workspace + GitHub repo context so user continues exactly where they left off. */
export async function continueGithubProject(
  project: Project,
  router: AppRouterInstance,
  opts?: { branch?: string; onHydrate?: () => void }
): Promise<void> {
  const branch = opts?.branch ?? 'main';
  if (project.github_repo_name?.includes('/')) {
    saveSelectedRepoContext({ repo: project.github_repo_name, branch });
    notifyGithubRepoContext(project.github_repo_name, branch);
  }

  let prompt = `Continue work on ${project.name}`;
  let messages: ChatMessage[] = [];

  if (project.id.startsWith('history-')) {
    const sessionId = project.id.replace(/^history-/, '');
    const session = loadTerminalHistory().find((h) => h.id === sessionId);
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

  resumeToDashboard({
    prompt: `${prompt}${fixHint}`,
    messages: messages.length ? messages : undefined,
    selectedId: project.id,
    selectedLabel: project.name,
    source: 'projects',
  });

  router.push('/dashboard');
  setTimeout(() => opts?.onHydrate?.(), 150);
}
