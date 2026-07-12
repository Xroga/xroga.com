'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, FolderGit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, type Project } from '@/lib/api';
import { GitHubProjectCard } from '@/components/projects/GitHubProjectCard';
import { continueGithubProject } from '@/lib/projectResume';
import { GITHUB_PROJECT_SAVED_EVENT } from '@/lib/githubProjectEvents';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

export function GitHubProjectsSidebar({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { hydrateFromSession } = useTerminalChat();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.projects
      .listGithub()
      .then((list) => setProjects(list.filter((p) => p.github_repo_name?.includes('/'))))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSaved = () => load();
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, onSaved);
  }, [load]);

  async function handleContinue(project: Project) {
    await continueGithubProject(project, router, {
      onHydrate: () => hydrateFromSession(),
    });
    toast('Restored — continue where you left off', { icon: '📍' });
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Remove "${project.name}" from Xroga? Your GitHub repo stays untouched.`)) return;
    try {
      await api.projects.delete(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      toast.success('Project removed');
    } catch {
      toast.error('Could not delete project');
    }
  }

  if (!expanded) {
    return (
      <Link
        href="/dashboard/projects"
        className="flex items-center justify-center p-2 mx-auto w-10 h-10 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
        title="GitHub Projects"
      >
        <FolderGit2 className="w-4 h-4" />
      </Link>
    );
  }

  const recent = projects.slice(0, 4);

  return (
    <div className="px-2 py-2 border-t border-[var(--card-border)] space-y-2">
      <div className="flex items-center justify-between gap-1 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderGit2 className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)] truncate">
            GitHub Projects
          </span>
        </div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--accent)] hover:underline shrink-0"
        >
          All
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 px-0.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-[var(--card)] animate-pulse" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="px-1 text-[10px] text-[var(--muted)] leading-relaxed">
          Connect GitHub and build — repos appear here with continue &amp; delete.
        </p>
      ) : (
        <div className={cn('space-y-2 max-h-[min(42vh,320px)] overflow-y-auto pr-0.5')}>
          {recent.map((p) => (
            <GitHubProjectCard
              key={p.id}
              project={p}
              compact
              onContinue={() => void handleContinue(p)}
              onDelete={() => void handleDelete(p)}
              onOpenRepo={() => {
                if (p.github_repo_url) window.open(p.github_repo_url, '_blank', 'noopener,noreferrer');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
