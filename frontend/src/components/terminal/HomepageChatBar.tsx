'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Rocket } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { autocorrectText } from '@/lib/chatSuggestions';
import { cn } from '@/lib/utils';

const TYPEWRITER_FEATURES = [
  'Create games, apps, and automations with AI Swarm…',
  'Build a full-stack SaaS with auth and billing…',
  'Push to GitHub and go live on Vercel…',
  'Ship a landing page from one prompt…',
  'Update your repo — theme, auth, pages — in chat…',
];

function useTypewriterPlaceholder(active: boolean) {
  const [text, setText] = useState('');
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const tick = (): number => {
      const phrases = TYPEWRITER_FEATURES;
      const phrase = phrases[idxRef.current % phrases.length];
      if (!deletingRef.current) {
        charRef.current += 1;
        setText(phrase.slice(0, charRef.current));
        if (charRef.current >= phrase.length) {
          deletingRef.current = true;
          return 2200;
        }
        return 42;
      }
      charRef.current -= 1;
      setText(phrase.slice(0, charRef.current));
      if (charRef.current <= 0) {
        deletingRef.current = false;
        idxRef.current += 1;
        return 400;
      }
      return 24;
    };

    let timeout: ReturnType<typeof setTimeout>;
    const run = (delay: number) => {
      timeout = setTimeout(() => run(tick()), delay);
    };
    run(600);
    return () => clearTimeout(timeout);
  }, [active]);

  return text;
}

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const router = useRouter();
  const typewriter = useTypewriterPlaceholder(!prompt && !focused);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  }, [prompt]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (composingRef.current || sending) return;
      const text = autocorrectText((textareaRef.current?.value ?? prompt).trim());
      setSending(true);
      localStorage.setItem(PENDING_PROMPT_KEY, text || 'Build with Xroga AI Swarm');
      setTimeout(() => router.push('/auth/signup'), 700);
    },
    [prompt, router, sending]
  );

  return (
    <div className="w-full max-w-xl mx-auto relative xv-hc-prompt">
      <form onSubmit={handleSubmit} className="w-full">
        <div
          className={cn(
            'xv-hc-prompt-shell',
            focused && 'is-focused',
            sending && 'is-sending'
          )}
        >
          <div className="xv-hc-prompt-main">
            <div className="relative w-full min-w-0">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  setPrompt(e.currentTarget.value);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (composingRef.current || (e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder=""
                rows={2}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-label="Describe what you want to build"
                className="xv-hc-prompt-input"
              />
              {!prompt && !focused && (
                <div className="xv-hc-prompt-typewriter" aria-hidden>
                  {typewriter}
                  <i className="xv-hc-prompt-caret" />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="xv-hc-prompt-go"
              disabled={sending}
              aria-label="GO"
            >
              <Rocket className="w-3.5 h-3.5" aria-hidden />
              <span>{sending ? '…' : 'GO!'}</span>
            </button>
          </div>

          <div className="xv-hc-prompt-footer">
            <div className="xv-hc-prompt-integrations" aria-label="Ships with GitHub and Vercel">
              <span className="xv-hc-prompt-integration">
                <Image
                  src="https://cdn.simpleicons.org/github/ffffff"
                  alt=""
                  width={14}
                  height={14}
                  unoptimized
                  className="xv-hc-prompt-integration-logo"
                />
                <span>GitHub</span>
              </span>
              <span className="xv-hc-prompt-integration-sep" aria-hidden />
              <span className="xv-hc-prompt-integration">
                <Image
                  src="https://cdn.simpleicons.org/vercel/ffffff"
                  alt=""
                  width={14}
                  height={14}
                  unoptimized
                  className="xv-hc-prompt-integration-logo"
                />
                <span>Vercel</span>
              </span>
            </div>
            <p className="xv-hc-prompt-hint">Describe what you want to build</p>
          </div>
        </div>
      </form>
    </div>
  );
}
