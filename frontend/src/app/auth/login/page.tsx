import type {
  Metadata,
} from 'next';

import {
  Suspense,
} from 'react';

import {
  buildMetadata,
} from '@/lib/seo';

import {
  AuthShell,
} from '@/components/auth/AuthShell';

export const metadata: Metadata = {
  ...buildMetadata({
    title:
      'Sign In — Log In to Xroga AI Dashboard',

    description:
      'Sign in to Xroga AI Workspace to continue repository work, validation, and authorised publishing.',

    path:
      '/auth/login',

    keywords: [
      'Xroga login',
      'Xroga sign in',
      'AI coding agent login',
      'xroga.com login',
      'Xroga workspace login',
    ],
  }),

  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell mode="login" />
    </Suspense>
  );
}
