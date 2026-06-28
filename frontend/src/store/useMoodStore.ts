'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LucideIcon } from 'lucide-react';
import {
  Smile,
  Frown,
  Angry,
  Briefcase,
  Zap,
  HeartPulse,
  Meh,
  Sparkles,
  Leaf,
  Flame,
  Brain,
  Moon,
  Sun,
  Laugh,
  Target,
  Music,
  Coffee,
} from 'lucide-react';

export type ChatMood =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'professional'
  | 'crazy'
  | 'anxious'
  | 'neutral'
  | 'excited'
  | 'calm'
  | 'focused'
  | 'playful'
  | 'romantic'
  | 'bold'
  | 'sleepy'
  | 'energetic'
  | 'curious'
  | 'grateful'
  | 'sarcastic';

export const CHAT_MOODS: {
  id: ChatMood;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  { id: 'happy', label: 'Happy', desc: 'Upbeat & warm', icon: Smile },
  { id: 'sad', label: 'Sad', desc: 'Gentle & soft', icon: Frown },
  { id: 'angry', label: 'Angry', desc: 'Direct & blunt', icon: Angry },
  { id: 'professional', label: 'Pro', desc: 'Formal & precise', icon: Briefcase },
  { id: 'crazy', label: 'Wild', desc: 'Bold & chaotic', icon: Zap },
  { id: 'anxious', label: 'Anxious', desc: 'Calm reassurance', icon: HeartPulse },
  { id: 'neutral', label: 'Neutral', desc: 'Balanced tone', icon: Meh },
  { id: 'excited', label: 'Hyped', desc: 'High energy', icon: Sparkles },
  { id: 'calm', label: 'Calm', desc: 'Mindful & slow', icon: Leaf },
  { id: 'focused', label: 'Focused', desc: 'Laser-sharp', icon: Target },
  { id: 'playful', label: 'Playful', desc: 'Fun & witty', icon: Laugh },
  { id: 'romantic', label: 'Warm', desc: 'Kind & caring', icon: HeartPulse },
  { id: 'bold', label: 'Bold', desc: 'Confident push', icon: Flame },
  { id: 'sleepy', label: 'Late night', desc: 'Soft & brief', icon: Moon },
  { id: 'energetic', label: 'Energetic', desc: 'Fast & active', icon: Sun },
  { id: 'curious', label: 'Curious', desc: 'Questions first', icon: Brain },
  { id: 'grateful', label: 'Grateful', desc: 'Thankful vibe', icon: Coffee },
  { id: 'sarcastic', label: 'Sarcastic', desc: 'Dry humor', icon: Music },
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
