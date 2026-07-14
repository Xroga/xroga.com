'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Pencil, Play, Pause, Trash2, X } from 'lucide-react';
import type { QueuedPrompt } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const PREVIEW_LEN = 72;

function PromptRow({
  item,
  onContinue,
  onHold,
  onEdit,
  onRemove,
  onCopy,
  heavyBuildActive,
}: {
  item: QueuedPrompt;
  onContinue: () => void;
  onHold: () => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
  onCopy: () => void;
  heavyBuildActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > PREVIEW_LEN;
  const isHeavy = item.lane === 'heavy';

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-2.5 py-2 rounded-xl border text-xs shadow-sm',
        isHeavy
          ? 'bg-[var(--accent)]/8 border-[var(--accent)]/30'
          : 'bg-[var(--card)]/90 border-[var(--card-border)]/60'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-wider',
              isHeavy ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
            )}
          >
            {isHeavy ? `${item.queueLabel ?? '#2'} build` : 'Chat'}
            {item.hold ? ' · held' : heavyBuildActive && isHeavy ? ' · waiting' : ''}
          </span>
        </div>
        <p className={cn('text-[var(--foreground)] font-terminal leading-relaxed', !expanded && long && 'line-clamp-2')}>
          {item.text}
        </p>
        {long && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-0.5 text-[9px] text-[#006aff] mt-1 font-semibold">
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Collapse' : 'Full prompt'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onCopy} className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--muted)]" title="Copy">
          <Copy className="w-3 h-3" />
        </button>
        <button type="button" onClick={() => onEdit(item.text)} className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--muted)]" title="Edit">
          <Pencil className="w-3 h-3" />
        </button>
        {isHeavy ? (
          item.hold ? (
            <button
              type="button"
              onClick={onContinue}
              className="p-1.5 rounded-lg flex items-center gap-0.5 text-[10px] font-bold bg-[#006aff]/15 text-[#006aff] hover:bg-[#006aff]/25"
              title="Continue when ready"
            >
              <Play className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onHold}
              className="p-1.5 rounded-lg flex items-center gap-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"
              title="Hold — don’t auto-start"
            >
              <Pause className="w-3 h-3" />
            </button>
          )
        ) : null}
        <button type="button" onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-400" title="Cancel">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function ChatPromptQueue({
  queue,
  onContinue,
  onHold,
  onEdit,
  onRemove,
  onClear,
  heavyBuildActive = false,
}: {
  queue: QueuedPrompt[];
  onContinue: (id: string) => void;
  onHold: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  heavyBuildActive?: boolean;
}) {
  if (queue.length === 0) return null;

  const heavyCount = queue.filter((q) => q.lane === 'heavy').length;

  return (
    <div className="rounded-xl border border-[var(--card-border)]/50 bg-[var(--background)]/80 backdrop-blur-md px-2 sm:px-2.5 py-2 space-y-1.5 shadow-lg">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {heavyCount > 0
            ? `Build queue · ${heavyCount} waiting`
            : `Queued · ${queue.length} ${queue.length === 1 ? 'command' : 'commands'}`}
        </p>
        <button type="button" onClick={onClear} className="text-[9px] text-[var(--muted)] hover:text-red-400 flex items-center gap-0.5">
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
        {queue.map((item) => (
          <PromptRow
            key={item.id}
            item={item}
            onContinue={() => onContinue(item.id)}
            onHold={() => onHold(item.id)}
            onEdit={(text) => onEdit(item.id, text)}
            onRemove={() => onRemove(item.id)}
            onCopy={async () => {
              await navigator.clipboard.writeText(item.text);
              toast.success('Copied');
            }}
            heavyBuildActive={heavyBuildActive}
          />
        ))}
      </div>
      <p className="text-[9px] text-[var(--muted)] px-0.5">
        {heavyBuildActive
          ? 'Chat & planning stay open. Queued builds start after the current one — never kills an in-progress build.'
          : 'Sends automatically when the current response finishes. Hold pauses a queued build.'}
      </p>
    </div>
  );
}
