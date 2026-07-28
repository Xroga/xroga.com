import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Account — Xroga AI',
    description: 'Sign in or create your Xroga AI account to build, verify, and publish through connected services.',
    path: '/auth',
  }),
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
