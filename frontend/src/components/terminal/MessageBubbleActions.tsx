'use client';

import { useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Copy,
  Pencil,
  MessageCircleHeart,
  Rocket,
  Check,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface MessageBubbleActionsProps {
  role: 'user' | 'assistant';
  content: string;
  messageId: string;
  showDeploy?: boolean;
  deployLabel?: string;
  onEdit?: () => void;
  onDeploy?: () => void;
  onFeedback?: () => void;
  onDelete?: () => void;
}

export function MessageBubbleActions({
  role,
  content,
  messageId,
  showDeploy,
  deployLabel = 'Deploy',
  onEdit,
  onDeploy,
  onFeedback,
  onDelete,
}: MessageBubbleActionsProps) {
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  }

  function handleLike(v: 'up' | 'down') {
    setReaction(v);
    toast.success(v === 'up' ? 'Thanks!' : 'Noted — we will improve');
  }

  const btnClass =
    'p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/10 transition-colors';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-0.5 mt-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
        role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      {role === 'assistant' && (
        <>
          <button type="button" onClick={() => handleLike('up')} className={cn(btnClass, reaction === 'up' && 'text-emerald-400 bg-emerald-500/10')} aria-label="Like">
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => handleLike('down')} className={cn(btnClass, reaction === 'down' && 'text-red-400 bg-red-500/10')} aria-label="Dislike">
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={handleCopy} className={btnClass} aria-label="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onEdit && (
            <button type="button" onClick={onEdit} className={btnClass} aria-label="Edit in chatbar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onFeedback && (
            <button type="button" onClick={onFeedback} className={btnClass} aria-label="Feedback">
              <MessageCircleHeart className="w-3.5 h-3.5" />
            </button>
          )}
          {showDeploy && onDeploy && (
            <button type="button" onClick={onDeploy} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-gradient-to-r from-emerald-600 to-emerald-400 text-white hover:opacity-90 transition-opacity">
              <Rocket className="w-3 h-3" />
              {deployLabel}
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className={cn(btnClass, 'hover:text-red-400 hover:bg-red-500/10')} aria-label="Delete message">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
      {role === 'user' && (
        <>
          <button type="button" onClick={handleCopy} className={btnClass} aria-label="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className={cn(btnClass, 'hover:text-red-400 hover:bg-red-500/10')}
              aria-label="Delete message"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
      <span className="sr-only" data-message-id={messageId} />
    </div>
  );
}
