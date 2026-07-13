'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { DESKTOP_BG_SLIDESHOW, MOBILE_BG } from '@/lib/theme';
import { DesktopBackgroundSlideshow } from '@/components/layout/DesktopBackgroundSlideshow';

const THEME_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#1a1a1a',
  image: '#0a0e17',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const pathname = usePathname();
  const isHomepage = pathname === '/';
  const isAuthRoute = pathname.startsWith('/auth');
  const isShellRoute = pathname === '/workspace' || pathname.startsWith('/dashboard');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    const body = document.body;

    body.classList.remove('theme-image', 'theme-white', 'theme-black', 'theme-gray');
    const effectiveTheme = isHomepage ? 'image' : theme;
    body.classList.add(`theme-${effectiveTheme}`);
    body.style.transition = 'background 500ms ease, color 500ms ease';

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', THEME_COLORS[effectiveTheme] ?? '#0a0a0a');

    const useWallpaper = isHomepage || isAuthRoute || theme === 'image';

    if (useWallpaper) {
      if (isMobile) {
        const url = customMobileBg ?? MOBILE_BG;
        body.style.backgroundImage = `url("${url}")`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.style.backgroundAttachment = 'scroll';
        body.style.backgroundColor = 'transparent';
      } else if (customDesktopBg) {
        body.style.backgroundImage = `url("${customDesktopBg}")`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.style.backgroundAttachment = 'fixed';
        body.style.backgroundColor = 'transparent';
      } else {
        body.style.backgroundImage = '';
        body.style.backgroundAttachment = '';
        body.style.backgroundColor = 'transparent';
      }
    } else {
      body.style.backgroundImage = '';
      body.style.backgroundAttachment = '';
      body.style.backgroundColor = '';
    }
  }, [theme, customDesktopBg, customMobileBg, isHomepage, isAuthRoute, isMobile]);

  const showDesktopSlideshow =
    (isHomepage || isAuthRoute || theme === 'image') && !isMobile && !customDesktopBg;

  const slideshowOverlay = isHomepage
    ? 'bg-gradient-to-b from-black/50 via-black/20 to-black/55'
    : isAuthRoute
      ? 'bg-gradient-to-b from-black/50 via-black/30 to-black/60'
      : isShellRoute
        ? 'bg-gradient-to-b from-black/10 via-transparent to-black/20'
        : 'bg-gradient-to-b from-black/45 via-black/25 to-black/55';

  return (
    <>
      {showDesktopSlideshow ? (
        <DesktopBackgroundSlideshow images={DESKTOP_BG_SLIDESHOW} overlayClassName={slideshowOverlay} />
      ) : null}
      {!isMobile && customDesktopBg && theme === 'image' ? (
        <div
          className="fixed inset-0 -z-10 hidden md:block bg-cover bg-center bg-no-repeat bg-fixed"
          style={{ backgroundImage: `url("${customDesktopBg}")` }}
          aria-hidden
        />
      ) : null}
      {children}
    </>
  );
}
