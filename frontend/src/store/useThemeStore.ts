'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId, TerminalSkin } from '@/lib/theme';
import { CUSTOM_DESKTOP_BG_KEY, CUSTOM_MOBILE_BG_KEY, DEFAULT_TERMINAL_SKIN } from '@/lib/theme';

const THEME_CYCLE: ThemeId[] = ['image', 'white', 'black', 'gray'];

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  sidebarWidth: number;
  customDesktopBg: string | null;
  customMobileBg: string | null;
  terminalFullscreen: boolean;
  terminalSkin: TerminalSkin;
  browserPanelOpen: boolean;
  browserFullscreen: boolean;
  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setCustomDesktopBg: (url: string | null) => void;
  setCustomMobileBg: (url: string | null) => void;
  setTerminalFullscreen: (v: boolean) => void;
  cycleTerminalSkin: () => void;
  setBrowserPanelOpen: (v: boolean) => void;
  setBrowserFullscreen: (v: boolean) => void;
  closeBrowser: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'image',
      sidebarOpen: true,
      sidebarPinned: true,
      sidebarWidth: 256,
      customDesktopBg: null,
      customMobileBg: null,
      terminalFullscreen: false,
      terminalSkin: DEFAULT_TERMINAL_SKIN.image,
      browserPanelOpen: false,
      browserFullscreen: false,
      setTheme: (theme) =>
        set({ theme, terminalSkin: DEFAULT_TERMINAL_SKIN[theme] }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) =>
        set({ sidebarWidth: Math.min(420, Math.max(200, sidebarWidth)) }),
      toggleSidebar: () =>
        set((s) => {
          if (s.sidebarOpen) {
            return { sidebarOpen: false, sidebarPinned: true };
          }
          return { sidebarOpen: true, sidebarPinned: true };
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
          const tIdx = THEME_CYCLE.indexOf(s.theme);
          const nextTheme = THEME_CYCLE[(tIdx + 1) % THEME_CYCLE.length];
          return { theme: nextTheme, terminalSkin: DEFAULT_TERMINAL_SKIN[nextTheme] };
        }),
      setBrowserPanelOpen: (browserPanelOpen) =>
        set(
          browserPanelOpen
            ? { browserPanelOpen: true, browserFullscreen: false }
            : { browserPanelOpen: false, browserFullscreen: false }
        ),
      setBrowserFullscreen: (browserFullscreen) =>
        set(
          browserFullscreen
            ? { browserFullscreen: true, browserPanelOpen: true }
            : { browserFullscreen: false }
        ),
      closeBrowser: () => set({ browserPanelOpen: false, browserFullscreen: false }),
    }),
    {
      name: 'xroga-theme',
      partialize: (s) => ({
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        sidebarPinned: s.sidebarPinned,
        sidebarWidth: s.sidebarWidth,
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
          if (!state.terminalSkin) {
            state.terminalSkin = DEFAULT_TERMINAL_SKIN[state.theme];
          }
        }
      },
    }
  )
);
