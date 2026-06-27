'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LOCALES, type Locale, t as translate } from '@/lib/i18n/translations';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useAppStore((s) => s.profile?.language ?? 'en');

  useEffect(() => {
    const locale = (LOCALES.find((l) => l.code === language)?.code ?? 'en') as Locale;
    const dir = LOCALES.find((l) => l.code === locale)?.dir ?? 'ltr';
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [language]);

  return <>{children}</>;
}

export function useLocale(): Locale {
  const language = useAppStore((s) => s.profile?.language ?? 'en');
  return (language as Locale) || 'en';
}

export function useT() {
  const locale = useLocale();
  return (key: string) => translate(key, locale);
}
