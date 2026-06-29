'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Plus, Rocket, Sparkles } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { SectionCompactCard } from '@/components/dashboard/SectionCompactCard';
import { api, type Project } from '@/lib/api';
import {
  filterProjectsForSection,
  loadLocalProjects,
  removeLocalProject,
  type LocalProjectEntry,
} from '@/lib/projectArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';
import 'react-loading-skeleton/dist/skeleton.css';

const BUILD_TYPES = new Set(['website', 'app', 'game', 'software', 'extension', 'tool']);

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

  useEffect(() => {
    setLocalProjects(filterProjectsForSection(loadLocalProjects()));
    api.projects
      .list()
      .then((list) => setProjects(list.filter((p) => BUILD_TYPES.has(p.type.toLowerCase()))))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localProjects;
    return localProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q) || p.type.includes(q),
    );
  }, [localProjects, query]);

  const filteredRemote = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.github_repo_name?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, query]);

  function openLocalProject(p: LocalProjectEntry) {
    setPrompt(p.prompt);
    resumeToDashboard({
      prompt: p.prompt,
      selectedId: p.id,
      selectedLabel: p.name,
      source: 'projects',
      jumpMessageId: p.sourceMessageId,
    });
    router.push('/dashboard');
  }

  function openRemoteProject(project: Project) {
    const prompt = `Continue working on project: ${project.name}`;
    setPrompt(prompt);
    resumeToDashboard({
      prompt,
      selectedId: project.id,
      selectedLabel: project.name,
      source: 'projects',
    });
    router.push(`/dashboard/projects/${project.id}`);
  }

  function deleteLocal(id: string) {
    removeLocalProject(id);
    setLocalProjects(filterProjectsForSection(loadLocalProjects()));
    toast.success('Project removed');
  }

  const hasItems = filteredLocal.length > 0 || filteredRemote.length > 0;

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderOpen className="w-7 h-7 text-[var(--accent)]" />
              My Projects
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Websites, apps, games, and software built by your Swarm — open any project to continue in the terminal.
            </p>
          </div>
          <Link href="/dashboard" className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New via Command
          </Link>
        </div>

        <SectionSearchBar value={query} onChange={setQuery} placeholder="Search projects…" />

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={160} baseColor="var(--card)" highlightColor="var(--card-border)" />
            ))}
          </div>
        ) : hasItems ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLocal.map((p) => (
              <SectionCompactCard
                key={p.id}
                title={p.name}
                subtitle={p.type}
                dateIso={p.updatedAt}
                onOpen={() => openLocalProject(p)}
                onDelete={() => deleteLocal(p.id)}
                openLabel="Open in terminal"
              />
            ))}
            {filteredRemote.map((p) => (
              <SectionCompactCard
                key={p.id}
                title={p.name}
                subtitle={p.type}
                dateIso={p.updated_at ?? new Date().toISOString()}
                onOpen={() => openRemoteProject(p)}
                onDelete={() => toast('Cloud projects are managed from the project page', { icon: 'ℹ️' })}
                openLabel="Open project"
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl p-10 text-center border border-dashed border-[var(--card-border)]">
            <Sparkles className="w-10 h-10 mx-auto text-[var(--accent)]/50 mb-4" />
            <p className="text-[var(--muted)] mb-2">No projects yet.</p>
            <p className="text-sm text-[var(--muted)] mb-6">Ask Xroga to build a website, app, game, or software tool.</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:opacity-90"
            >
              <Rocket className="w-4 h-4" /> Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </PageFullscreenFrame>
  );
}
