'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Skeleton from 'react-loading-skeleton';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { api, type Project } from '@/lib/api';
import 'react-loading-skeleton/dist/skeleton.css';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects.list()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Projects</h1>
        <Link href="/dashboard" className="text-sm text-violet-400 hover:underline">
          + New via Command
        </Link>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          ))}
        </div>
      ) : projects.length > 0 ? (
        <>
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
          <div className="sm:hidden space-y-3">
            {projects.map((p) => <ProjectCard key={p.id} project={p} listView />)}
          </div>
        </>
      ) : (
        <div className="text-center py-16 rounded-xl border border-dashed border-[var(--card-border)]">
          <p className="text-[var(--muted)]">No projects yet. Head to the dashboard to create one.</p>
          <Link href="/dashboard" className="inline-block mt-4 text-violet-400 hover:underline text-sm">
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
