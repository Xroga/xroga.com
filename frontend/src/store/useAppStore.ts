'use client';

import { create } from 'zustand';
import type { ActionBalance, Notification, Profile } from '@/lib/api';

interface AppState {
  profile: Profile | null;
  actions: ActionBalance | null;
  notifications: Notification[];
  unreadCount: number;
  chatPrefill: string;
  swarmRunning: boolean;
  setProfile: (profile: Profile | null) => void;
  setActions: (actions: ActionBalance | null) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
  setChatPrefill: (text: string) => void;
  setSwarmRunning: (running: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  actions: null,
  notifications: [],
  unreadCount: 0,
  chatPrefill: '',
  swarmRunning: false,
  setProfile: (profile) => set({ profile }),
  setActions: (actions) => set({ actions }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setChatPrefill: (chatPrefill) => set({ chatPrefill }),
  setSwarmRunning: (swarmRunning) => set({ swarmRunning }),
}));
