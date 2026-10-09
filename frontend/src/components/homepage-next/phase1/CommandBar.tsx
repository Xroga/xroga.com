'use client';

/**
 * The command bar (V7 §22–§28): a real entry point into the Xroga workspace.
 * While nobody is using it, it shows the request the stage is acting on. Clicking, tapping, focusing
 * or typing pauses only that demo text: the orb, work object, tools and background keep running.
 * The visitor's own text is never overwritten. Rules live in commandLogic.ts.
 */
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { COPY } from './copy';
import { type BarState, demoVisible, onBlur, onFocus, onType, submission } from './commandLogic';
import s from './CommandBar.module.css';

export const GENERAL_PROMPT = COPY.placeholder;

export function CommandBar({
  request,
  pulse,
  barRef,
}: {
  /** Request the stage is acting on (null: the placeholder). */
  request: string | null;
  /** True while the request travels to Xroga. */
  pulse: boolean;
  barRef?: React.Ref<HTMLFormElement>;
}) {
  const router = useRouter();
  const [bar, setBar] = useState<BarState>({ value: '', focused: false, resumeAt: 0 });
  const [now, setNow] = useState(0);
  const [sending, setSending] = useState(false);
  const showDemo = demoVisible(bar, now);

  // After an empty blur, bring the demo back once its pause has passed.
  useEffect(() => {
    if (!Number.isFinite(bar.resumeAt) || bar.resumeAt <= now) return;
    const id = window.setTimeout(() => setNow(performance.now()), bar.resumeAt - performance.now() + 20);
    return () => window.clearTimeout(id);
  }, [bar.resumeAt, now]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const go = (signedIn: boolean) => {
      const { prompt, route } = submission(bar.value, signedIn);
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

  return (
    <form
      ref={barRef}
      className={s.bar}
      data-focused={bar.focused || undefined}
      data-pulse={(pulse && showDemo) || undefined}
      onSubmit={submit}
      role="search"
      aria-label="Tell Xroga what to do"
    >
      <Image src="/homepage/orb/xroga-orb-icon.webp" width={20} height={20} alt="" className={s.mark} />
      <div className={s.field}>
        <label htmlFor="s00-command" className={s.srOnly}>
          {GENERAL_PROMPT}
        </label>
        <input
          id="s00-command"
          className={s.input}
          value={bar.value}
          onChange={(e) => setBar((b) => onType(b, e.target.value))}
          onFocus={() => setBar(onFocus)}
          onBlur={() => {
            const t = performance.now();
            setNow(t);
            setBar((b) => onBlur(b, t));
          }}
          placeholder={showDemo ? '' : GENERAL_PROMPT}
          autoComplete="off"
          enterKeyHint="go"
        />
        <AnimatePresence mode="wait" initial={false}>
          {showDemo && (
            <motion.span
              key={request ?? GENERAL_PROMPT}
              className={s.example}
              data-general={!request || undefined}
              aria-hidden="true"
              initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {request ?? GENERAL_PROMPT}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <button type="submit" className={s.send} aria-label={COPY.send} disabled={sending}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h9M10.5 5.5L15 10l-4.5 4.5" />
        </svg>
      </button>
    </form>
  );
}
