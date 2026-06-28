import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Account — Xroga AI',
  description: 'Sign in or create your Xroga AI account — the #1 AI Swarm Operating System.',
  path: '/auth',
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
