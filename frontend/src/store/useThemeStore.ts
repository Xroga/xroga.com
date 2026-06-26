'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId } from '@/lib/theme';
import { CUSTOM_DESKTOP_BG_KEY, CUSTOM_MOBILE_BG_KEY } from '@/lib/theme';

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  customDesktopBg: string | null;
  customMobileBg: string | null;
  terminalFullscreen: boolean;
  terminalColorMode: 'day' | 'night';
  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCustomDesktopBg: (url: string | null) => void;
  setCustomMobileBg: (url: string | null) => void;
  setTerminalFullscreen: (v: boolean) => void;
  toggleTerminalColorMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'image',
      sidebarOpen: true,
      customDesktopBg: null,
      customMobileBg: null,
      terminalFullscreen: false,
      terminalColorMode: 'night',
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setCustomDesktopBg: (url) => {
        if (url) localStorage.setItem(CUSTOM_DESKTOP_BG_KEY, url);
        else localStorage.removeItem(CUSTOM_DESKTOP_BG_KEY);
        set({ customDesktopBg: url });
      },
      setCustomMobileBg: (url) => {
        if (url) localStorage.setItem(CUSTOM_MOBILE_BG_KEY, url);
        else localStorage.removeItem(CUSTOM_MOBILE_BG_KEY);
        set({ customMobileBg: url });
      },
      setTerminalFullscreen: (terminalFullscreen) => set({ terminalFullscreen }),
      toggleTerminalColorMode: () =>
        set((s) => ({ terminalColorMode: s.terminalColorMode === 'day' ? 'night' : 'day' })),
    }),
    {
      name: 'xroga-theme',
      partialize: (s) => ({
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        customDesktopBg: s.customDesktopBg,
        customMobileBg: s.customMobileBg,
        terminalColorMode: s.terminalColorMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') {
          const d = localStorage.getItem(CUSTOM_DESKTOP_BG_KEY);
          const m = localStorage.getItem(CUSTOM_MOBILE_BG_KEY);
          if (d) state.customDesktopBg = d;
          if (m) state.customMobileBg = m;
        }
      },
    }
  )
);
