import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/xroga-fonts.css';
import '@/styles/uiverse.css';
import '@/styles/companion.css';
import { buildMetadata, FAVICON_URL, FAVICON_LOCAL } from '@/lib/seo';
import { RootProviders } from '@/components/providers/RootProviders';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { StorageBootstrap } from '@/components/bootstrap/StorageBootstrap';
import { rootFontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Xroga AI — Build, verify, and publish software',
    description:
      'Describe a software outcome in plain language. Xroga works in your connected repository, validates changes, and publishes through accounts you authorise.',
    path: '/',
  }),
  metadataBase: new URL('https://xroga.com'),
  applicationName: 'Xroga AI',
  authors: [{ name: 'Muhammad Ibrahim', url: 'https://xroga.com/about' }],
  creator: 'Muhammad Ibrahim',
  publisher: 'Xroga AI',
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: FAVICON_LOCAL, type: 'image/png', sizes: '512x512' },
      { url: FAVICON_URL, type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
    shortcut: '/favicon-32.png',
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
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
        <StorageBootstrap />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/icon.png" type="image/png" sizes="64x64" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="shortcut icon" href="/favicon-32.png" />
        <link rel="preconnect" href="https://xroga-api.fly.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://xroga-api.fly.dev" />
      </head>
      <body className={`theme-white ${rootFontVariables} font-sans antialiased`}>
        <SiteJsonLd />
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
