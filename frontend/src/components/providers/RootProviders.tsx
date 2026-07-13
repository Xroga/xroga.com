'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './ThemeProvider';
import { CurrencyDetector } from './CurrencyDetector';
import { LanguageProvider } from './LanguageProvider';
import { OfflineOverlay } from '@/components/errors/OfflineOverlay';
import { ScheduledFeedbackPrompt } from '@/components/feedback/ScheduledFeedbackPrompt';
import { VoiceTalkProvider } from '@/context/VoiceTalkContext';
import { VoiceTalkOverlay } from '@/components/voice/VoiceTalkOverlay';
import { getFirstVisitTime } from '@/lib/scheduledFeedback';
import { recoverCorruptStorage } from '@/lib/storageRecovery';

export function RootProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    recoverCorruptStorage();
    getFirstVisitTime();
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('xroga_error_recovery_attempted');
    }
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyDetector />
        <VoiceTalkProvider>
          {children}
          <VoiceTalkOverlay />
          <OfflineOverlay />
        </VoiceTalkProvider>
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
