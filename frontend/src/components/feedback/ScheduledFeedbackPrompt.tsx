'use client';

import { useEffect, useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { addFeedback } from '@/lib/feedbackStorage';
import {
  markFeedbackSubmitted,
  markFeedbackPromptShown,
  shouldShowScheduledFeedback,
} from '@/lib/scheduledFeedback';
import toast from 'react-hot-toast';

export function ScheduledFeedbackPrompt() {
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState('');
  const [ideas, setIdeas] = useState('');
  const [rating, setRating] = useState(4);

  useEffect(() => {
    const check = () => {
      if (shouldShowScheduledFeedback()) {
        setOpen(true);
        markFeedbackPromptShown();
      }
    };
    const t1 = setTimeout(check, 60_000);
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => {
      clearTimeout(t1);
      clearInterval(interval);
    };
  }, []);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!experience.trim() && !ideas.trim()) {
      toast.error('Share a quick thought');
      return;
    }
    addFeedback({
      emoji: rating >= 4 ? '😊' : '😐',
      rating,
      experience: experience.trim(),
      featuresWanted: ideas.trim(),
      author: 'You',
    });
    markFeedbackSubmitted();
    toast.success('Thanks for helping us improve!');
    setOpen(false);
  }

  return (
    <div className="fixed bottom-24 right-4 z-[350] w-[min(300px,calc(100vw-32px))] rounded-2xl border border-[#006aff]/25 bg-gradient-to-br from-white to-sky-50 shadow-2xl p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#006aff]" />
          <p className="text-sm font-bold text-slate-900">Quick feedback?</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold ${rating >= n ? 'bg-[#006aff] text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="How is Xroga for you?"
          rows={2}
          className="w-full text-xs px-2.5 py-2 rounded-xl border border-sky-100 bg-white resize-none focus:outline-none focus:border-[#006aff]/40"
        />
        <textarea
          value={ideas}
          onChange={(e) => setIdeas(e.target.value)}
          placeholder="Ideas we should add to our AI?"
          rows={2}
          className="w-full text-xs px-2.5 py-2 rounded-xl border border-sky-100 bg-white resize-none focus:outline-none focus:border-[#006aff]/40"
        />
        <button type="submit" className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#006aff] text-white text-xs font-bold">
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </div>
  );
}
