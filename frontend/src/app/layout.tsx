import type { Metadata, Viewport } from 'next';
import {
  Cormorant,
  Fraunces,
  Inter,
  JetBrains_Mono,
  Outfit,
  Press_Start_2P,
  Source_Serif_4,
  Syne,
} from 'next/font/google';
import './globals.css';
import '@/styles/xroga-fonts.css';
import '@/styles/uiverse.css';
import { buildMetadata, FAVICON_URL, FAVICON_LOCAL } from '@/lib/seo';
import { RootProviders } from '@/components/providers/RootProviders';
import { SiteJsonLd } from '@/components/seo/SiteJsonLd';
import { StorageBootstrap } from '@/components/bootstrap/StorageBootstrap';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
/** Azurio role — sharp editorial serif (Fraunces stand-in) */
const azurio = Fraunces({
  subsets: ['latin'],
  variable: '--font-azurio',
  weight: ['600', '700', '800', '900'],
});
/** Goga role — friendly geometric sans body */
const goga = Outfit({
  subsets: ['latin'],
  variable: '--font-goga',
  weight: ['400', '500', '600', '700'],
});
/** Remixa role — contrasting modern sans for UI/labels */
const remixa = Syne({
  subsets: ['latin'],
  variable: '--font-remixa',
  weight: ['500', '600', '700', '800'],
});
/** Emilio role — elegant thin italic serif accents */
const emilio = Cormorant({
  subsets: ['latin'],
  variable: '--font-emilio',
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-xv-mono',
  weight: ['400', '500', '600'],
});
/** Pixel coding vibe — homepage accents */
const pixelCoding = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: ['400'],
});
/** High-contrast editorial serif (Claude-like display) */
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
});

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
        <StorageBootstrap />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/icon.png" type="image/png" sizes="64x64" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="shortcut icon" href="/favicon-32.png" />
        <link rel="preconnect" href="https://xroga-api.fly.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://xroga-api.fly.dev" />
      </head>
      <body
        className={`${inter.variable} ${azurio.variable} ${goga.variable} ${remixa.variable} ${emilio.variable} ${jetbrainsMono.variable} ${pixelCoding.variable} ${sourceSerif.variable} font-sans antialiased`}
      >
        <SiteJsonLd />
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
