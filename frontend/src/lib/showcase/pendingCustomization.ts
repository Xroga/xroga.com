/**
 * Keeps a showcase selection alive across a sign-in redirect.
 *
 * Stored in localStorage rather than sessionStorage because OAuth can complete in
 * a different tab. Entries carry a timestamp and expire, so a stale selection from
 * days ago never resurfaces and silently creates a project.
 */

import type { GuidedAnswers } from './buildCommand';
import { getShowcaseById } from './registry';

const KEY = 'xroga_pending_showcase_v1';
const TTL_MS = 60 * 60 * 1000; // one hour

export type PendingIntent = 'customize' | 'github';

export interface PendingCustomization {
  templateId: string;
  templateVersion: string;
  templateSlug: string;
  intent: PendingIntent;
  answers: GuidedAnswers;
  visiblePrompt: string;
  /** Guards against duplicate project creation on refresh or repeated callbacks. */
  idempotencyKey: string;
  savedAt: number;
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function savePendingCustomization(
  input: Omit<PendingCustomization, 'savedAt' | 'idempotencyKey'> & { idempotencyKey?: string },
): PendingCustomization | null {
  if (typeof window === 'undefined') return null;
  const record: PendingCustomization = {
    ...input,
    idempotencyKey: input.idempotencyKey ?? makeIdempotencyKey(),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export function readPendingCustomization(): PendingCustomization | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCustomization>;
    // A structurally invalid entry can never become valid, so drop it instead of
    // leaving it to be re-parsed and re-rejected on every future read.
    if (!parsed?.templateId || !parsed?.templateSlug || typeof parsed.savedAt !== 'number') {
      clearPendingCustomization();
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      clearPendingCustomization();
      return null;
    }

    // localStorage is user-writable. Resolve the id against the registry so an
    // edited entry cannot steer a build at something that is not a real template.
    const template = getShowcaseById(parsed.templateId);
    if (!template || template.slug !== parsed.templateSlug) {
      clearPendingCustomization();
      return null;
    }
    if (parsed.intent !== 'customize' && parsed.intent !== 'github') {
      clearPendingCustomization();
      return null;
    }
    if (typeof parsed.visiblePrompt !== 'string' || typeof parsed.idempotencyKey !== 'string') {
      clearPendingCustomization();
      return null;
    }

    return {
      templateId: template.id,
      templateVersion: template.templateVersion,
      templateSlug: template.slug,
      intent: parsed.intent,
      answers: (parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {}) as GuidedAnswers,
      visiblePrompt: parsed.visiblePrompt,
      idempotencyKey: parsed.idempotencyKey,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingCustomization(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
