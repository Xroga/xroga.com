'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { CompanionPreferences, CompanionRuntimeEvent } from '@/lib/companion';
import { api, type Profile } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import {
  companionPreferencesFromUnknown,
  companionPreferencesSnapshot,
  useCompanionStore,
} from '@/store/useCompanionStore';

const PROFILE_SAVE_DELAY_MS = 900;

export function CompanionProvider({ children }: { children: ReactNode }) {
  const hydratedRef = useRef(false);
  const hydratingStoreRef = useRef(false);
  const pendingBeforeHydrationRef = useRef<CompanionPreferences | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<CompanionRuntimeEvent>).detail;
      if (!detail?.type) return;
      // Smoky no longer reads responses aloud. The companion is decorative company,
      // and unprompted speech over a work surface was more intrusive than useful.
      useCompanionStore.getState().applyRuntimeEvent(detail);
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
        const pending = pendingBeforeHydrationRef.current;
        if (pending) {
          // A slow profile request must not overwrite or discard edits made while
          // Settings was already interactive. Treat the local edit as newer and
          // persist it as soon as the authenticated profile becomes available.
          hydratedRef.current = true;
          pendingBeforeHydrationRef.current = null;
          await api.profile.update({ companion_preferences: pending });
        } else {
          // Hydrating the store also notifies subscribers. Suppress that one
          // server-originated transition so it is not mistaken for a user edit.
          hydratingStoreRef.current = true;
          useCompanionStore.getState().hydratePreferences(
            companionPreferencesFromUnknown(profile.companion_preferences),
            profile.display_name,
          );
          hydratingStoreRef.current = false;
          hydratedRef.current = true;
        }
      } catch {
        // Public and offline sessions keep their local, non-secret preferences.
      } finally {
        hydratingStoreRef.current = false;
      }
    })();

    const unsubscribe = useCompanionStore.subscribe((state, previous) => {
      if (hydratingStoreRef.current || state === previous) return;
      const next = companionPreferencesSnapshot(state);
      const before = companionPreferencesSnapshot(previous);
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      if (!hydratedRef.current) {
        pendingBeforeHydrationRef.current = next;
        return;
      }
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
