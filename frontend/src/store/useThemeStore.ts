'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId, TerminalSkin } from '@/lib/theme';
import { CUSTOM_DESKTOP_BG_KEY, CUSTOM_MOBILE_BG_KEY } from '@/lib/theme';

const SKIN_CYCLES: Record<ThemeId, TerminalSkin[]> = {
  white: ['dark', 'light', 'light-grid'],
  black: ['amoled', 'light', 'gray', 'dark'],
  gray: ['gray', 'dark', 'light', 'amoled'],
  image: ['dark', 'light', 'light-grid', 'gray'],
};

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  customDesktopBg: string | null;
  customMobileBg: string | null;
  terminalFullscreen: boolean;
  terminalSkin: TerminalSkin;
  browserPanelOpen: boolean;
  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCustomDesktopBg: (url: string | null) => void;
  setCustomMobileBg: (url: string | null) => void;
  setTerminalFullscreen: (v: boolean) => void;
  cycleTerminalSkin: () => void;
  setBrowserPanelOpen: (v: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'image',
      sidebarOpen: true,
      sidebarPinned: true,
      customDesktopBg: null,
      customMobileBg: null,
      terminalFullscreen: false,
      terminalSkin: 'dark',
      browserPanelOpen: false,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () =>
        set((s) => {
          const next = !s.sidebarOpen;
          return { sidebarOpen: next, sidebarPinned: next };
        }),
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
      cycleTerminalSkin: () =>
        set((s) => {
          const cycle = SKIN_CYCLES[s.theme] ?? SKIN_CYCLES.image;
          const idx = cycle.indexOf(s.terminalSkin);
          const next = cycle[(idx + 1) % cycle.length];
          return { terminalSkin: next };
        }),
      setBrowserPanelOpen: (browserPanelOpen) => set({ browserPanelOpen }),
    }),
    {
      name: 'xroga-theme',
      partialize: (s) => ({
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        sidebarPinned: s.sidebarPinned,
        customDesktopBg: s.customDesktopBg,
        customMobileBg: s.customMobileBg,
        terminalSkin: s.terminalSkin,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') {
          const d = localStorage.getItem(CUSTOM_DESKTOP_BG_KEY);
          const m = localStorage.getItem(CUSTOM_MOBILE_BG_KEY);
          if (d) state.customDesktopBg = d;
          if (m) state.customMobileBg = m;
          if (state.sidebarPinned) state.sidebarOpen = true;
        }
      },
    }
  )
);
