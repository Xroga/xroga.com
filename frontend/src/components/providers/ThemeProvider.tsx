'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const body = document.body;

    body.classList.remove('theme-image', 'theme-white', 'theme-black', 'theme-gray');
    body.classList.add(`theme-${theme}`);
    body.style.transition = 'background 500ms ease, color 500ms ease';

    if (theme === 'image') {
      const url = isMobile ? (customMobileBg ?? MOBILE_BG) : (customDesktopBg ?? DESKTOP_BG);
      body.style.backgroundImage = `url("${url}")`;
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
    } else {
      body.style.backgroundImage = '';
      body.style.backgroundAttachment = '';
    }
  }, [theme, customDesktopBg, customMobileBg]);

  return <>{children}</>;
}
