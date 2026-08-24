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
      'Sign Up Free — Create Your Xroga AI Account',

    description:
      'Create an Xroga AI account to build in a connected repository, validate changes, and publish through accounts you authorise.',

    path:
      '/auth/signup',

    keywords: [
      'Xroga signup',
      'Xroga register',
      'free AI coding agent',
      'create Xroga account',
      'AI website builder signup',
    ],
  }),

  robots: {
    index: false,
    follow: false,
  },
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell mode="signup" />
    </Suspense>
  );
}
