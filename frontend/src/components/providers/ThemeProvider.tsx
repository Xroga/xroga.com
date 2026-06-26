'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const body = document.body;

    body.classList.remove('theme-image', 'theme-white', 'theme-black', 'theme-gray', 'theme-blue-gradient');
    body.classList.add(`theme-${theme}`);

    if (theme === 'image') {
      const url = isMobile ? MOBILE_BG : DESKTOP_BG;
      body.style.backgroundImage = `url("${url}")`;
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
    } else {
      body.style.backgroundImage = '';
      body.style.backgroundAttachment = '';
    }
  }, [theme]);

  return <>{children}</>;
}
