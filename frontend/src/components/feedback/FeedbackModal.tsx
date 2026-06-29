'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Sparkles } from 'lucide-react';
import { addFeedback } from '@/lib/feedbackStorage';
import { markFeedbackSubmitted } from '@/lib/scheduledFeedback';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const RATING_OPTIONS = [
  { label: 'Amazing', pct: 100 },
  { label: 'Good', pct: 70 },
  { label: 'Okay', pct: 50 },
  { label: 'Weak', pct: 25 },
  { label: 'Poor', pct: 0 },
] as const;

const CHECKBOX_OPTIONS = [
  { id: 'ui', label: 'UI / UX needs work' },
  { id: 'ai', label: 'AI responses feel weak or off' },
  { id: 'speed', label: 'Too slow or buggy' },
] as const;

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [selected, setSelected] = useState(1);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open || typeof document === 'undefined') return null;

  const rating = RATING_OPTIONS[selected];

  function toggleCheck(id: string) {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = CHECKBOX_OPTIONS.filter((c) => checks[c.id]).map((c) => c.label);
    if (!message.trim() && tags.length === 0) {
      toast.error('Pick a rating or leave a quick note');
      return;
    }
    setSubmitting(true);
    addFeedback({
      emoji: `${rating.pct}%`,
      rating: Math.max(1, Math.round(rating.pct / 20)),
      experience: [message.trim(), tags.length ? `Tags: ${tags.join(', ')}` : ''].filter(Boolean).join(' | '),
      featuresWanted: '',
      author: 'You',
    });
    markFeedbackSubmitted();
    toast.success('Thanks for the feedback!');
    setMessage('');
    setChecks({});
    setSubmitting(false);
    onClose();
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-24px))] rounded-3xl border border-[#006aff]/25 bg-gradient-to-br from-white via-sky-50 to-blue-50 shadow-[0_24px_64px_rgba(0,106,255,0.2)] overflow-hidden"
        role="dialog"
      >
        <div className="h-1 bg-gradient-to-r from-[#006aff] via-[#60a5fa] to-[#006aff]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#006aff]" />
              <h2 className="font-bold text-lg text-slate-900">Quick feedback</h2>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-black/5 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {RATING_OPTIONS.map((m, i) => (
              <button
                key={m.pct}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 rounded-xl border border-slate-200 transition-all hover:border-[#006aff]/40',
                  selected === i && 'ring-2 ring-[#006aff]/40 bg-[#006aff]/10 border-[#006aff]/30'
                )}
              >
                <span className="text-sm font-bold text-[#006aff]">{m.pct}%</span>
                <span className="text-[8px] text-slate-500">{m.label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              {CHECKBOX_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white/60"
                >
                  <input
                    type="checkbox"
                    checked={!!checks[opt.id]}
                    onChange={() => toggleCheck(opt.id)}
                    className="rounded border-slate-300 text-[#006aff] focus:ring-[#006aff]/30"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything else? (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-sky-100 text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-[#006aff]/40"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#006aff] to-[#60a5fa] text-white font-bold text-sm"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
