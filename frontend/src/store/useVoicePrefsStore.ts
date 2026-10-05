'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VoiceGender = 'auto' | 'female' | 'male';
export type VoiceTone = 'warm' | 'calm' | 'professional' | 'energetic';

export const XROGA_VOICE_LANGUAGES = [
  { value: 'auto', label: 'Auto / device language' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ur-PK', label: 'Urdu' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'pa-PK', label: 'Punjabi' },
  { value: 'bn-BD', label: 'Bengali' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'zh-CN', label: 'Chinese (Mandarin)' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
] as const;

export type VoiceLanguage = (typeof XROGA_VOICE_LANGUAGES)[number]['value'];

interface VoicePrefsState {
  voiceGender: VoiceGender;
  tone: VoiceTone;
  language: VoiceLanguage;
  handsFreeEnabled: boolean;
  autoSpeak: boolean;
  notificationsEnabled: boolean;
  onboardingComplete: boolean;
  onboardingDismissed: boolean;
  setVoiceGender: (voiceGender: VoiceGender) => void;
  setTone: (tone: VoiceTone) => void;
  setLanguage: (language: VoiceLanguage) => void;
  setHandsFreeEnabled: (handsFreeEnabled: boolean) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
  setNotificationsEnabled: (notificationsEnabled: boolean) => void;
  setOnboardingComplete: (onboardingComplete: boolean) => void;
  setOnboardingDismissed: (onboardingDismissed: boolean) => void;
}

export const useVoicePrefsStore = create<VoicePrefsState>()(
  persist(
    (set) => ({
      voiceGender: 'auto',
      tone: 'warm',
      language: 'auto',
      handsFreeEnabled: false,
      autoSpeak: true,
      notificationsEnabled: false,
      onboardingComplete: false,
      onboardingDismissed: false,
      setVoiceGender: (voiceGender) => set({ voiceGender }),
      setTone: (tone) => set({ tone }),
      setLanguage: (language) => set({ language }),
      setHandsFreeEnabled: (handsFreeEnabled) => set({ handsFreeEnabled }),
      setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
      setOnboardingDismissed: (onboardingDismissed) => set({ onboardingDismissed }),
    }),
    {
      name: 'xroga-voice-prefs',
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<VoicePrefsState>;
        return {
          voiceGender: state.voiceGender ?? 'auto',
          tone: state.tone ?? 'warm',
          language: state.language ?? 'auto',
          handsFreeEnabled: state.handsFreeEnabled ?? false,
          autoSpeak: state.autoSpeak ?? true,
          notificationsEnabled: state.notificationsEnabled ?? false,
          onboardingComplete: state.onboardingComplete ?? false,
          onboardingDismissed: state.onboardingDismissed ?? false,
        } satisfies Partial<VoicePrefsState>;
      },
    },
  ),
);

/** Avoid SSR/client hydration mismatch for persisted gender. */
export function useVoiceGender(): VoiceGender {
  const gender = useVoicePrefsStore((state) => state.voiceGender);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? gender : 'auto';
}
