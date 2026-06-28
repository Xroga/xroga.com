'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatMood =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'professional'
  | 'crazy'
  | 'anxious'
  | 'neutral'
  | 'excited'
  | 'calm';

export const CHAT_MOODS: { id: ChatMood; emoji: string; label: string; desc: string }[] = [
  { id: 'happy', emoji: '😊', label: 'Happy', desc: 'Upbeat & encouraging' },
  { id: 'sad', emoji: '😢', label: 'Sad', desc: 'Gentle & comforting' },
  { id: 'angry', emoji: '😤', label: 'Angry', desc: 'Direct & no-nonsense' },
  { id: 'professional', emoji: '💼', label: 'Professional', desc: 'Formal & precise' },
  { id: 'crazy', emoji: '🤪', label: 'Crazy', desc: 'Wild ideas & bold energy' },
  { id: 'anxious', emoji: '😰', label: 'Anxious', desc: 'Patient & reassuring' },
  { id: 'neutral', emoji: '😐', label: 'Neutral', desc: 'Balanced & clear' },
  { id: 'excited', emoji: '🤩', label: 'Excited', desc: 'High energy & hype' },
  { id: 'calm', emoji: '🧘', label: 'Calm', desc: 'Slow, mindful replies' },
];

interface MoodState {
  autoEnabled: boolean;
  mood: ChatMood;
  setAutoEnabled: (v: boolean) => void;
  setMood: (m: ChatMood) => void;
}

export const useMoodStore = create<MoodState>()(
  persist(
    (set) => ({
      autoEnabled: true,
      mood: 'neutral',
      setAutoEnabled: (autoEnabled) => set({ autoEnabled }),
      setMood: (mood) => set({ mood }),
    }),
    { name: 'xroga-mood' }
  )
);
