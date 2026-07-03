'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VoiceGender = 'female' | 'male';

interface VoicePrefsState {
  voiceGender: VoiceGender;
  setVoiceGender: (g: VoiceGender) => void;
}

export const useVoicePrefsStore = create<VoicePrefsState>()(
  persist(
    (set) => ({
      voiceGender: 'female',
      setVoiceGender: (voiceGender) => set({ voiceGender }),
    }),
    { name: 'xroga-voice-prefs' }
  )
);

/** Avoid SSR/client hydration mismatch for persisted gender */
export function useVoiceGender(): VoiceGender {
  const gender = useVoicePrefsStore((s) => s.voiceGender);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? gender : 'female';
}
