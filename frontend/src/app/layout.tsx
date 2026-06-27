import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@/styles/uiverse.css';
import { buildMetadata, FAVICON_URL } from '@/lib/seo';
import { RootProviders } from '@/components/providers/RootProviders';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Xroga AI — #1 AI Swarm Operating System | Build Apps, Games & Automate',
    description:
      'Xroga AI is the AI Swarm Operating System built by Muhammad Ibrahim from Pakistan. Build websites, mobile apps, games, software, browser automation, and research — with honest action pricing and 710+ integrations.',
    path: '/',
  }),
  metadataBase: new URL('https://xroga.com'),
  applicationName: 'Xroga AI',
  authors: [{ name: 'Muhammad Ibrahim', url: 'https://xroga.com/about' }],
  creator: 'Muhammad Ibrahim',
  publisher: 'Xroga AI',
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: [{ url: FAVICON_URL, type: 'image/png' }],
    apple: [{ url: FAVICON_URL, type: 'image/png' }],
    shortcut: FAVICON_URL,
  },
  verification: {
    google: 'xroga-google-verification-placeholder',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://xroga-api.fly.dev" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SiteJsonLd />
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
