'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AccentId, DensityPreference, FontPreference, ThemeId, TerminalSkin } from '@/lib/theme';
import {
  CUSTOM_DESKTOP_BG_KEY,
  CUSTOM_MOBILE_BG_KEY,
  DEFAULT_TERMINAL_SKIN,
  SLIDESHOW_ENABLED_KEY,
  SLIDESHOW_FROZEN_INDEX_KEY,
  TERMINAL_SKIN_CYCLE,
  isTerminalSkin,
  DESKTOP_BG_SLIDESHOW,
  normalizeTheme,
  skinForTheme,
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
  /** Collapses the composer so the transcript gets the height back. */
  chatbarHidden: boolean;
  terminalSkin: TerminalSkin;
  /** True while the skin tracks the theme; false once the user picks one. */
  terminalSkinAuto: boolean;
  accent: AccentId;
  fontPreference: FontPreference;
  density: DensityPreference;
  reducedMotion: boolean;
  highContrast: boolean;
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
  setChatbarHidden: (v: boolean) => void;
  cycleTerminalSkin: () => void;
  setTerminalSkin: (skin: TerminalSkin) => void;
  /** Hand the skin back to the theme after an explicit choice. */
  setTerminalSkinAuto: () => void;
  setAccent: (accent: AccentId) => void;
  setFontPreference: (fontPreference: FontPreference) => void;
  setDensity: (density: DensityPreference) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  setHighContrast: (highContrast: boolean) => void;
  setBrowserPanelOpen: (v: boolean) => void;
  setBrowserFullscreen: (v: boolean) => void;
  closeBrowser: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'white',
      sidebarOpen: true,
      sidebarPinned: true,
      sidebarWidth: 256,
      customDesktopBg: null,
      customMobileBg: null,
      slideshowEnabled: false,
      slideshowFrozenIndex: 0,
      terminalFullscreen: false,
      chatbarHidden: false,
      terminalSkin: 'dark',
      terminalSkinAuto: true,
      accent: 'blue',
      fontPreference: 'modern',
      density: 'comfortable',
      reducedMotion: false,
      highContrast: false,
      browserPanelOpen: false,
      browserFullscreen: false,
      setTheme: (theme) =>
        set((s) => {
          const next = normalizeTheme(theme);
          return {
            theme: next,
            // Only re-derive the skin while it is still tracking the theme. A skin the
            // user picked deliberately must survive a theme change.
            terminalSkin: s.terminalSkinAuto ? skinForTheme(next) : s.terminalSkin,
            slideshowEnabled: false,
          };
        }),
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
      setChatbarHidden: (chatbarHidden) => set({ chatbarHidden }),
      cycleTerminalSkin: () =>
        set((s) => {
          const idx = TERMINAL_SKIN_CYCLE.indexOf(s.terminalSkin);
          const next = TERMINAL_SKIN_CYCLE[(idx + 1) % TERMINAL_SKIN_CYCLE.length];
          return { terminalSkin: next, terminalSkinAuto: false };
        }),
      // Picking a skin is an explicit choice, so it also ends automatic tracking.
      setTerminalSkin: (terminalSkin) => set({ terminalSkin, terminalSkinAuto: false }),
      setTerminalSkinAuto: () =>
        set((s) => ({ terminalSkinAuto: true, terminalSkin: skinForTheme(s.theme) })),
      setAccent: (accent) => set({ accent }),
      setFontPreference: (fontPreference) => set({ fontPreference }),
      setDensity: (density) => set({ density }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setHighContrast: (highContrast) => set({ highContrast }),
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
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        sidebarPinned: s.sidebarPinned,
        sidebarWidth: s.sidebarWidth,
        slideshowEnabled: s.slideshowEnabled,
        slideshowFrozenIndex: s.slideshowFrozenIndex,
        terminalSkin: s.terminalSkin,
        terminalSkinAuto: s.terminalSkinAuto,
        accent: s.accent,
        fontPreference: s.fontPreference,
        density: s.density,
        reducedMotion: s.reducedMotion,
        highContrast: s.highContrast,
        terminalFullscreen: s.terminalFullscreen,
        chatbarHidden: s.chatbarHidden,
      }),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<ThemeState>;
        return {
          ...state,
          theme: normalizeTheme(state.theme),
          sidebarOpen: state.sidebarOpen !== false,
          sidebarWidth:
            typeof state.sidebarWidth === 'number' && Number.isFinite(state.sidebarWidth)
              ? Math.min(420, Math.max(200, state.sidebarWidth))
              : 256,
          accent: ['blue', 'violet', 'emerald', 'coral'].includes(String(state.accent))
            ? state.accent
            : 'blue',
          fontPreference: ['modern', 'classic', 'mono'].includes(String(state.fontPreference))
            ? state.fontPreference
            : 'modern',
          density: ['comfortable', 'compact'].includes(String(state.density))
            ? state.density
            : 'comfortable',
          reducedMotion: state.reducedMotion === true,
          highContrast: state.highContrast === true,
          terminalFullscreen: state.terminalFullscreen === true,
          chatbarHidden: state.chatbarHidden === true,
        } as ThemeState;
      },
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
            const next = normalizeTheme(state.theme);
            if (state.theme !== next) {
              state.theme = next;
            }
            state.slideshowEnabled = false;
            state.sidebarOpen = state.sidebarOpen !== false;
            state.sidebarWidth = Math.min(420, Math.max(200, Number(state.sidebarWidth) || 256));
            if (!['blue', 'violet', 'emerald', 'coral'].includes(String(state.accent))) state.accent = 'blue';
            if (!['modern', 'classic', 'mono'].includes(String(state.fontPreference))) state.fontPreference = 'modern';
            if (!['comfortable', 'compact'].includes(String(state.density))) state.density = 'comfortable';
            // Stored state written before skins were selectable has no `auto` flag;
            // treat it as auto so those users keep the pinned dark surface.
            if (typeof state.terminalSkinAuto !== 'boolean') state.terminalSkinAuto = true;
            // A skin id can also be stale if the catalogue changed under a persisted
            // value, so it is validated rather than trusted.
            if (state.terminalSkinAuto || !isTerminalSkin(state.terminalSkin)) {
              state.terminalSkin = skinForTheme(next);
            }

            const d = localStorage.getItem(CUSTOM_DESKTOP_BG_KEY);
            const m = localStorage.getItem(CUSTOM_MOBILE_BG_KEY);
            if (d) state.customDesktopBg = d;
            if (m) state.customMobileBg = m;
            const fi = localStorage.getItem(SLIDESHOW_FROZEN_INDEX_KEY);
            if (fi != null && fi !== '') {
              const n = parseInt(fi, 10);
              if (!Number.isNaN(n)) {
                const max = Math.max(0, DESKTOP_BG_SLIDESHOW.length - 1);
                state.slideshowFrozenIndex = Math.min(Math.max(0, n), max);
              }
            }
            if (!state.terminalSkin) {
              state.terminalSkin = DEFAULT_TERMINAL_SKIN[next];
            }
          } catch {
            localStorage.removeItem('xroga-theme');
          }
        }
      },
    }
  )
);
