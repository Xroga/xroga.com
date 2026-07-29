'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { api, type Profile } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { safeCompanionSpeech, type CompanionRuntimeEvent } from '@/lib/companion';
import {
  companionPreferencesFromUnknown,
  companionPreferencesSnapshot,
  useCompanionStore,
} from '@/store/useCompanionStore';

const PROFILE_SAVE_DELAY_MS = 900;

export function CompanionProvider({ children }: { children: ReactNode }) {
  const hydratedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<CompanionRuntimeEvent>).detail;
      if (!detail?.type) return;
      useCompanionStore.getState().applyRuntimeEvent(detail);

      if (detail.type === 'assistant_response' && detail.assistantText) {
        const state = useCompanionStore.getState();
        if (!state.voiceEnabled || typeof window.speechSynthesis === 'undefined') return;
        const speech = safeCompanionSpeech(detail.assistantText);
        if (!speech) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speech);
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      }
    };
    const online = () => useCompanionStore.getState().applyRuntimeEvent({ type: 'online', source: 'runtime' });
    const offline = () => useCompanionStore.getState().applyRuntimeEvent({ type: 'offline', source: 'runtime' });
    window.addEventListener('xroga:companion-event', apply);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    if (!navigator.onLine) offline();
    return () => {
      window.removeEventListener('xroga:companion-event', apply);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        if (!active || !data.session) return;
        const profile = await api.profile.get();
        if (!active) return;
        useCompanionStore.getState().hydratePreferences(
          companionPreferencesFromUnknown(profile.companion_preferences),
          profile.display_name,
        );
        hydratedRef.current = true;
      } catch {
        // Public and offline sessions keep their local, non-secret preferences.
      }
    })();

    const unsubscribe = useCompanionStore.subscribe((state, previous) => {
      if (!hydratedRef.current || state === previous) return;
      const next = companionPreferencesSnapshot(state);
      const before = companionPreferencesSnapshot(previous);
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        const body: Partial<Profile> = { companion_preferences: companionPreferencesSnapshot(useCompanionStore.getState()) };
        void api.profile.update(body).catch(() => {
          // Local preferences stay available; authenticated server persistence can retry on the next change.
        });
      }, PROFILE_SAVE_DELAY_MS);
    });

    return () => {
      active = false;
      unsubscribe();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  return <>{children}</>;
}
