'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Pencil, Send, Trash2, X, Zap } from 'lucide-react';
import type { QueuedPrompt } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const PREVIEW_LEN = 72;

function PromptRow({
  item,
  onSend,
  onEdit,
  onRemove,
  onCopy,
  loading,
}: {
  item: QueuedPrompt;
  onSend: () => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
  onCopy: () => void;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > PREVIEW_LEN;

  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-[var(--card)]/90 border border-[var(--card-border)]/60 text-xs shadow-sm">
      <div className="flex-1 min-w-0">
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
        <button
          type="button"
          onClick={onSend}
          className={cn(
            'p-1.5 rounded-lg flex items-center gap-0.5 text-[10px] font-bold',
            loading ? 'bg-amber-500/20 text-amber-600 hover:bg-amber-500/30' : 'hover:bg-[#006aff]/20 text-[#006aff]',
          )}
          title={loading ? 'Send now — stops current response' : 'Send now'}
        >
          <Send className="w-3 h-3" />
          {loading ? <Zap className="w-2.5 h-2.5" /> : null}
        </button>
        <button type="button" onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-400" title="Remove">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function ChatPromptQueue({
  queue,
  onSendNow,
  onEdit,
  onRemove,
  onClear,
  loading = false,
}: {
  queue: QueuedPrompt[];
  onSendNow: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  loading?: boolean;
}) {
  if (queue.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--card-border)]/50 bg-[var(--background)]/80 backdrop-blur-md px-2 sm:px-2.5 py-2 space-y-1.5 shadow-lg">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          Queued · {queue.length} {queue.length === 1 ? 'command' : 'commands'}
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
            onSend={() => onSendNow(item.id)}
            onEdit={(text) => onEdit(item.id, text)}
            onRemove={() => onRemove(item.id)}
            onCopy={async () => {
              await navigator.clipboard.writeText(item.text);
              toast.success('Copied');
            }}
            loading={loading}
          />
        ))}
      </div>
      <p className="text-[9px] text-[var(--muted)] px-0.5">
        {loading
          ? 'Enter queues · Shift+Enter or ⚡ sends now and stops the current response · auto-sends when done'
          : 'Sends automatically when the current response finishes.'}
      </p>
    </div>
  );
}
