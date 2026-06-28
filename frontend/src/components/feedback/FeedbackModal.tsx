'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Sparkles } from 'lucide-react';
import { addFeedback } from '@/lib/feedbackStorage';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MOOD_OPTIONS = [
  { emoji: '🤩', label: 'Very happy', score: 100 },
  { emoji: '😊', label: 'Happy', score: 85 },
  { emoji: '🙂', label: 'Good', score: 70 },
  { emoji: '😐', label: 'Normal', score: 55 },
  { emoji: '😕', label: 'Meh', score: 40 },
  { emoji: '😢', label: 'Sad', score: 25 },
  { emoji: '😭', label: 'Very sad', score: 10 },
];

const SATISFACTION_AVG = 45;

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [selected, setSelected] = useState(3);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open || typeof document === 'undefined') return null;

  const mood = MOOD_OPTIONS[selected];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Say something — even one line helps!');
      return;
    }
    setSubmitting(true);
    addFeedback({
      emoji: mood.emoji,
      rating: Math.round(mood.score / 20),
      experience: message.trim(),
      featuresWanted: '',
      author: 'You',
    });
    toast.success('Thanks! You rock 🚀');
    setMessage('');
    setSubmitting(false);
    onClose();
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-28px))] rounded-3xl border border-[#006aff]/20 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] shadow-[0_32px_80px_rgba(0,106,255,0.25)] overflow-hidden"
        role="dialog"
        aria-labelledby="feedback-title"
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#006aff] via-purple-500 to-[#60a5fa]" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-[#60a5fa]" />
                <h2 id="feedback-title" className="font-bold text-lg text-white">
                  How&apos;s Xroga treating you?
                </h2>
              </div>
              <p className="text-xs text-white/50">
                Community satisfaction: <span className="text-[#60a5fa] font-bold">{SATISFACTION_AVG}%</span> — be honest, we can take it 😄
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-between gap-1 mb-4 px-1">
            {MOOD_OPTIONS.map((m, i) => (
              <button
                key={m.label}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  'flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all',
                  selected === i
                    ? 'bg-[#006aff]/25 scale-110 ring-1 ring-[#006aff]/40'
                    : 'hover:bg-white/5 opacity-70 hover:opacity-100'
                )}
                title={m.label}
              >
                <span className="text-2xl leading-none">{m.emoji}</span>
                <span className="text-[7px] text-white/40 hidden sm:block">{m.label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Quick thought — what rocked? what sucked? dream feature?"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/35 resize-none focus:outline-none focus:border-[#006aff]/50"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#006aff] to-[#60a5fa] text-white font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Sending…' : 'Send it!'}
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
