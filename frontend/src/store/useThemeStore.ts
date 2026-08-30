'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AccentId, DensityPreference, FontChoice, FontPreference, ThemeId, TerminalSkin } from '@/lib/theme';
import {
  CUSTOM_DESKTOP_BG_KEY,
  CUSTOM_MOBILE_BG_KEY,
  DEFAULT_TERMINAL_SKIN,
  SLIDESHOW_ENABLED_KEY,
  SLIDESHOW_FROZEN_INDEX_KEY,
  TERMINAL_SKIN_CYCLE,
  isTerminalSkin,
  DESKTOP_BG_SLIDESHOW,
  isAccentId,
  normalizeTheme,
  skinForTheme,
} from '@/lib/theme';
import { recoverCorruptStorage } from '@/lib/storageRecovery';

export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 380;
export const SIDEBAR_DEFAULT_WIDTH = 248;

/**
 * The workspace pane's share of the split, as a percentage of the shell.
 *
 * A percentage rather than pixels: the split lives inside a shell whose own width
 * changes with the sidebar and the browser window, so a pixel width chosen on a wide
 * screen would swallow the terminal on a narrow one. The bounds keep both panes
 * usable — below 24% the file tree cannot show a path, above 72% the terminal stops
 * being a terminal.
 */
export const WORKSPACE_MIN_WIDTH = 24;
export const WORKSPACE_MAX_WIDTH = 72;
export const WORKSPACE_DEFAULT_WIDTH = 42;

if (typeof window !== 'undefined') {
  recoverCorruptStorage();
}

interface ThemeState {
  theme: ThemeId;
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  sidebarWidth: number;
  /** The workspace pane's share of the split, in percent. */
  workspaceWidth: number;
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
  /** Type scale for the sidebar, chosen independently of the workspace. */
  sidebarFont: FontChoice;
  /** Type scale for the workspace chrome. */
  workspaceFont: FontChoice;
  density: DensityPreference;
  reducedMotion: boolean;
  highContrast: boolean;
  browserPanelOpen: boolean;
  browserFullscreen: boolean;
  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setWorkspaceWidth: (percent: number) => void;
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
  setSidebarFont: (font: FontChoice) => void;
  setWorkspaceFont: (font: FontChoice) => void;
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
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      workspaceWidth: WORKSPACE_DEFAULT_WIDTH,
      customDesktopBg: null,
      customMobileBg: null,
      slideshowEnabled: false,
      slideshowFrozenIndex: 0,
      terminalFullscreen: false,
      chatbarHidden: false,
      terminalSkin: 'dark',
      terminalSkinAuto: true,
      accent: 'default',
      fontPreference: 'modern',
      sidebarFont: 'default',
      workspaceFont: 'default',
      density: 'comfortable',
      reducedMotion: false,
      highContrast: false,
      browserPanelOpen: false,
      browserFullscreen: false,
      /**
       * Choosing a theme restyles the whole shell, terminal included.
       *
       * This used to re-derive the skin only while it was still tracking, so a skin
       * picked once by hand froze the terminal against every later theme change. Two
       * pickers then disagreed about what choosing a theme means: the sidebar's
       * `ThemeToggle` forced the skin itself right after calling this, while the
       * homepage switcher did not — so picking Black on the homepage recoloured the
       * sidebar and left the workspace behind, and the user had to pick it a second
       * time from inside the workspace to make it take. The decision belongs here,
       * once, rather than in each control that happens to call it.
       *
       * Picking a *skin* still turns tracking off, and it still survives navigation,
       * reloads and everything else — up to the next explicit theme choice, which is
       * a fresh statement about how the whole shell should look.
       */
      setTheme: (theme) => {
        const next = normalizeTheme(theme);
        return set({
          theme: next,
          terminalSkin: skinForTheme(next),
          terminalSkinAuto: true,
          slideshowEnabled: false,
        });
      },
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth)) }),
      // Clamped in the setter, not at the drag site: every caller then gets the same
      // bounds, including a restored value that was written before they changed.
      setWorkspaceWidth: (workspaceWidth) =>
        set({ workspaceWidth: Math.min(WORKSPACE_MAX_WIDTH, Math.max(WORKSPACE_MIN_WIDTH, workspaceWidth)) }),
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
      setSidebarFont: (sidebarFont) => set({ sidebarFont }),
      setWorkspaceFont: (workspaceFont) => set({ workspaceFont }),
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
        workspaceWidth: s.workspaceWidth,
        slideshowEnabled: s.slideshowEnabled,
        slideshowFrozenIndex: s.slideshowFrozenIndex,
        terminalSkin: s.terminalSkin,
        terminalSkinAuto: s.terminalSkinAuto,
        accent: s.accent,
        fontPreference: s.fontPreference,
        sidebarFont: s.sidebarFont,
        workspaceFont: s.workspaceFont,
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
              ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, state.sidebarWidth))
              : SIDEBAR_DEFAULT_WIDTH,
          // Re-clamped on read, not just on write: a value stored before the bounds
          // changed would otherwise come back out of range and hand one pane the shell.
          workspaceWidth:
            typeof state.workspaceWidth === 'number' && Number.isFinite(state.workspaceWidth)
              ? Math.min(WORKSPACE_MAX_WIDTH, Math.max(WORKSPACE_MIN_WIDTH, state.workspaceWidth))
              : WORKSPACE_DEFAULT_WIDTH,
          accent: isAccentId(state.accent) ? state.accent : 'default',
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
            state.sidebarWidth = Math.min(
              SIDEBAR_MAX_WIDTH,
              Math.max(SIDEBAR_MIN_WIDTH, Number(state.sidebarWidth) || SIDEBAR_DEFAULT_WIDTH),
            );
            if (!isAccentId(state.accent)) state.accent = 'default';
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
