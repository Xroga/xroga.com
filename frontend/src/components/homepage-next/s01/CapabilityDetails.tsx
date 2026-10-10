/**
 * The expanded details for one capability: a right-side drawer on desktop, full screen on phones.
 * Built on the native modal <dialog>, so the page behind is inert, Escape closes it, and focus returns to the
 * "Explore feature" button that opened it.
 *
 * "Try this request" uses the product's existing hand-off (the same one as the S00 command bar): the example
 * request goes into localStorage under PENDING_PROMPT_KEY and the visitor lands in /workspace, or signs up first.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { submission } from '../phase1/commandLogic';
import { CAPABILITIES, STATUS_LABEL, type CapabilityId } from './capabilities.data';
import d from './Details.module.css';

export interface CapabilityDetailsProps {
  id: CapabilityId | null;
  onClose: () => void;
  onNavigate: (id: CapabilityId) => void;
}

export function CapabilityDetails({ id, onClose, onNavigate }: CapabilityDetailsProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const index = id ? CAPABILITIES.findIndex((c) => c.id === id) : -1;
  const cap = index >= 0 ? CAPABILITIES[index] : null;

  const isOpen = cap !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!isOpen) {
      if (el.open) el.close();
      return;
    }
    if (!el.open) el.showModal();
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prev;
    };
  }, [isOpen]);

  // keep the scroll position at the top of the drawer when moving between capabilities
  useEffect(() => {
    ref.current?.querySelector('[data-scroll]')?.scrollTo(0, 0);
  }, [id]);

  const tryRequest = () => {
    if (!cap || sending) return;
    setSending(true);
    const go = (signedIn: boolean) => {
      const { prompt, route } = submission(cap.example, signedIn);
      try {
        if (prompt) localStorage.setItem(PENDING_PROMPT_KEY, prompt);
      } catch {
        /* storage unavailable: the visitor still reaches the workspace */
      }
      router.push(route);
    };
    void createClient()
      .auth.getSession()
      .then(({ data }) => go(!!data.session))
      .catch(() => go(false));
  };

  const prev = index > 0 ? CAPABILITIES[index - 1] : null;
  const next = index >= 0 && index < CAPABILITIES.length - 1 ? CAPABILITIES[index + 1] : null;

  return (
    <dialog
      ref={ref}
      className={d.drawer}
      aria-labelledby="s01-details-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // a click on the backdrop (the dialog box itself, outside the panel) closes
        if (e.target === e.currentTarget) onClose();
      }}
      style={cap ? ({ '--accent': cap.accent } as React.CSSProperties) : undefined}
    >
      {cap && (
        <div className={d.panel}>
          <div className={d.head}>
            <span className={d.num}>{cap.number}</span>
            <button type="button" className={d.close} onClick={onClose} aria-label="Close details">
              <X aria-hidden />
            </button>
          </div>
          <div className={d.scroll} data-scroll>
            <h2 id="s01-details-title" className={d.title}>
              {cap.title}
            </h2>
            <p className={d.benefit}>{cap.benefit}</p>
            <ul className={d.includes} aria-label={`${cap.title} includes`}>
              {cap.chips.map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>

            <h3 className={d.sub}>{cap.reverseTitle}</h3>
            <ul className={d.details}>
              {cap.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <h3 className={d.sub}>Ask it like this</h3>
            <blockquote className={d.example}>{cap.example}</blockquote>
            <button type="button" className={d.try} onClick={tryRequest} disabled={sending}>
              {sending ? 'Opening Xroga' : 'Try this request in Xroga'}
              <ArrowRight aria-hidden />
            </button>

            <h3 className={d.sub}>Availability today</h3>
            <ul className={d.truth}>
              {cap.truth.map((t) => (
                <li key={t.text} data-status={t.status}>
                  <span className={d.status}>{STATUS_LABEL[t.status]}</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
            <p className={d.fine}>The card scene is an illustration, not live customer data.</p>
          </div>
          <nav className={d.foot} aria-label="Other capabilities">
            {prev ? (
              <button type="button" onClick={() => onNavigate(prev.id)}>
                <ArrowLeft aria-hidden />
                <span>
                  <small>Previous</small>
                  {prev.title}
                </span>
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button type="button" data-next onClick={() => onNavigate(next.id)}>
                <span>
                  <small>Next</small>
                  {next.title}
                </span>
                <ArrowRight aria-hidden />
              </button>
            ) : (
              <span />
            )}
          </nav>
        </div>
      )}
    </dialog>
  );
}
