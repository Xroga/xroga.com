'use client';

import { Code2, Film, Bot } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'next/navigation';

const actions = [
  {
    label: 'Build App',
    icon: Code2,
    emoji: '💻',
    prefill: 'Build a web app for ',
  },
  {
    label: 'Make Movie',
    icon: Film,
    emoji: '🎬',
    prefill: 'Make a movie about ',
  },
  {
    label: 'Automate',
    icon: Bot,
    emoji: '🤖',
    prefill: 'Automate ',
  },
];

export function QuickActions() {
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const router = useRouter();

  function handleClick(prefill: string) {
    setChatPrefill(prefill);
    router.push('/dashboard#command');
    const el = document.getElementById('command');
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {actions.map(({ label, icon: Icon, emoji, prefill }) => (
        <button
          key={label}
          type="button"
          onClick={() => handleClick(prefill)}
          className="flex flex-col items-center gap-2 p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/50 hover:bg-violet-500/5 transition-all text-center"
        >
          <span className="text-2xl">{emoji}</span>
          <Icon className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}
