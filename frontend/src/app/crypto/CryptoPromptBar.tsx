'use client';

import {
  ArrowUp,
  Paperclip,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { autocorrectText } from '@/lib/chatSuggestions';
import { dispatchCompanionEvent } from '@/lib/companion';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';

import styles from './crypto.module.css';

const PHRASES = [
  'Build an AI agent for crypto market research…',
  'Create a DeFi analytics dashboard…',
  'Build an on-chain monitoring product…',
  'Create a Web3 app in my repository…',
] as const;

function useTypewriter(active: boolean) {
  const [text, setText] = useState('');
  const phraseIndex = useRef(0);
  const charIndex = useRef(0);
  const deleting = useRef(false);

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = PHRASES[phraseIndex.current % PHRASES.length];

      if (!deleting.current) {
        charIndex.current += 1;
        setText(phrase.slice(0, charIndex.current));

        if (charIndex.current >= phrase.length) {
          deleting.current = true;
          timer = setTimeout(tick, 1650);
          return;
        }

        timer = setTimeout(tick, 42);
        return;
      }

      charIndex.current -= 1;
      setText(phrase.slice(0, charIndex.current));

      if (charIndex.current <= 0) {
        deleting.current = false;
        phraseIndex.current += 1;
        timer = setTimeout(tick, 260);
        return;
      }

      timer = setTimeout(tick, 22);
    };

    timer = setTimeout(tick, 420);
    return () => clearTimeout(timer);
  }, [active]);

  return text;
}

export function CryptoPromptBar() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);

  const typewriter = useTypewriter(!prompt && !focused);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 68)}px`;
  }, [prompt]);

  const handleSubmit = useCallback(async () => {
    if (composingRef.current || sending) return;

    const raw = textareaRef.current?.value ?? prompt;
    const text = autocorrectText(raw.trim());
    const finalPrompt = text || 'Build a crypto product with Xroga AI';

    setSending(true);
    localStorage.setItem(PENDING_PROMPT_KEY, finalPrompt);

    dispatchCompanionEvent({
      type: 'prompt_submitted',
      message: 'Your crypto build prompt is ready for the authenticated Xroga workspace.',
      source: 'runtime',
    });

    window.setTimeout(() => {
      void createClient().auth.getSession()
        .then(({ data }) => {
          router.push(data.session ? '/workspace' : '/auth/signup');
        })
        .catch(() => {
          router.push('/auth/signup');
        });
    }, 420);
  }, [prompt, router, sending]);

  return (
    <form
      className={styles.cryptoComposer}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className={styles.composerFrame}>
        <div className={styles.composerMeta}>
          <span>
            <Sparkles aria-hidden="true" />
            XROGA AI · CRYPTO
          </span>
          <small>repository-aware builder</small>
        </div>

        <div className={styles.composerBody}>
          <span className={styles.composerMark} aria-hidden="true">
            <Sparkles />
          </span>

          <div className={styles.composerInputWrap}>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setPrompt(event.currentTarget.value);
              }}
              onFocus={() => {
                setFocused(true);
                dispatchCompanionEvent({
                  type: 'composer_focused',
                  source: 'runtime',
                });
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (
                  composingRef.current ||
                  (event.nativeEvent as KeyboardEvent).isComposing
                ) {
                  return;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              rows={1}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Describe the crypto product or AI agent you want to build"
              className={styles.composerInput}
            />

            {!prompt && !focused && (
              <div className={styles.composerPlaceholder} aria-hidden="true">
                {typewriter}
                <i />
              </div>
            )}
          </div>
        </div>

        <div className={styles.composerToolbar}>
          <div className={styles.composerTools} aria-hidden="true">
            <span><Plus /></span>
            <span><Paperclip /></span>
          </div>

          <button
            type="submit"
            className={styles.composerSend}
            disabled={sending}
            aria-busy={sending}
            aria-label={sending ? 'Sending message' : 'Launch'}
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}
