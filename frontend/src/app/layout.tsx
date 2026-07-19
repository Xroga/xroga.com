import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/xroga-fonts.css';
import '@/styles/uiverse.css';
import { buildMetadata, FAVICON_URL, FAVICON_LOCAL } from '@/lib/seo';
import { RootProviders } from '@/components/providers/RootProviders';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { StorageBootstrap } from '@/components/bootstrap/StorageBootstrap';
import { rootFontVariables } from '@/lib/fonts';

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Xroga AI — #1 Coding Agent | Build Web Apps → GitHub + Vercel',
    description:
      'Xroga AI is the #1 coding agent for developers and non-developers. Describe a website or web app in plain language — Xroga builds it, pushes working code to your GitHub, deploys on your Vercel, syncs your API keys securely into Vercel env, and updates the same repo (edit/delete) without starting over. No coding knowledge required to start. Also known as Roga AI, Droga AI, xroga.com.',
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
