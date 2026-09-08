import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ChatMessage } from '@/context/TerminalChatContext';
import { api, type Project } from '@/lib/api';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';

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
  const historyId = project.id.startsWith('history-') ? project.id.replace(/^history-/, '') : null;
  const historySession = historyId ? await loadTerminalHistoryEntry(historyId) : null;
  const selected = getSelectedRepoContext();
  let branch = opts?.branch || historySession?.githubBranch ||
    (selected?.repo === project.github_repo_name ? selected.branch : undefined);
  if (!branch && project.github_repo_name?.includes('/')) {
    const repos = await api.github.listRepos();
    branch = repos.repos.find((repo) => repo.fullName === project.github_repo_name)?.defaultBranch;
  }
  if (!branch) throw new Error('Could not determine the selected project branch');
  let activation: { key: string; version: number } | null = null;
  if (project.github_repo_name?.includes('/')) {
    saveSelectedRepoContext({ repo: project.github_repo_name, branch });
    const active = useProjectWorkspaceStore.getState();
    activation = { key: active.activeProjectContextKey!, version: active.transitionVersion };
    notifyGithubRepoContext(project.github_repo_name, branch);
  }

  let prompt = `Continue work on ${project.name}`;
  let messages: ChatMessage[] = [];
  let sessionId = project.id;

  if (historyId) {
    sessionId = historyId;
    const session = historySession;
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
      // Restore sandbox preview from stored project files when messages lack featureOutput
      const files = detail.project_files ?? [];
      const byName = (n: string) =>
        files.find((f) => (f.file_path || f.file_name || '').toLowerCase().endsWith(n))?.content ?? '';
      const html = byName('index.html') || byName('.html');
      const css = byName('styles.css') || byName('.css');
      const js = byName('script.js') || byName('.js');
      if (html?.trim()) {
        const landingMsg: ChatMessage = {
          id: `landing-${project.id}`,
          role: 'assistant',
          content: '',
          featureOutput: {
            type: 'landing_page',
            html,
            css: css || '',
            js: js || '',
            projectName: project.name,
            githubRepoName: project.github_repo_name,
            githubRepoUrl: project.github_repo_url,
            githubPushConfirmed: true,
            deployUrl: '',
          },
          createdAt: Date.now(),
        };
        const hasLanding = messages.some(
          (m) => (m.featureOutput as { type?: string } | undefined)?.type === 'landing_page'
        );
        if (!hasLanding) messages = [...messages, landingMsg];
      }
    } catch {
      /* use default prompt */
    }
  }

  if (activation) {
    const active = useProjectWorkspaceStore.getState();
    if (active.activeProjectContextKey !== activation.key || active.transitionVersion !== activation.version) {
      throw new DOMException('A newer project selection replaced this restore', 'AbortError');
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
