import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { SignupForm } from '@/components/auth/SignupForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata: Metadata = buildMetadata({
  title: 'Sign Up Free — Create Your Xroga AI Account',
  description:
    'Sign up for Xroga AI free — 50 actions included. The #1 AI Swarm OS to build websites, apps, games, software, and automations.',
  path: '/auth/signup',
  keywords: ['Xroga signup', 'Xroga register', 'free AI account', 'create Xroga account'],
});

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
