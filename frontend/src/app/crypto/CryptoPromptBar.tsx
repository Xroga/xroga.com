'use client';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);

  const typewriter = useTypewriter(!prompt && !focused);

  const handleSubmit = useCallback(async () => {
    if (composingRef.current || sending) return;

    const raw = inputRef.current?.value ?? prompt;
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
      className="xv-uiv-poda-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div id="xv-uiv-poda">
        <div className="xv-uiv-poda-glow" />
        <div className="xv-uiv-poda-darkBorderBg" />
        <div className="xv-uiv-poda-darkBorderBg" />
        <div className="xv-uiv-poda-darkBorderBg" />
        <div className="xv-uiv-poda-white" />
        <div className="xv-uiv-poda-border" />

        <div id="xv-uiv-poda-main">
          <input
            ref={inputRef}
            value={prompt}
            placeholder={typewriter || 'Build a Web3 app…'}
            type="text"
            name="crypto-prompt"
            className="xv-uiv-poda-input"
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

              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            aria-label="Describe the crypto product or AI agent you want to build"
          />

          <div id="xv-uiv-poda-input-mask" aria-hidden="true" />
          <div id="xv-uiv-poda-pink-mask" aria-hidden="true" />

          <div className="xv-uiv-poda-filterBorder" aria-hidden="true" />

          <button
            id="xv-uiv-poda-filter-icon"
            type="submit"
            disabled={sending}
            aria-busy={sending}
            aria-label={sending ? 'Sending prompt' : 'Build with Xroga'}
          >
            <svg
              preserveAspectRatio="none"
              height="27"
              width="27"
              viewBox="4.8 4.56 14.832 15.408"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8.16 6.65002H15.83C16.47 6.65002 16.99 7.17002 16.99 7.81002V9.09002C16.99 9.56002 16.7 10.14 16.41 10.43L13.91 12.64C13.56 12.93 13.33 13.51 13.33 13.98V16.48C13.33 16.83 13.1 17.29 12.81 17.47L12 17.98C11.24 18.45 10.2 17.92 10.2 16.99V13.91C10.2 13.5 9.97 12.98 9.73 12.69L7.52 10.36C7.23 10.08 7 9.55002 7 9.20002V7.87002C7 7.17002 7.52 6.65002 8.16 6.65002Z"
                stroke="#d6d6e6"
                strokeWidth="1"
                strokeMiterlimit="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div id="xv-uiv-poda-search-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              height="24"
              fill="none"
            >
              <circle stroke="url(#xv-uiv-search)" r="8" cy="11" cx="11" />
              <line
                stroke="url(#xv-uiv-search-line)"
                y2="16.65"
                y1="22"
                x2="16.65"
                x1="22"
              />
              <defs>
                <linearGradient gradientTransform="rotate(50)" id="xv-uiv-search">
                  <stop stopColor="#f8e7f8" offset="0%" />
                  <stop stopColor="#b6a9b7" offset="50%" />
                </linearGradient>
                <linearGradient id="xv-uiv-search-line">
                  <stop stopColor="#b6a9b7" offset="0%" />
                  <stop stopColor="#837484" offset="50%" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </form>
  );
}
