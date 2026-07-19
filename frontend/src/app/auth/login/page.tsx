import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata: Metadata = buildMetadata({
  title: 'Sign In — Log In to Xroga AI Dashboard',
  description:
    'Sign in to Xroga AI Workspace — the #1 coding agent. Continue building web apps, push to GitHub, deploy on Vercel, and update your repos.',
  path: '/auth/login',
  keywords: ['Xroga login', 'Xroga sign in', 'AI coding agent login', 'xroga.com login', 'Xroga workspace login'],
});

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
