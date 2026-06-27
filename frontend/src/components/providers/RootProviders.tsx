'use client';

import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './ThemeProvider';
import { CurrencyDetector } from './CurrencyDetector';
import { LanguageProvider } from './LanguageProvider';
import { XrogaCustomCursor } from '@/components/ui/XrogaCustomCursor';

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyDetector />
        <XrogaCustomCursor />
        {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--card-border)',
          },
        }}
      />
      </LanguageProvider>
    </ThemeProvider>
  );
}
