'use client';

import { CircleHelp, Loader2, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const [interacted, setInteracted] = useState(false);
  const interactedRef = useRef(false);
  const [rating, setRating] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const check = () => {
      if (shouldShowScheduledFeedback()) {
        interactedRef.current = false;
        setInteracted(false);
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

  useEffect(() => {
    if (!open || interacted || experience.length > 0 || submitting) return;
    const timer = window.setTimeout(() => {
      if (!interactedRef.current) setOpen(false);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [open, interacted, experience, submitting]);

  function keepOpen() {
    interactedRef.current = true;
    setInteracted(true);
  }

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    keepOpen();
    if (!experience.trim()) {
      toast.error('Share a quick thought or improvement idea');
      return;
    }

    setSubmitting(true);
    try {
      await addFeedback({
        rating,
        experience: experience.trim(),
        featuresWanted: '',
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
    <aside className={styles.card} aria-label="Xroga feedback"
      onPointerDown={keepOpen} onFocusCapture={keepOpen}>
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
          <span>Your message</span>
          <textarea value={experience} onChange={(event) => { keepOpen(); setExperience(event.target.value); }}
            placeholder="What worked well? What should we improve?" rows={3} maxLength={2000} disabled={submitting} />
        </label>

        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? <Loader2 className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}
          {submitting ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
    </aside>
  );
}
