import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SignupForm } from '@/components/auth/SignupForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata: Metadata = buildMetadata({
  title: 'Sign Up Free — Create Your Xroga AI Account',
  description:
    'Sign up for Xroga AI free — the #1 coding agent for developers and non-developers. Build web apps from plain language, push to GitHub, deploy on Vercel, and update the same repo. No coding knowledge required to start.',
  path: '/auth/signup',
  keywords: [
    'Xroga signup',
    'Xroga register',
    'free AI coding agent',
    'create Xroga account',
    'AI website builder signup',
  ],
});

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
