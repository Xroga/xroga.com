'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { DESKTOP_BG_SLIDESHOW, MOBILE_BG } from '@/lib/theme';
import { DesktopBackgroundSlideshow } from '@/components/layout/DesktopBackgroundSlideshow';
import { SlideshowIndexContext } from '@/components/providers/SlideshowIndexContext';

const DEEP_WORK_BG = '#05080f';

const THEME_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#1a1a1a',
  image: DEEP_WORK_BG,
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const slideshowEnabled = useThemeStore((s) => s.slideshowEnabled);
  const slideshowFrozenIndex = useThemeStore((s) => s.slideshowFrozenIndex);
  const [slideshowIndex, setSlideshowIndex] = useState(slideshowFrozenIndex);
  const pathname = usePathname();
  const isHomepage = pathname === '/';
  const isAuthRoute = pathname.startsWith('/auth');
  const isShellRoute =
    pathname === '/workspace' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings');
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

    body.classList.remove(
      'theme-image',
      'theme-white',
      'theme-black',
      'theme-gray',
      'xv-deep-work-shell',
    );

    // Homepage always deep-work image class (static wallpaper owned by page)
    // Shell respects user theme pick (Deep Work / Black / Gray) — never photo wallpaper
    const effectiveTheme = isHomepage ? 'image' : theme;
    body.classList.add(`theme-${effectiveTheme}`);

    const useDeepWorkShell =
      isShellRoute && (theme === 'image' || theme === 'black' || theme === 'gray');
    if (useDeepWorkShell) {
      body.classList.add('xv-deep-work-shell');
      if (theme === 'black') {
        body.style.setProperty('--background', '#000000');
      } else if (theme === 'gray') {
        body.style.setProperty('--background', '#12151c');
      } else {
        body.style.setProperty('--background', DEEP_WORK_BG);
      }
    } else {
      body.style.removeProperty('--background');
    }

    body.style.transition = 'background 500ms ease, color 500ms ease';

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute(
      'content',
      isHomepage || useDeepWorkShell
        ? (theme === 'black' ? '#000000' : theme === 'gray' ? '#12151c' : DEEP_WORK_BG)
        : (THEME_COLORS[effectiveTheme] ?? '#0a0a0a'),
    );

    // No photo slideshow / wallpaper on homepage or workspace shell
    if (isHomepage || isShellRoute) {
      body.style.backgroundImage = '';
      body.style.backgroundAttachment = '';
      body.style.backgroundSize = '';
      body.style.backgroundPosition = '';
      body.style.backgroundColor =
        theme === 'black' && isShellRoute
          ? '#000000'
          : theme === 'gray' && isShellRoute
            ? '#12151c'
            : DEEP_WORK_BG;
      return;
    }

    const useWallpaper = isAuthRoute || theme === 'image';

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
  }, [
    theme,
    customDesktopBg,
    customMobileBg,
    isHomepage,
    isAuthRoute,
    isShellRoute,
    isMobile,
  ]);

  const showDesktopSlideshow =
    !isHomepage &&
    !isShellRoute &&
    (isAuthRoute || theme === 'image') &&
    !isMobile &&
    !customDesktopBg;

  const slideshowOverlay = isAuthRoute
    ? 'bg-gradient-to-b from-black/50 via-black/30 to-black/60'
    : 'bg-gradient-to-b from-black/45 via-black/25 to-black/55';

  return (
    <SlideshowIndexContext.Provider value={slideshowIndex}>
      {showDesktopSlideshow ? (
        <DesktopBackgroundSlideshow
          images={DESKTOP_BG_SLIDESHOW}
          overlayClassName={slideshowOverlay}
          enabled={slideshowEnabled}
          frozenIndex={slideshowFrozenIndex}
          onActiveIndexChange={setSlideshowIndex}
        />
      ) : null}
      {!isMobile && !isHomepage && !isShellRoute && customDesktopBg && theme === 'image' ? (
        <div
          className="fixed inset-0 -z-10 hidden md:block bg-cover bg-center bg-no-repeat bg-fixed"
          style={{ backgroundImage: `url("${customDesktopBg}")` }}
          aria-hidden
        />
      ) : null}
      {children}
    </SlideshowIndexContext.Provider>
  );
}
