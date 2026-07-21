'use client';

import { useRouter } from 'next/navigation';
import { Globe, Code2, Puzzle, Monitor, Smartphone } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

/** Dashboard shortcuts — real product kinds including Chrome + Desktop. */
const ACTIONS = [
  {
    icon: Globe,
    label: 'Website',
    prompt: 'Build a landing page for: ',
    color: '#60a5fa',
  },
  {
    icon: Code2,
    label: 'SaaS app',
    prompt: 'Build a full-stack SaaS web app with auth for: ',
    color: '#22c55e',
  },
  {
    icon: Puzzle,
    label: 'Chrome extension',
    prompt: 'Build a Chrome MV3 extension that: ',
    color: '#f59e0b',
  },
  {
    icon: Monitor,
    label: 'Desktop',
    prompt: 'Build an Electron desktop app for: ',
    color: '#94a3b8',
  },
  {
    icon: Smartphone,
    label: 'Mobile',
    prompt: 'Build an Expo Android/iOS app for: ',
    color: '#a78bfa',
  },
];

export function QuickActions() {
  const router = useRouter();
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);

  const run = (prefill: string) => {
    setChatPrefill(prefill);
    router.push('/workspace');
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            type="button"
            onClick={() => run(a.prompt)}
            className="glass-panel p-4 text-left hover:border-[var(--accent)]/40 transition-colors group rounded-xl"
          >
            <Icon className="w-6 h-6" style={{ color: a.color }} />
            <p className="mt-2 font-medium text-[var(--foreground)] group-hover:text-[var(--accent)]">
              {a.label}
            </p>
          </button>
        );
      })}
    </div>
  );
}
