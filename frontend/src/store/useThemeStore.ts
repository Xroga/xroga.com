'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemeId, TerminalSkin } from '@/lib/theme';
import {
  CUSTOM_DESKTOP_BG_KEY,
  CUSTOM_MOBILE_BG_KEY,
  DEFAULT_TERMINAL_SKIN,
  SLIDESHOW_ENABLED_KEY,
  SLIDESHOW_FROZEN_INDEX_KEY,
  TERMINAL_SKIN_CYCLE,
} from '@/lib/theme';
import { recoverCorruptStorage } from '@/lib/storageRecovery';

if (typeof window !== 'undefined') {
  recoverCorruptStorage();
}

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  sidebarWidth: number;
  customDesktopBg: string | null;
  customMobileBg: string | null;
  slideshowEnabled: boolean;
  slideshowFrozenIndex: number;
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
  setSlideshowEnabled: (enabled: boolean) => void;
  setSlideshowFrozenIndex: (index: number) => void;
  setTerminalFullscreen: (v: boolean) => void;
  cycleTerminalSkin: () => void;
  setTerminalSkin: (skin: TerminalSkin) => void;
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
      slideshowEnabled: true,
      slideshowFrozenIndex: 0,
      terminalFullscreen: false,
      terminalSkin: DEFAULT_TERMINAL_SKIN.image,
      browserPanelOpen: false,
      browserFullscreen: false,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) =>
        set({ sidebarWidth: Math.min(420, Math.max(200, sidebarWidth)) }),
      toggleSidebar: () =>
        set((s) => {
          if (s.sidebarOpen) {
            return { sidebarOpen: false, sidebarPinned: false };
          }
          return { sidebarOpen: true, sidebarPinned: false };
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
      setSlideshowEnabled: (slideshowEnabled) => {
        localStorage.setItem(SLIDESHOW_ENABLED_KEY, slideshowEnabled ? '1' : '0');
        set({ slideshowEnabled });
      },
      setSlideshowFrozenIndex: (slideshowFrozenIndex) => {
        localStorage.setItem(SLIDESHOW_FROZEN_INDEX_KEY, String(slideshowFrozenIndex));
        set({ slideshowFrozenIndex });
      },
      setTerminalFullscreen: (terminalFullscreen) => set({ terminalFullscreen }),
      cycleTerminalSkin: () =>
        set((s) => {
          const idx = TERMINAL_SKIN_CYCLE.indexOf(s.terminalSkin);
          const next = TERMINAL_SKIN_CYCLE[(idx + 1) % TERMINAL_SKIN_CYCLE.length];
          return { terminalSkin: next };
        }),
      setTerminalSkin: (terminalSkin) => set({ terminalSkin }),
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
        slideshowEnabled: s.slideshowEnabled,
        slideshowFrozenIndex: s.slideshowFrozenIndex,
        terminalSkin: s.terminalSkin,
      }),
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            localStorage.removeItem(name);
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* ignore */
          }
        },
      })),
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') {
          try {
            const d = localStorage.getItem(CUSTOM_DESKTOP_BG_KEY);
            const m = localStorage.getItem(CUSTOM_MOBILE_BG_KEY);
            if (d) state.customDesktopBg = d;
            if (m) state.customMobileBg = m;
            const se = localStorage.getItem(SLIDESHOW_ENABLED_KEY);
            if (se === '0') state.slideshowEnabled = false;
            const fi = localStorage.getItem(SLIDESHOW_FROZEN_INDEX_KEY);
            if (fi != null && fi !== '') {
              const n = parseInt(fi, 10);
              if (!Number.isNaN(n)) state.slideshowFrozenIndex = n;
            }
            if (!state.terminalSkin) {
              state.terminalSkin = DEFAULT_TERMINAL_SKIN[state.theme];
            }
          } catch {
            localStorage.removeItem('xroga-theme');
          }
        }
      },
    }
  )
);
