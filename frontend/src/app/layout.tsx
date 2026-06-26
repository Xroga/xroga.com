import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import '../styles/uiverse.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Xroga – AI Swarm Operating System',
  description: '92 features, 100+ specialized AIs, and a Truth Council that ensures flawless execution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen theme-image`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
