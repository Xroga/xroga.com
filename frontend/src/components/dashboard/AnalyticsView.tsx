'use client';

import { BarChart3, Globe, Gamepad2, Smartphone, Code2 } from 'lucide-react';

const METRICS = [
  { icon: Globe, label: 'Websites', views: '—', builds: 0, actions: 0 },
  { icon: Smartphone, label: 'Mobile Apps', views: '—', builds: 0, actions: 0 },
  { icon: Gamepad2, label: 'Games (2D/3D)', views: '—', builds: 0, actions: 0 },
  { icon: Code2, label: 'Software', views: '—', builds: 0, actions: 0 },
];

export function AnalyticsView() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-[var(--accent)]" />
          Analytics
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Performance for your websites, apps, games, and software — connects when projects go live.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map(({ icon: Icon, label, views, builds, actions }) => (
          <div key={label} className="glass-panel rounded-xl p-5 space-y-2">
            <Icon className="w-6 h-6 text-[var(--accent)]" />
            <p className="font-semibold">{label}</p>
            <p className="text-xs text-[var(--muted)]">Views: {views}</p>
            <p className="text-xs text-[var(--muted)]">Builds: {builds}</p>
            <p className="text-xs text-[var(--muted)]">Actions spent: {actions}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-xl p-6 text-center text-sm text-[var(--muted)]">
        Deploy a project via Swarm to see live traffic, conversions, and action ROI here.
      </div>
    </div>
  );
}
