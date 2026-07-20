'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

/** Dashboard shortcuts — coding-agent only (no image/browser studio claims). */
const ACTIONS = [
  { icon: '🌐', label: 'Website', prompt: 'Build a landing page for: ' },
  { icon: '💻', label: 'SaaS app', prompt: 'Build a full-stack SaaS web app with auth for: ' },
  { icon: '🖥️', label: 'Desktop', prompt: 'Build an Electron desktop app for: ' },
];

export function QuickActions() {
  const router = useRouter();
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);

  const run = (prefill: string) => {
    setChatPrefill(prefill);
    router.push('/dashboard#command');
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => run(a.prompt)}
          className="glass-panel p-4 text-left hover:border-[var(--accent)]/40 transition-colors group rounded-xl"
        >
          <span className="text-2xl">{a.icon}</span>
          <p className="mt-2 font-medium text-[var(--foreground)] group-hover:text-[var(--accent)]">
            {a.label}
          </p>
        </button>
      ))}
    </div>
  );
}
