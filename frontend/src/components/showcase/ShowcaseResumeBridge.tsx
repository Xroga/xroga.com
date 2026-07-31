'use client';

/**
 * Resumes a showcase customization that was started before signing in.
 *
 * The selection is stored client-side before any redirect, so a sign-up round trip
 * does not lose the user's answers. This loads it back into the composer once,
 * keyed by the idempotency key so a refresh cannot replay it.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { clearPendingCustomization, readPendingCustomization } from '@/lib/showcase/pendingCustomization';
import { getShowcaseById } from '@/lib/showcase/registry';

/** Keys already applied in this browser, so a reload does not re-fill the composer. */
const APPLIED_KEY = 'xroga_showcase_applied_v1';

function alreadyApplied(key: string): boolean {
  try {
    return sessionStorage.getItem(APPLIED_KEY) === key;
  } catch {
    return false;
  }
}

function markApplied(key: string): void {
  try {
    sessionStorage.setItem(APPLIED_KEY, key);
  } catch {
    /* non-fatal: the worst case is one extra prefill */
  }
}

export function ShowcaseResumeBridge() {
  const searchParams = useSearchParams();
  const { setPrompt } = useTerminalChat();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (searchParams.get('showcase') !== '1') return;
    ran.current = true;

    const pending = readPendingCustomization();
    if (!pending || pending.intent !== 'customize') return;
    if (alreadyApplied(pending.idempotencyKey)) return;

    const template = getShowcaseById(pending.templateId);
    if (!template) return;

    markApplied(pending.idempotencyKey);
    setPrompt(pending.visiblePrompt);
    clearPendingCustomization();
    toast.success(`${template.name} is ready in the composer — review it, then send.`);

    document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]')?.focus();
  }, [searchParams, setPrompt]);

  return null;
}
