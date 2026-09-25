'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Sparkles,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { createClient } from '@/lib/supabase/client';
import {
  safeAuthError,
  withAuthTimeout,
} from '@/lib/supabase/authErrors';
import { requireGitHubProvider } from '@/lib/supabase/authProviders';

export type WorkspaceAuthGateReason =
  | 'dashboard'
  | 'project'
  | 'integration'
  | 'github'
  | 'deploy'
  | 'settings'
  | 'history'
  | 'upload'
  | 'build'
  | 'limit';

type GateCopy = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: [string, string, string];
};

const GATE_COPY: Record<WorkspaceAuthGateReason, GateCopy> = {
  dashboard: {
    eyebrow: 'Your Xroga workspace',
    title: 'Save your workspace and keep going.',
    description:
      'Create a free account to keep this conversation and unlock your private dashboard, usage and activity.',
    bullets: [
      'Keep this guest conversation',
      'See saved activity and usage',
      'Continue from any device',
    ],
  },
  project: {
    eyebrow: 'Projects',
    title: 'Turn this conversation into a real project.',
    description:
      'Your guest chat stays intact. Create a free account to save projects, repositories and durable Xroga workspaces.',
    bullets: [
      'Preserve the conversation you already started',
      'Create and reopen durable projects',
      'Work with repositories safely',
    ],
  },
  integration: {
    eyebrow: 'Xroga Connect',
    title: 'Connect your apps to Xroga.',
    description:
      'Create a free account before authorising GitHub, Slack, Notion, databases and your other connected tools.',
    bullets: [
      'Secure account-bound connections',
      'Keep provider permissions under your control',
      'Return to this exact conversation after sign-in',
    ],
  },
  github: {
    eyebrow: 'GitHub',
    title: 'Work with your repositories.',
    description:
      'Sign in before Xroga can request repository access, inspect code or prepare changes.',
    bullets: [
      'Choose exactly which repository to use',
      'Keep repository access tied to your account',
      'Preserve your guest planning conversation',
    ],
  },
  deploy: {
    eyebrow: 'Publish',
    title: 'Publish when you are ready.',
    description:
      'Create a free account before Xroga can connect deployment providers or publish anything on your behalf.',
    bullets: [
      'Keep deployment authority account-bound',
      'Review what will be published first',
      'Continue from the plan already in this chat',
    ],
  },
  settings: {
    eyebrow: 'Personal workspace',
    title: 'Make this workspace yours.',
    description:
      'Create a free account to save account settings, connected services and persistent preferences.',
    bullets: [
      'Keep your current conversation',
      'Save workspace preferences',
      'Manage account and security settings',
    ],
  },
  history: {
    eyebrow: 'Save your work',
    title: 'Keep this conversation.',
    description:
      'Guest mode is intentionally temporary. Create a free account before starting another terminal or opening saved history.',
    bullets: [
      'Keep the chat you already started',
      'Open saved terminals later',
      'Continue across browsers and devices',
    ],
  },
  upload: {
    eyebrow: 'Files',
    title: 'Bring files into Xroga securely.',
    description:
      'File uploads are account-bound so Xroga can handle storage, permissions and project context safely.',
    bullets: [
      'Your current text chat stays available',
      'Upload files after account creation',
      'Keep files attached to the correct workspace',
    ],
  },
  build: {
    eyebrow: 'Build with Xroga',
    title: 'Turn the plan into working software.',
    description:
      'Guest mode can plan with you. Create a free account when you are ready for real project execution.',
    bullets: [
      'Keep the planning conversation',
      'Start authenticated project execution',
      'Connect repositories and deployment when needed',
    ],
  },
  limit: {
    eyebrow: 'Guest preview complete',
    title: 'Keep building with Xroga.',
    description:
      'You reached the guest preview limit. Create a free account to preserve this conversation and continue.',
    bullets: [
      'Your current conversation will be preserved',
      'Continue with full workspace features',
      'Connect projects and apps when you choose',
    ],
  },
};

type WorkspaceAuthGateContextValue = {
  requestAuthGate: (reason: WorkspaceAuthGateReason) => void;
  closeAuthGate: () => void;
  activeReason: WorkspaceAuthGateReason | null;
};

const WorkspaceAuthGateContext =
  createContext<WorkspaceAuthGateContextValue>({
    requestAuthGate: () => {},
    closeAuthGate: () => {},
    activeReason: null,
  });

export function WorkspaceAuthGateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const identity = useWorkspaceIdentity();
  const [activeReason, setActiveReason] =
    useState<WorkspaceAuthGateReason | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);

  const requestAuthGate = useCallback(
    (reason: WorkspaceAuthGateReason) => {
      if (identity.status !== 'guest') return;
      setOauthError(null);
      setActiveReason(reason);
    },
    [identity.status],
  );

  const closeAuthGate = useCallback(() => {
    if (oauthLoading) return;
    setOauthError(null);
    setActiveReason(null);
  }, [oauthLoading]);

  useEffect(() => {
    if (!activeReason) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => primaryRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAuthGate();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeReason, closeAuthGate]);

  useEffect(() => {
    if (identity.status === 'authenticated' && activeReason) {
      setActiveReason(null);
      setOauthError(null);
    }
  }, [identity.status, activeReason]);

  async function continueWithGitHub() {
    setOauthError(null);
    setOauthLoading(true);

    try {
      await requireGitHubProvider();
      const supabase = createClient();
      const { data, error } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo:
              `${window.location.origin}/auth/callback?next=${encodeURIComponent('/workspace')}`,
            skipBrowserRedirect: true,
          },
        }),
      );

      if (error) throw error;
      if (!data.url) throw new Error('OAuth provider did not return a redirect URL');
      window.location.assign(data.url);
    } catch (error) {
      setOauthLoading(false);
      setOauthError(
        safeAuthError(
          error,
          'GitHub sign-in is currently unavailable. You can still use email.',
        ),
      );
    }
  }

  const copy = activeReason ? GATE_COPY[activeReason] : null;
  const signupHref = '/auth/signup?next=%2Fworkspace';
  const loginHref = '/auth/login?next=%2Fworkspace';

  return (
    <WorkspaceAuthGateContext.Provider
      value={{ requestAuthGate, closeAuthGate, activeReason }}
    >
      {children}

      {identity.status === 'guest' && copy ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6"
          role="presentation"
          data-testid="workspace-auth-gate"
        >
          <button
            type="button"
            aria-label="Close account prompt"
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            onClick={closeAuthGate}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-auth-gate-title"
            className="relative z-[1] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-[0_28px_100px_rgba(0,0,0,0.38)]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_28%_0%,rgba(0,106,255,0.28),transparent_62%)]"
            />

            <div className="relative p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#006aff]/20 bg-[#006aff]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#006aff]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.eyebrow}
                </div>
                <button
                  type="button"
                  onClick={closeAuthGate}
                  disabled={oauthLoading}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--card-border)] text-[var(--muted)] transition hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)] disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <h2
                id="workspace-auth-gate-title"
                className="mt-5 max-w-[430px] text-[26px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[32px]"
              >
                {copy.title}
              </h2>
              <p className="mt-3 max-w-[450px] text-[13px] leading-6 text-[var(--muted)] sm:text-sm">
                {copy.description}
              </p>

              <div className="mt-5 grid gap-2.5 rounded-[18px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] p-4">
                {copy.bullets.map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px] leading-5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#006aff]" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-2.5">
                <Link
                  ref={primaryRef}
                  href={signupHref}
                  className="group flex min-h-12 items-center justify-center gap-2 rounded-[15px] bg-[linear-gradient(135deg,#006aff_0%,#2f7dff_52%,#67a4ff_100%)] px-4 text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(0,106,255,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(0,106,255,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006aff]/60"
                >
                  Create free account
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>

                <button
                  type="button"
                  onClick={() => void continueWithGitHub()}
                  disabled={oauthLoading}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-[15px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.035] px-4 text-[13px] font-semibold transition hover:bg-[var(--foreground)]/[0.07] disabled:cursor-wait disabled:opacity-60"
                >
                  <GitHubIcon className="h-[18px] w-[18px]" />
                  {oauthLoading ? 'Connecting…' : 'Continue with GitHub'}
                </button>
              </div>

              {oauthError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-500"
                >
                  {oauthError}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                  Your current guest conversation stays in this browser.
                </span>
                <Link
                  href={loginHref}
                  className="font-semibold text-[var(--foreground)] underline decoration-[var(--card-border)] underline-offset-4 hover:text-[#006aff]"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </WorkspaceAuthGateContext.Provider>
  );
}

export function useWorkspaceAuthGate() {
  return useContext(WorkspaceAuthGateContext);
}
