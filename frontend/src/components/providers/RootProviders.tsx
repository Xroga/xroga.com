'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './ThemeProvider';
import { CurrencyDetector } from './CurrencyDetector';
import { LanguageProvider } from './LanguageProvider';
import { ScheduledFeedbackPrompt } from '@/components/feedback/ScheduledFeedbackPrompt';
import { getFirstVisitTime } from '@/lib/scheduledFeedback';

export function RootProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getFirstVisitTime();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyDetector />
        {children}
        <ScheduledFeedbackPrompt />
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
