'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { autocorrectText } from '@/lib/chatSuggestions';
import { cn } from '@/lib/utils';
import type { SendButtonState } from './ChatBarSendIcon';
import { ChatbarShell } from '@/components/ui/Uiverse';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { ChatBarActionsMenu } from './ChatBarActionsMenu';
import { ChatBarMicrophoneButton, ChatBarSendButton } from './ChatBarButtons';
import { createClient } from '@/lib/supabase/client';
import { dispatchCompanionEvent } from '@/lib/companion';

const TYPEWRITER_FEATURES = [
  'Build a website or web app — ship to GitHub + Vercel…',
  'Build a Chrome MV3 extension — zip on Releases…',
  'Build Electron desktop software — installers on GitHub…',
  'Build an Expo Android app — EAS on your account…',
  'Build an Expo iOS app — TestFlight on your account…',
  'Debug this error — frontend, backend, or integration…',
  'Build a full-stack SaaS with auth and billing…',
  'Push to GitHub and go live on Vercel…',
  'Update your repo — theme, auth, pages — in chat…',
];

function useTypewriterPlaceholder(active: boolean, phrases: readonly string[]) {
  const [text, setText] = useState('');
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (!active || phrases.length === 0) return;
    const tick = (): number => {
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
  }, [active, phrases]);

  return text;
}

/**
 * The public prompt bar.
 *
 * Used on the homepage and on /crypto-builder. Both share one submission path —
 * stash the prompt under PENDING_PROMPT_KEY, then route to the workspace when a
 * session exists or through signup when it does not — so the prompt survives
 * authentication and the workspace picks it up on arrival. The props below only
 * change wording and suggestions; the flow itself is never duplicated.
 */
export function HomepageChatBar({
  placeholders = TYPEWRITER_FEATURES,
  ariaLabel = 'Describe what you want to build',
  fallbackPrompt = 'Build a web app with Xroga AI',
  suggestions,
  className,
  listenForAsk = true,
}: {
  placeholders?: readonly string[];
  ariaLabel?: string;
  /** Used when the user submits an empty box, so the workspace always gets intent. */
  fallbackPrompt?: string;
  /** Chips rendered under the bar. Clicking one fills the input and focuses it. */
  suggestions?: readonly string[];
  className?: string;
  /**
   * Whether this bar answers the global `xroga:companion-ask` fill event. Default
   * true, which is the existing behaviour. A page that renders two bars sets this
   * false on the secondary one so a fill request does not pull focus to the copy
   * furthest down the page.
   */
  listenForAsk?: boolean;
} = {}) {
  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const router = useRouter();
  const typewriter = useTypewriterPlaceholder(!prompt && !focused, placeholders);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!listenForAsk) return;
    const onCompanionAsk = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim() ?? '';
      if (text) setPrompt(text);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('xroga:companion-ask', onCompanionAsk);
    return () => window.removeEventListener('xroga:companion-ask', onCompanionAsk);
  }, [listenForAsk]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (composingRef.current || sending) return;
      const text = autocorrectText((textareaRef.current?.value ?? prompt).trim());
      setSending(true);
      setSendState('sending');
      localStorage.setItem(PENDING_PROMPT_KEY, text || fallbackPrompt);
      dispatchCompanionEvent({ type: 'prompt_submitted', message: 'Your prompt is ready for the authenticated Xroga workspace.', source: 'runtime' });
      setTimeout(() => {
        void createClient().auth.getSession().then(({ data }) => {
          setSendState('launched');
          router.push(data.session ? '/workspace' : '/auth/signup');
        }).catch(() => router.push('/auth/signup'));
      }, 700);
    },
    [prompt, router, sending, fallbackPrompt]
  );

  return (
    <div className={cn('w-full max-w-xl mx-auto relative xv-hc-prompt', className)}>
      <form onSubmit={handleSubmit} className="w-full">
        <ChatbarShell
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
                onFocus={() => {
                  setFocused(true);
                  dispatchCompanionEvent({ type: 'composer_focused', source: 'runtime' });
                }}
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
                aria-label={ariaLabel}
                className="xv-hc-prompt-input"
              />
              {!prompt && !focused && (
                <div className="xv-hc-prompt-typewriter" aria-hidden>
                  {typewriter}
                  <i className="xv-hc-prompt-caret" />
                </div>
              )}
            </div>
          </div>

          <div className="xv-hc-prompt-footer">
            <ChatBarActionsMenu
              className="shrink-0"
              disabled={sending}
              onInsert={(text) => {
                setPrompt((current) => (current.trim() ? `${text}${current}` : text));
                window.setTimeout(() => textareaRef.current?.focus(), 20);
              }}
            />
            <div className="xv-hc-prompt-integrations" aria-label="Ships with GitHub, Vercel, and Supabase">
              <span className="xv-hc-prompt-integration">
                <span aria-hidden="true">
                  <IntegrationLogo id="github" name="GitHub" size={14} className="xv-hc-prompt-integration-logo" />
                </span>
                <span>GitHub</span>
              </span>
              <span className="xv-hc-prompt-integration-sep" aria-hidden />
              <span className="xv-hc-prompt-integration">
                <span aria-hidden="true">
                  <IntegrationLogo id="vercel" name="Vercel" size={14} className="xv-hc-prompt-integration-logo" />
                </span>
                <span>Vercel</span>
              </span>
              <span className="xv-hc-prompt-integration-sep" aria-hidden />
              <span className="xv-hc-prompt-integration">
                <span aria-hidden="true">
                  <IntegrationLogo id="supabase" name="Supabase" size={14} className="xv-hc-prompt-integration-logo" />
                </span>
                <span>Supabase</span>
              </span>
            </div>
            <span className="xv-hc-prompt-spacer" aria-hidden />
            <ChatBarMicrophoneButton
              surface="homepage"
              onTranscript={(text) => {
                setPrompt((current) => (current.trim() ? `${current.trim()} ${text}` : text));
                window.setTimeout(() => textareaRef.current?.focus(), 20);
              }}
            />
            {/* Keep the public control's established accessible name while using
                the same send button and state animation as the workspace. */}
            <ChatBarSendButton
              state={sendState}
              surface="homepage"
              compact={Boolean(prompt.trim())}
              idleLabel="Launch"
              loadingLabel="Sending message"
            />
          </div>
        </ChatbarShell>
      </form>

      {/* Suggestion chips fill the input and focus it, following the same
          convention as the companion's ask event, so the user always reviews the
          prompt before it is submitted. */}
      {suggestions && suggestions.length > 0 && (
        <ul className="xv-cb-chips" aria-label="Prompt suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="xv-cb-chip"
                disabled={sending}
                onClick={() => {
                  setPrompt(suggestion);
                  window.setTimeout(() => textareaRef.current?.focus(), 20);
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
