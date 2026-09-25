'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  LogIn,
  Sparkles,
  UserPlus,
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
import { apiFetch } from '@/lib/api';
import {
  clearGuestMigrationMarker,
  loadGuestMigrationMarker,
  rememberGuestAuthIntent,
  type GuestMigrationMarker,
} from '@/lib/guestWorkspace';

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
      'Your guest chat can stay exactly where it is. Sign in or create a free account before opening saved terminals or starting a separate workspace.',
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

const RESUME_LABELS: Partial<Record<WorkspaceAuthGateReason, string>> = {
  dashboard: 'open your dashboard',
  project: 'open projects',
  integration: 'connect an app',
  github: 'connect GitHub',
  deploy: 'publish',
  settings: 'open settings',
  history: 'save or start another terminal',
  upload: 'attach a file',
  build: 'start the real build',
  limit: 'continue in the full workspace',
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
  const [resumeMarker, setResumeMarker] = useState<GuestMigrationMarker | null>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);

  const requestAuthGate = useCallback(
    (reason: WorkspaceAuthGateReason) => {
      if (identity.status !== 'guest') return;
      rememberGuestAuthIntent(reason);
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
    if (identity.status !== 'authenticated') return;
    if (activeReason) {
      setActiveReason(null);
      setOauthError(null);
    }

    const marker = loadGuestMigrationMarker();
    if (!marker) return;
    setResumeMarker(marker);

    let cancelled = false;
    void apiFetch<{ ok: boolean }>('/api/guest/claim', {
      method: 'POST',
      body: JSON.stringify({ guestSessionId: marker.guestSessionId }),
    })
      .then(() => {
        if (!cancelled) clearGuestMigrationMarker();
      })
      .catch(() => {
        // Keep the marker so the authenticated workspace retries the claim on reload.
      });

    return () => {
      cancelled = true;
    };
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

      {identity.status === 'authenticated' && resumeMarker ? (
        <div
          className="fixed inset-x-3 bottom-4 z-[420] mx-auto flex w-auto max-w-[620px] items-center gap-3 rounded-[18px] border border-[var(--card-border)] bg-[var(--card)]/95 p-3.5 text-[var(--foreground)] shadow-[0_20px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:bottom-6 sm:px-4"
          data-testid="guest-migration-resume"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#006aff]/12 text-[#006aff]">
            <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">
              {resumeMarker.restoredWorkspace
                ? 'Guest conversation restored.'
                : 'Account ready.'}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--muted)] sm:text-[11px]">
              {resumeMarker.reason && RESUME_LABELS[resumeMarker.reason as WorkspaceAuthGateReason]
                ? `You were about to ${RESUME_LABELS[resumeMarker.reason as WorkspaceAuthGateReason]}. Nothing ran automatically.`
                : 'Nothing from guest mode ran automatically. Continue when you are ready.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResumeMarker(null);
              window.setTimeout(() => {
                document
                  .querySelector<HTMLTextAreaElement>('[data-terminal-composer]')
                  ?.focus();
              }, 20);
            }}
            className="shrink-0 rounded-xl bg-[var(--foreground)] px-3 py-2 text-[11px] font-semibold text-[var(--background)] transition hover:opacity-85"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => setResumeMarker(null)}
            aria-label="Dismiss restored conversation notice"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {identity.status === 'guest' && copy ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6"
          role="presentation"
          data-testid="workspace-auth-gate"
        >
          <button
            type="button"
            aria-label="Close account prompt"
            className="absolute inset-0 bg-[#05070d]/65 backdrop-blur-xl"
            onClick={closeAuthGate}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-auth-gate-title"
            className="relative z-[1] w-full max-w-[720px] overflow-hidden rounded-[30px] border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-[0_36px_130px_rgba(0,0,0,0.48)] sm:rounded-[34px]"
          >
            <div className="grid sm:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="relative hidden min-h-[520px] overflow-hidden border-r border-[var(--card-border)] bg-[linear-gradient(155deg,rgba(0,106,255,0.18),rgba(0,106,255,0.045)_48%,rgba(255,255,255,0.02))] p-6 sm:flex sm:flex-col">
                <div
                  aria-hidden="true"
                  className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#006aff]/18 blur-3xl"
                />
                <div className="relative">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#006aff]/20 bg-[#006aff]/12 text-[#006aff] shadow-[0_10px_30px_rgba(0,106,255,0.12)]">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#006aff]">
                    Guest → Xroga
                  </p>
                  <p className="mt-2 text-[20px] font-semibold leading-[1.1] tracking-[-0.025em]">
                    Keep the thread.
                    <br />
                    Unlock the work.
                  </p>
                </div>

                <div className="relative mt-auto space-y-3">
                  {[
                    ['01', 'Chat', 'Already here'],
                    ['02', 'Account', 'Save the thread'],
                    ['03', 'Build', 'Run with authority'],
                  ].map(([step, label, note], index) => (
                    <div key={step} className="flex items-center gap-3">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-[9px] font-bold ${index === 1
                          ? 'border-[#006aff]/35 bg-[#006aff]/14 text-[#006aff]'
                          : 'border-[var(--card-border)] bg-[var(--foreground)]/[0.035] text-[var(--muted)]'}`}
                      >
                        {step}
                      </span>
                      <span>
                        <span className="block text-[11px] font-semibold">{label}</span>
                        <span className="block text-[9px] text-[var(--muted)]">{note}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </aside>

              <div className="relative p-5 sm:p-7">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 h-40 w-60 bg-[radial-gradient(circle_at_100%_0%,rgba(0,106,255,0.16),transparent_66%)]"
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#006aff]/20 bg-[#006aff]/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#006aff]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {copy.eyebrow}
                  </div>
                  <button
                    type="button"
                    onClick={closeAuthGate}
                    disabled={oauthLoading}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] text-[var(--muted)] transition hover:bg-[var(--foreground)]/[0.07] hover:text-[var(--foreground)] disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="relative mt-5">
                  <h2
                    id="workspace-auth-gate-title"
                    className="max-w-[430px] text-[27px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[34px]"
                  >
                    {copy.title}
                  </h2>
                  <p className="mt-3 max-w-[450px] text-[12px] leading-5 text-[var(--muted)] sm:text-[13px] sm:leading-6">
                    {copy.description}
                  </p>
                </div>

                <div className="relative mt-5 grid gap-2">
                  {copy.bullets.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2.5 rounded-[13px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] px-3 py-2.5 text-[11px] leading-4"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#006aff]/10 text-[#006aff]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="relative mt-5 grid gap-2.5 sm:grid-cols-2">
                  <Link
                    ref={primaryRef}
                    href={signupHref}
                    className="group flex min-h-12 items-center justify-center gap-2 rounded-[15px] bg-[linear-gradient(135deg,#006aff_0%,#2d7dff_55%,#73adff_100%)] px-4 text-[12px] font-bold text-white shadow-[0_14px_32px_rgba(0,106,255,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,106,255,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006aff]/60 sm:col-span-2"
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Create free account
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>

                  <Link
                    href={loginHref}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] px-4 text-[11px] font-semibold transition hover:bg-[var(--foreground)]/[0.07]"
                  >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Sign in
                  </Link>

                  <button
                    type="button"
                    onClick={() => void continueWithGitHub()}
                    disabled={oauthLoading}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] px-4 text-[11px] font-semibold transition hover:bg-[var(--foreground)]/[0.07] disabled:cursor-wait disabled:opacity-60"
                  >
                    <GitHubIcon className="h-[17px] w-[17px]" />
                    {oauthLoading ? 'Connecting…' : 'GitHub'}
                  </button>
                </div>

                {oauthError ? (
                  <p
                    role="alert"
                    className="relative mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] leading-5 text-red-500"
                  >
                    {oauthError}
                  </p>
                ) : null}

                <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4 text-[10px] text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    No restart. This guest chat stays here.
                  </span>
                  <button
                    type="button"
                    onClick={closeAuthGate}
                    className="shrink-0 font-semibold text-[var(--foreground)] transition hover:text-[#006aff]"
                  >
                    Continue as guest
                  </button>
                </div>
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
