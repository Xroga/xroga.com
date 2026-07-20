'use client';

import { Check, ChevronRight, CircleDashed, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';

/** Cursor-style to-do list during code/build AI processing */
export function BuildTodoList({
  todos,
  className,
  showProgress = true,
}: {
  todos: SwarmTodoItem[];
  className?: string;
  showProgress?: boolean;
}) {
  if (!todos.length) return null;

  const doneCount = todos.filter((t) => t.status === 'done').length;
  const skippedCount = todos.filter((t) => t.status === 'skipped').length;
  const active = todos.find((t) => t.status === 'active');
  const cleanLabel = (label: string) => label.replace(/^\[Phase \d+\]\s*/i, '').trim();

  return (
    <div
      className={cn(
        'xv-build-todo-list rounded-xl border border-[var(--card-border)]/70 bg-[var(--card)]/90 px-3.5 py-3 shadow-sm',
        className
      )}
    >
      <p className="text-[12px] font-medium text-[var(--foreground)]/80 mb-2.5 flex items-center gap-2">
        <ListTodo className="h-3.5 w-3.5 text-[var(--muted)]" strokeWidth={2} />
        <span>To-dos</span>
        <span className="text-[var(--muted)]/50 tabular-nums">{todos.length}</span>
      </p>
      {showProgress && active && (
        <p className="text-[12px] text-[var(--accent)] font-medium mb-2 leading-snug">
          Next: {cleanLabel(active.label)}
        </p>
      )}
      <ul className="space-y-2" aria-label="Build to-dos">
        {todos.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-start gap-2.5 text-[12px] leading-snug transition-all duration-300',
              item.status === 'done' && 'text-[var(--muted)]/45 line-through decoration-[var(--muted)]/20',
              item.status === 'skipped' && 'text-[var(--muted)]/55',
              item.status === 'active' && 'text-[var(--foreground)]/95 xv-agent-todo-active',
              item.status === 'pending' && 'text-[var(--muted)]/40'
            )}
          >
            <span className="mt-0.5 shrink-0" aria-hidden>
              {item.status === 'done' ? (
                <Check className="h-3.5 w-3.5 text-emerald-500/80" strokeWidth={2.5} />
              ) : item.status === 'skipped' ? (
                <CircleDashed className="h-3.5 w-3.5 text-amber-500/70" strokeWidth={2} />
              ) : item.status === 'active' ? (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--accent)]/55 bg-[var(--accent)]/12">
                  <ChevronRight className="h-2.5 w-2.5 text-[var(--accent)]" strokeWidth={2.5} />
                </span>
              ) : (
                <CircleDashed className="h-3.5 w-3.5 text-[var(--muted)]/30" strokeWidth={2} />
              )}
            </span>
            <span className={cn(item.status === 'active' && 'font-medium')}>{cleanLabel(item.label)}</span>
          </li>
        ))}
      </ul>
      {showProgress && (doneCount > 0 || skippedCount > 0) && (
        <p className="mt-2.5 text-[11px] text-[var(--muted)]/55 flex items-center gap-1.5">
          <Check className="h-3 w-3 text-emerald-500/65" strokeWidth={2.5} />
          Completed {doneCount} of {todos.length} to-dos
          {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
        </p>
      )}
    </div>
  );
}
