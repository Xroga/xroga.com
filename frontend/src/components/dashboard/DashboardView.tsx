'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Skeleton from 'react-loading-skeleton';
import { ActionMeterLarge } from './ActionMeterLarge';
import { ProjectCard } from './ProjectCard';
import { ActivityFeed } from './ActivityFeed';
import { QuickActions } from './QuickActions';
import { SwarmChat } from '@/components/SwarmChat';
import { api, type Project } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import 'react-loading-skeleton/dist/skeleton.css';

interface DashboardViewProps {
  displayName: string;
}

export function DashboardView({ displayName }: DashboardViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' });

    api.projects.list()
      .then((data) => setProjects(data.slice(0, 6)))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [displayName, setProfile]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          Welcome back, <span className="gradient-text">{displayName}</span>!
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Your AI Swarm is ready. Describe any task below.
        </p>
      </div>

      <ActionMeterLarge />

      <div id="command" className="scroll-mt-8">
        <SwarmChat />
      </div>

      <div>
        <h2 className="font-semibold mb-3">Quick Actions</h2>
        <QuickActions />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-violet-400 hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <>
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            <div className="sm:hidden space-y-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} listView />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 rounded-xl border border-dashed border-[var(--card-border)]">
            <p className="text-[var(--muted)] text-sm">No projects yet. Use the command bar to create your first one.</p>
          </div>
        )}
      </div>

      <ActivityFeed />
    </div>
  );
}
