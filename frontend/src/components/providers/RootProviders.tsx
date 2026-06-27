'use client';

import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './ThemeProvider';

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
