import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata: Metadata = buildMetadata({
  title: 'Sign In — Log In to Xroga AI Dashboard',
  description:
    'Sign in to Xroga AI — the #1 AI Swarm Operating System. Access your dashboard, projects, automations, and multi-agent builder swarms.',
  path: '/auth/login',
  keywords: ['Xroga login', 'Xroga sign in', 'AI dashboard login', 'xroga.com login'],
});

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
