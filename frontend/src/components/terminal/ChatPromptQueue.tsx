'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Pencil, Send, Trash2, X } from 'lucide-react';
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
}: {
  item: QueuedPrompt;
  onSend: () => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > PREVIEW_LEN;

  return (
    <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-[var(--card-border)]/40 text-xs">
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
        <button type="button" onClick={onSend} className="p-1.5 rounded-lg hover:bg-[#006aff]/20 text-[#006aff]" title="Send now">
          <Send className="w-3 h-3" />
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
}: {
  queue: QueuedPrompt[];
  onSendNow: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (queue.length === 0) return null;

  return (
    <div className="border-b border-[var(--card-border)]/30 px-2 sm:px-3 py-2 space-y-1.5 bg-black/[0.12]">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          Queued · {queue.length} {queue.length === 1 ? 'prompt' : 'prompts'}
        </p>
        <button type="button" onClick={onClear} className="text-[9px] text-[var(--muted)] hover:text-red-400 flex items-center gap-0.5">
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
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
          />
        ))}
      </div>
      <p className="text-[9px] text-[var(--muted)] px-0.5">Sends automatically when the current response finishes.</p>
    </div>
  );
}
