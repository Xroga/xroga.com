'use client';

import { Globe, Code2, MessageSquare, Smartphone, Puzzle, Monitor } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { StaticQuickTab } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';

/** Product kinds users can start from Workspace — real swarm scaffolds only. */
const PRODUCT_STARTS = [
  {
    id: 'website',
    label: 'Website',
    prompt: 'Build a landing page for ',
    icon: Globe,
    color: '#60a5fa',
  },
  {
    id: 'chatbot',
    label: 'Chatbot',
    prompt: 'Build a chatbot landing page with a working chat UI and /api/chat (BYOK) for ',
    icon: MessageSquare,
    color: '#38bdf8',
  },
  {
    id: 'saas',
    label: 'SaaS',
    prompt: 'Build a SaaS dashboard with auth for ',
    icon: Code2,
    color: '#22c55e',
  },
  {
    id: 'mobile',
    label: 'Mobile',
    prompt: 'Build an Expo Android/iOS app for ',
    icon: Smartphone,
    color: '#a78bfa',
  },
  {
    id: 'extension',
    label: 'Extension',
    prompt: 'Build a Chrome MV3 extension that ',
    icon: Puzzle,
    color: '#f59e0b',
  },
  {
    id: 'desktop',
    label: 'Desktop',
    prompt: 'Build an Electron desktop app for ',
    icon: Monitor,
    color: '#94a3b8',
  },
] as const;

export function ProductStartChips({ className }: { className?: string }) {
  const { setPrompt, loading } = useTerminalChat();

  return (
    <div className={cn('overflow-x-auto scrollbar-hide -mx-0.5 px-0.5', className)}>
      <div className="flex gap-1.5 min-w-max pb-1" role="group" aria-label="What to build">
        {PRODUCT_STARTS.map((action) => {
          const Icon = action.icon;
          return (
            <StaticQuickTab
              key={action.id}
              disabled={loading}
              className="border border-white/10 bg-[#0f1117] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/20 hover:bg-[#151924]"
              icon={<Icon className="w-3.5 h-3.5 shrink-0" style={{ color: action.color }} />}
              onClick={(e) => {
                e.stopPropagation();
                setPrompt(action.prompt);
              }}
            >
              {action.label}
            </StaticQuickTab>
          );
        })}
      </div>
    </div>
  );
}

export { PRODUCT_STARTS };
