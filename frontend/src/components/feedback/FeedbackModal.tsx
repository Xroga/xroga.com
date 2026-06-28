'use client';

import { useState, useEffect } from 'react';
import { X, MessageCircleHeart, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { addFeedback, listFeedback, type UserFeedback } from '@/lib/feedbackStorage';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const EMOJIS = ['😍', '🚀', '✨', '💡', '🔥', '🙏', '😊', '🤔', '😤', '💯'];

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

function FeedbackCard({ item, expanded }: { item: UserFeedback; expanded?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] p-3 bg-[var(--card)]/50">
      <div className="flex items-start gap-2">
        <span className="text-2xl">{item.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">{item.author}</p>
            <span className="text-[10px] text-[var(--muted)]">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className={cn('text-xs mt-1 text-[var(--foreground)]/90', !expanded && 'line-clamp-2')}>
            {item.experience}
          </p>
          {expanded && item.featuresWanted && (
            <p className="text-[10px] text-[var(--muted)] mt-2 border-t border-[var(--card-border)]/50 pt-2">
              <span className="font-semibold text-[var(--accent)]">Wants: </span>
              {item.featuresWanted}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [emoji, setEmoji] = useState('🚀');
  const [experience, setExperience] = useState('');
  const [features, setFeatures] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);

  useEffect(() => {
    if (open) setFeedback(listFeedback());
  }, [open]);

  if (!open) return null;

  const visible = showAll ? feedback : feedback.slice(0, 3);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!experience.trim()) {
      toast.error('Tell us about your experience');
      return;
    }
    addFeedback({
      emoji,
      rating: 5,
      experience: experience.trim(),
      featuresWanted: features.trim(),
      author: 'You',
    });
    setExperience('');
    setFeatures('');
    setFeedback(listFeedback());
    toast.success('Thank you for your feedback!');
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <MessageCircleHeart className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold text-lg">Share Your Xroga Experience</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-[var(--muted)]">How is Xroga AI working for you? Pick an expression:</p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  'text-2xl p-2 rounded-xl border transition-all',
                  emoji === e
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 scale-110'
                    : 'border-transparent hover:border-[var(--card-border)] hover:bg-white/5'
                )}
              >
                {e}
              </button>
            ))}
          </div>

          <textarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="What do you love about Xroga? What should we improve?"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-[var(--card-border)] resize-none focus:outline-none focus:border-[var(--accent)]/40"
          />

          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder="Features & updates you want us to build…"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-[var(--card-border)] resize-none focus:outline-none focus:border-[var(--accent)]/40"
          />

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-semibold text-sm hover:opacity-90"
          >
            <Send className="w-4 h-4" /> Submit Feedback
          </button>
        </form>

        <div className="px-5 pb-5 space-y-3 border-t border-[var(--card-border)] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Community voices</h3>
            {feedback.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-[var(--accent)] flex items-center gap-1 hover:underline"
              >
                {showAll ? (
                  <>Show less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>View more <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
          {visible.map((item) => (
            <FeedbackCard key={item.id} item={item} expanded={showAll} />
          ))}
        </div>
      </div>
    </div>
  );
}
