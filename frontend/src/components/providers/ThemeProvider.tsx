'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { normalizeTheme, skinForTheme, THEME_SURFACE } from '@/lib/theme';

/**
 * Solid themes only: white | gray | black.
 * No deep-work navy, no photo wallpaper/slideshow on app shell.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
  const setSlideshowEnabled = useThemeStore((s) => s.setSlideshowEnabled);
  const pathname = usePathname();
  const isHomepage = pathname === '/';

  // Migrate legacy image/deep-work → white once
  useEffect(() => {
    const core = normalizeTheme(theme);
    if (theme !== core) {
      setTheme(core);
      setTerminalSkin(skinForTheme(core));
    }
    setSlideshowEnabled(false);
  }, [theme, setTheme, setTerminalSkin, setSlideshowEnabled]);

  useEffect(() => {
    const core = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', core);

    const body = document.body;
    body.classList.remove(
      'theme-image',
      'theme-white',
      'theme-black',
      'theme-gray',
      'xv-deep-work-shell',
    );
    body.classList.add(`theme-${core}`);

    // Clear any leftover wallpaper / deep-work inline styles
    body.style.backgroundImage = '';
    body.style.backgroundAttachment = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.removeProperty('--background');
    body.style.backgroundColor = THEME_SURFACE[core];
    body.style.transition = 'background 400ms ease, color 400ms ease';

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', THEME_SURFACE[core]);

    // Homepage paints its own marketing background; keep body solid underneath
    if (isHomepage) {
      body.style.backgroundColor = THEME_SURFACE[core];
    }
  }, [theme, isHomepage]);

  return <>{children}</>;
}
