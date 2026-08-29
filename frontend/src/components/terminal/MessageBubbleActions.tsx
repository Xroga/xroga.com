'use client';

import { useState } from 'react';
import {
  MessageCircleHeart,
  Check,
} from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { UpvoteIcon } from '@/components/icons/animated/UpvoteIcon';
import { DownvoteIcon } from '@/components/icons/animated/DownvoteIcon';
import { CopyIcon } from '@/components/icons/animated/CopyIcon';
import { ShareIcon } from '@/components/icons/animated/ShareIcon';
import { Trash2Icon } from '@/components/icons/animated/Trash2Icon';
import { MessageShareModal } from './MessageShareModal';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface MessageBubbleActionsProps {
  role: 'user' | 'assistant';
  content: string;
  messageId: string;
  prompt?: string;
  onFeedback?: () => void;
  onDelete?: () => void;
}

export function MessageBubbleActions({
  role,
  content,
  messageId,
  prompt,
  onFeedback,
  onDelete,
}: MessageBubbleActionsProps) {
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
    'grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] transition-all hover:-translate-y-px hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]';

  return (
    <>
    <div
      className={cn(
        'mt-1.5 flex w-fit flex-wrap items-center gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/85 p-0.5 opacity-100 shadow-sm backdrop-blur sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
        role === 'user' ? 'ml-auto justify-end' : 'justify-start'
      )}
    >
      {role === 'assistant' && (
        <>
          <button type="button" onClick={() => handleLike('up')} className={cn(btnClass, reaction === 'up' && 'text-emerald-400 bg-emerald-500/10')} aria-label="Like">
            <AnimatedIcon icon={UpvoteIcon} size={14} intro={false} />
          </button>
          <button type="button" onClick={() => handleLike('down')} className={cn(btnClass, reaction === 'down' && 'text-red-400 bg-red-500/10')} aria-label="Dislike">
            <AnimatedIcon icon={DownvoteIcon} size={14} intro={false} />
          </button>
          <button type="button" onClick={handleCopy} className={btnClass} aria-label="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AnimatedIcon icon={CopyIcon} size={14} intro={false} />}
          </button>
          {content.trim() && (
            <button type="button" onClick={() => setShareOpen(true)} className={btnClass} aria-label="Share">
              <AnimatedIcon icon={ShareIcon} size={14} intro={false} />
            </button>
          )}
          {/* No edit on an assistant reply. Editing it into the composer offered to
              rewrite something the reader did not write, and the transcript is a
              record of what was said — the user's own messages still carry it. */}
          {onFeedback && (
            <button type="button" onClick={onFeedback} className={btnClass} aria-label="Feedback">
              <MessageCircleHeart className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className={cn(btnClass, 'hover:text-red-400 hover:bg-red-500/10')} aria-label="Delete message">
              <AnimatedIcon icon={Trash2Icon} size={14} intro={false} />
            </button>
          )}
        </>
      )}
      {role === 'user' && (
        <>
          <button type="button" onClick={handleCopy} className={btnClass} aria-label="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AnimatedIcon icon={CopyIcon} size={14} intro={false} />}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className={cn(btnClass, 'hover:text-red-400 hover:bg-red-500/10')}
              aria-label="Delete message"
            >
              <AnimatedIcon icon={Trash2Icon} size={14} intro={false} />
            </button>
          )}
        </>
      )}
      <span className="sr-only" data-message-id={messageId} />
    </div>
    {role === 'assistant' && content.trim() && (
      <MessageShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        prompt={prompt}
        response={content}
      />
    )}
    </>
  );
}
