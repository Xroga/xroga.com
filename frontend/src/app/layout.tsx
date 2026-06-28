import type { Metadata, Viewport } from 'next';
import { Inter, Nunito } from 'next/font/google';
import './globals.css';
import '@/styles/uiverse.css';
import { buildMetadata, FAVICON_URL, FAVICON_LOCAL } from '@/lib/seo';
import { RootProviders } from '@/components/providers/RootProviders';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', weight: ['400', '600', '700', '800'] });

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Xroga AI — #1 Top AI Swarm Operating System | Best AI to Build Apps & Games',
    description:
      'Xroga AI is the #1 AI Swarm Operating System — best top AI platform to build websites, mobile apps, games, software, and browser automation. Sign up free. Also found as Roga AI, Droga AI, xroga.com.',
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
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="shortcut icon" href="/favicon-32.png" />
        <link rel="dns-prefetch" href="https://xroga-api.fly.dev" />
      </head>
      <body className={`${inter.variable} ${nunito.variable} font-sans antialiased`}>
        <SiteJsonLd />
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
