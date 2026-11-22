'use client';

import { Frown, Laugh, Loader2, Meh, Send, Smile, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { addFeedback } from '@/lib/feedbackStorage';
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  shouldShowScheduledFeedback,
} from '@/lib/scheduledFeedback';
import styles from './ScheduledFeedbackPrompt.module.css';

const RATING_OPTIONS = [
  { label: 'Excellent', value: 5, tone: 'positive', icon: Laugh },
  { label: 'Good', value: 4, tone: 'positive', icon: Smile },
  { label: 'Fair', value: 3, tone: 'fair', icon: Meh },
  { label: 'Poor', value: 1, tone: 'poor', icon: Frown },
] as const;

export function ScheduledFeedbackPrompt() {
  const messageId = useId();
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
        <h2 className={styles.title}>How was your experience today?</h2>
        <button type="button" onClick={() => setOpen(false)} className={styles.closeButton}
          aria-label="Close feedback prompt">
          <X aria-hidden="true" />
        </button>
      </header>

      <form onSubmit={handleSubmit} className={styles.form} aria-busy={submitting}>
        <div className={styles.ratingGroup} role="group" aria-label="Rate your experience">
          {RATING_OPTIONS.map(({ label, value, tone, icon: Face }) => (
            <button key={value} type="button" onClick={() => setRating(value)}
              aria-label={label} title={label} data-tone={tone}
              aria-pressed={rating === value} disabled={submitting}>
              <Face size={20} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className={styles.field}>
          <label htmlFor={messageId} className="sr-only">Your message</label>
          <textarea id={messageId} value={experience} onChange={(event) => { keepOpen(); setExperience(event.target.value); }}
            placeholder="What worked well? What should we improve?" rows={2} maxLength={2000} disabled={submitting} />
          <button type="submit" className={styles.submitButton} disabled={submitting}
            aria-label={submitting ? 'Sending feedback' : 'Send feedback'} title="Send feedback">
            {submitting ? <Loader2 className={styles.spinner} aria-hidden="true" /> : <Send aria-hidden="true" />}
          </button>
        </div>
      </form>
    </aside>
  );
}
