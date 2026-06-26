'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId } from '@/lib/theme';

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'image',
      sidebarOpen: true,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: 'xroga-theme' }
  )
);
