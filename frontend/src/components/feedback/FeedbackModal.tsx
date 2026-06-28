'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Sparkles, Smile, Meh, Frown } from 'lucide-react';
import { addFeedback } from '@/lib/feedbackStorage';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MOOD_OPTIONS = [
  { icon: Smile, label: 'Love it', pct: 72, hover: 'hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:text-emerald-400' },
  { icon: Smile, label: 'Good', pct: 58, hover: 'hover:bg-green-500/15 hover:border-green-400/40 hover:text-green-400' },
  { icon: Meh, label: 'Okay', pct: 45, hover: 'hover:bg-orange-500/15 hover:border-orange-400/40 hover:text-orange-400' },
  { icon: Frown, label: 'Meh', pct: 28, hover: 'hover:bg-amber-500/15 hover:border-amber-400/40 hover:text-amber-400' },
  { icon: Frown, label: 'Sad', pct: 15, hover: 'hover:bg-red-500/15 hover:border-red-400/40 hover:text-red-400' },
  { icon: Frown, label: 'Angry', pct: 8, hover: 'hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-500' },
];

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [selected, setSelected] = useState(2);
  const [message, setMessage] = useState('');
  const [wantFeatures, setWantFeatures] = useState('');
  const [hateParts, setHateParts] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open || typeof document === 'undefined') return null;

  const mood = MOOD_OPTIONS[selected];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() && !wantFeatures.trim() && !hateParts.trim()) {
      toast.error('Say something — even one line helps!');
      return;
    }
    setSubmitting(true);
    addFeedback({
      emoji: mood.label,
      rating: Math.round(mood.pct / 20),
      experience: [message.trim(), hateParts.trim() ? `Dislikes: ${hateParts.trim()}` : ''].filter(Boolean).join(' | '),
      featuresWanted: wantFeatures.trim(),
      author: 'You',
    });
    toast.success('Thanks! You rock');
    setMessage('');
    setWantFeatures('');
    setHateParts('');
    setSubmitting(false);
    onClose();
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,calc(100vw-24px))] rounded-3xl border border-[#006aff]/25 bg-gradient-to-br from-white via-sky-50 to-blue-50 shadow-[0_24px_64px_rgba(0,106,255,0.2)] overflow-hidden"
        role="dialog"
      >
        <div className="h-1 bg-gradient-to-r from-[#006aff] via-[#60a5fa] to-[#006aff]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#006aff]" />
              <h2 className="font-bold text-lg text-slate-900">How&apos;s Xroga?</h2>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-black/5 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1.5 mb-4">
            {MOOD_OPTIONS.map((m, i) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 p-2 rounded-xl border border-slate-200 transition-all',
                    m.hover,
                    selected === i && 'ring-2 ring-[#006aff]/40 bg-[#006aff]/10 border-[#006aff]/30'
                  )}
                  title={`${m.pct}% feel this way`}
                >
                  <Icon className="w-5 h-5 text-slate-600" />
                  <span className="text-[8px] font-bold text-[#006aff]">{m.pct}%</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Quick thought on your experience…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-sky-100 text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-[#006aff]/40"
            />
            <textarea
              value={wantFeatures}
              onChange={(e) => setWantFeatures(e.target.value)}
              placeholder="What new features should we build? (we can't do everything — tell us your dream)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-sky-100 text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-[#006aff]/40"
            />
            <textarea
              value={hateParts}
              onChange={(e) => setHateParts(e.target.value)}
              placeholder="What do you hate about Xroga? Be honest — no problem"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white border border-sky-100 text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:border-[#006aff]/40"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#006aff] to-[#60a5fa] text-white font-bold text-sm"
            >
              <Send className="w-4 h-4" />
              Send feedback
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
