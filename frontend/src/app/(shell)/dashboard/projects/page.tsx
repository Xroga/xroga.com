'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, Plus, Rocket, Sparkles } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { UiverseTableCard } from '@/components/ui/UiverseTableCard';
import { api, type Project } from '@/lib/api';
import { projectTableRows } from '@/lib/tableRows';
import { getItemMeta, markItemSeen } from '@/lib/itemMeta';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import 'react-loading-skeleton/dist/skeleton.css';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

  useEffect(() => {
    api.projects
      .list()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.github_repo_name?.toLowerCase().includes(q) ?? false)
    );
  }, [projects, query]);

  function openProject(project: Project) {
    markItemSeen(project.id);
    setSelectedId(project.id);
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
              Websites, apps, games, software, browser extensions & tools built by your Swarm.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New via Command
          </Link>
        </div>

        <SectionSearchBar value={query} onChange={setQuery} placeholder="Search projects…" />

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={200} baseColor="var(--card)" highlightColor="var(--card-border)" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <UiverseTableCard
                key={p.id}
                title={p.name.slice(0, 32) || 'project'}
                rows={projectTableRows(p, getItemMeta(p.id))}
                selected={selectedId === p.id}
                onClick={() => openProject(p)}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl p-10 text-center border border-dashed border-[var(--card-border)]">
            <Sparkles className="w-10 h-10 mx-auto text-[var(--accent)]/50 mb-4" />
            <p className="text-[var(--muted)] mb-2">No projects yet.</p>
            <p className="text-sm text-[var(--muted)] mb-6">Head to the dashboard and ask Xroga to build something.</p>
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
