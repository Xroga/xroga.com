'use client';

import { cn } from '@/lib/utils';
import { SWARM_AGENTS, agentIndex } from '@/lib/messageHelpers';

interface SwarmProcessingIndicatorProps {
  activeAgent?: string;
  loading: boolean;
}

export function SwarmProcessingIndicator({ activeAgent, loading }: SwarmProcessingIndicatorProps) {
  if (!loading) return null;

  const currentIdx = agentIndex(activeAgent);

  return (
    <div className="xv-swarm-processing my-3 p-3 rounded-xl border border-[#006aff]/20 bg-gradient-to-r from-[#006aff]/8 via-transparent to-purple-500/8">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#60a5fa] mb-2.5 flex items-center gap-2">
        <span className="xv-swarm-pulse-dot w-1.5 h-1.5 rounded-full bg-[#006aff] animate-pulse" />
        AI Swarm — behind the scenes
      </p>
      <div className="space-y-1.5">
        {SWARM_AGENTS.map((agent, i) => {
          const active = i === currentIdx;
          const done = i < currentIdx;
          return (
            <div
              key={agent.key}
              className={cn(
                'flex items-center gap-2 text-[11px] transition-all duration-300',
                active && 'text-[#93c5fd] font-semibold',
                done && 'text-emerald-400/70',
                !active && !done && 'text-[var(--muted)] opacity-40'
              )}
            >
              <span
                className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0',
                  active && 'bg-[#006aff]/30 ring-1 ring-[#006aff]/50 xv-swarm-step-active',
                  done && 'bg-emerald-500/20',
                  !active && !done && 'bg-white/5'
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="font-medium">{agent.label}</span>
              <span className="text-[10px] opacity-70 truncate">{agent.desc}</span>
              {active && (
                <span className="ml-auto xv-swarm-typing text-[9px] text-[#60a5fa]">processing…</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
