'use client';

import { CircleHelp, Loader2, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { addFeedback } from '@/lib/feedbackStorage';
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  shouldShowScheduledFeedback,
} from '@/lib/scheduledFeedback';
import styles from './ScheduledFeedbackPrompt.module.css';

const RATING_OPTIONS = [
  { label: 'Good', value: 4 },
  { label: 'Excellent', value: 5 },
  { label: 'Fair', value: 3 },
  { label: 'Poor', value: 1 },
] as const;

export function ScheduledFeedbackPrompt() {
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState('');
  const [ideas, setIdeas] = useState('');
  const [rating, setRating] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const check = () => {
      if (shouldShowScheduledFeedback()) {
        setOpen(true);
        markFeedbackPromptShown();
      }
    };
    const firstCheck = window.setTimeout(check, 60_000);
    const interval = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, []);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!experience.trim() && !ideas.trim()) {
      toast.error('Share a quick thought or improvement idea');
      return;
    }

    setSubmitting(true);
    try {
      await addFeedback({
        rating,
        experience: experience.trim(),
        featuresWanted: ideas.trim(),
      });
      markFeedbackSubmitted();
      toast.success('Thanks for helping shape Xroga.');
      setOpen(false);
    } catch {
      toast.error('Feedback could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className={styles.card} aria-label="Xroga feedback">
      <header className={styles.header}>
        <div className={styles.title}>
          <CircleHelp aria-hidden="true" />
          <span>How was your experience today?</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className={styles.closeButton}
          aria-label="Close feedback prompt">
          <X aria-hidden="true" />
        </button>
      </header>

      <p className={styles.intro}>Your feedback helps us decide what Xroga should improve next.</p>
      <div className={styles.divider} />

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.ratingGroup} role="group" aria-label="Rate your experience">
          {RATING_OPTIONS.map((option) => (
            <button key={option.label} type="button" onClick={() => setRating(option.value)}
              className={rating === option.value ? styles.selectedRating : ''}
              aria-pressed={rating === option.value}>
              {option.label}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span>What worked well?</span>
          <textarea value={experience} onChange={(event) => setExperience(event.target.value)}
            placeholder="Tell us about your experience" rows={2} maxLength={2000} disabled={submitting} />
        </label>

        <label className={styles.field}>
          <span>What should we improve?</span>
          <textarea value={ideas} onChange={(event) => setIdeas(event.target.value)}
            placeholder="Share an idea for Xroga" rows={2} maxLength={2000} disabled={submitting} />
        </label>

        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? <Loader2 className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}
          {submitting ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
    </aside>
  );
}
