'use client';

import { create } from 'zustand';
import type { Notification, Profile, TokenUsage } from '@/lib/api';

interface AppState {
  profile: Profile | null;
  tokenUsage: TokenUsage | null;
  planTier: string | null;
  planName: string | null;
  notifications: Notification[];
  unreadCount: number;
  chatPrefill: string;
  swarmRunning: boolean;
  setProfile: (profile: Profile | null) => void;
  setTokenUsage: (usage: TokenUsage | null) => void;
  setPlanInfo: (tier: string | null, name: string | null) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
  setChatPrefill: (text: string) => void;
  setSwarmRunning: (running: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  tokenUsage: null,
  planTier: null,
  planName: null,
  notifications: [],
  unreadCount: 0,
  chatPrefill: '',
  swarmRunning: false,
  setProfile: (profile) => set({ profile }),
  setTokenUsage: (tokenUsage) => set({ tokenUsage }),
  setPlanInfo: (planTier, planName) => set({ planTier, planName }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setChatPrefill: (chatPrefill) => set({ chatPrefill }),
  setSwarmRunning: (swarmRunning) => set({ swarmRunning }),
}));
