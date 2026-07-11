'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

const ACTIONS = [
  { icon: '💻', label: 'Build App', prompt: 'Build a full-stack web app for: ' },
  { icon: '🎨', label: 'Generate Image', prompt: 'Generate a professional image for: ' },
  { icon: '🤖', label: 'Automate', prompt: 'Automate this workflow for me: ' },
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
