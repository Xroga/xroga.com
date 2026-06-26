'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Maximize2, Minimize2 } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { ProjectCard } from './ProjectCard';
import { ActivityFeed } from './ActivityFeed';
import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { QuickActionTabs } from '@/components/terminal/QuickActionTabs';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { api, type Project } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import 'react-loading-skeleton/dist/skeleton.css';

interface DashboardViewProps {
  displayName: string;
}

export function DashboardView({ displayName }: DashboardViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' });

    api.projects
      .list()
      .then((data) => setProjects(data.slice(0, 6)))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [displayName, setProfile]);

  const terminalBlock = (
    <div className="space-y-3">
      <QuickActionTabs />
      <SwarmMessageLog />
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-y-0 right-0 z-20 flex flex-col bg-[var(--background)]/95 backdrop-blur-md px-4 sm:px-6 pt-4 pb-[200px] overflow-y-auto"
        style={{ left: sidebarOpen ? '16rem' : '4.5rem' }}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="font-terminal text-sm text-[var(--muted)]">xroga@swarm — fullscreen</h2>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" /> Exit fullscreen
          </button>
        </div>
        {terminalBlock}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Welcome back, <span className="gradient-text">{displayName}</span>! Your AI Swarm is ready.
          </h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Type in the terminal below — the swarm plans, builds, reviews, and verifies until zero defects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Fullscreen terminal (outside sidebar)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Fullscreen</span>
        </button>
      </div>

      <ApiConnectionBanner />

      {terminalBlock}

      <div className="space-y-6 pb-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Recent Projects</h2>
            <Link href="/dashboard/projects" className="text-xs text-[var(--accent)] hover:underline">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={100} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 rounded-xl border border-dashed border-[var(--card-border)]">
              <p className="text-[var(--muted)] text-sm">No projects yet. Use the command bar below to create your first one.</p>
            </div>
          )}
        </div>

        <ActivityFeed />
      </div>
    </div>
  );
}
