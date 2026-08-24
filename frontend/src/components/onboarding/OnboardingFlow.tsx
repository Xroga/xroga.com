'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import { INTEGRATION_LOGOS } from '@/lib/integrationLogos';
import { openGitHubOAuthPopup } from '@/lib/githubConnect';
import { openVercelOAuthPopup } from '@/lib/vercelConnect';
import { subscribeOAuthResults } from '@/lib/oauthPopupResult';
import { rememberOAuthReturn } from '@/lib/onboardingReturn';
import {
  DEFAULT_ONBOARDING,
  normalizeOnboarding,
  resumeStep,
  serializeOnboarding,
  type OnboardingRole,
  type OnboardingState,
  type OnboardingStep,
  type ProjectType,
} from '@/lib/onboarding';
import { Logo } from '@/components/layout/Logo';
import { OnboardingCardStack, type StackItem } from './OnboardingCardStack';
import { BuildTypeCard } from './BuildTypeCard';
import { IntegrationCard } from './IntegrationCard';
import { WorkspacePreparationCard } from './WorkspacePreparationCard';
import { ONBOARDING_ARTWORK } from './artwork';

const ORDER: OnboardingStep[] = ['build_type', 'github', 'vercel', 'preparing'];

/**
 * The providers' own marks, from the local brand assets the app already ships.
 *
 * Not a lucide glyph: `lucide-react` no longer exports brand icons, and drawing a
 * GitHub-ish shape from a generic branch icon would be a made-up logo standing in
 * for a real one on the screen that asks to connect that exact account.
 */
function BrandMark({ slug, label }: { slug: 'github' | 'vercel'; label: string }) {
  return (
    <Image src={INTEGRATION_LOGOS[slug]} alt={label} width={18} height={18} />
  );
}

/** Where onboarding hands off. The workspace is where building actually happens. */
const WORKSPACE = '/workspace';

export function OnboardingFlow({ initial }: { initial: OnboardingState }) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(initial);
  const [step, setStep] = useState<OnboardingStep>(resumeStep(initial));
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Write through to the profile.
   *
   * Debounced, because choosing a project type and then a role is two changes a
   * second apart and each one is a network round trip. The failure is deliberately
   * swallowed: onboarding is not worth blocking on, and the next write carries the
   * whole object anyway.
   */
  const persist = useCallback((next: OnboardingState) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void api.profile
        .update({ onboarding: serializeOnboarding(next) } as never)
        .catch(() => undefined);
    }, 350);
  }, []);

  const update = useCallback(
    (patch: Partial<OnboardingState>) => {
      setState((prev) => {
        const next: OnboardingState = {
          ...prev,
          ...patch,
          status: patch.status ?? (prev.status === 'not_started' ? 'in_progress' : prev.status),
          startedAt: prev.startedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

  const goTo = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      update({ currentStep: next });
    },
    [update],
  );

  /**
   * Ask the providers what is actually connected.
   *
   * The source of truth is their own status endpoints, not anything this flow
   * remembers. It runs on mount so a reader returning from a GitHub authorize — a
   * full page load, since that flow leaves the tab — is recognised without pressing
   * anything, and so an account that connected in a previous session is not asked
   * to connect what it already has.
   */
  const syncIntegrations = useCallback(async () => {
    const [gh, ve] = await Promise.all([
      api.github.status().catch(() => ({ connected: false })),
      api.vercel.status().catch(() => ({ connected: false })),
    ]);
    const githubConnected = Boolean((gh as { connected?: boolean }).connected);
    const vercelConnected = Boolean((ve as { connected?: boolean }).connected);
    setState((prev) => {
      if (prev.githubConnected === githubConnected && prev.vercelConnected === vercelConnected) {
        return prev;
      }
      const next = { ...prev, githubConnected, vercelConnected, updatedAt: new Date().toISOString() };
      persist(next);
      return next;
    });
    return { githubConnected, vercelConnected };
  }, [persist]);

  useEffect(() => {
    void syncIntegrations();
  }, [syncIntegrations]);

  // Vercel authorises in a popup, so its result arrives on the bus rather than as a
  // page load. GitHub publishes here too when it happens to keep the opener.
  useEffect(() => {
    return subscribeOAuthResults((data) => {
      if (data.type === 'xroga-github-connected' || data.type === 'xroga-vercel-connected') {
        void syncIntegrations();
      }
    });
  }, [syncIntegrations]);

  /**
   * The preparation stage's real work.
   *
   * It confirms the integration state one last time rather than inventing progress.
   * When that is quick, the card finishes quickly — there is no minimum wait beyond
   * the beat the card itself holds so the ticks are legible.
   */
  useEffect(() => {
    if (step !== 'preparing' || ready) return;
    let cancelled = false;
    void (async () => {
      await syncIntegrations();
      if (cancelled) return;
      setReady(true);
      update({ currentStep: 'complete', status: 'completed', completedAt: new Date().toISOString() });
    })();
    return () => {
      cancelled = true;
    };
  }, [step, ready, syncIntegrations, update]);

  const enterWorkspace = useCallback(() => {
    setLeaving(true);
    router.replace(WORKSPACE);
  }, [router]);

  const skipSetup = useCallback(() => {
    setLeaving(true);
    // Skipping is an answer. The status records it so the reader is not asked again,
    // and the integrations they passed on stay available in settings.
    const next: OnboardingState = {
      ...state,
      status: 'skipped',
      currentStep: 'complete',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    setState(next);
    void api.profile
      .update({ onboarding: serializeOnboarding(next) } as never)
      .catch(() => undefined)
      .finally(() => router.replace(WORKSPACE));
  }, [state, router]);

  const connectGitHub = useCallback(async () => {
    // Leaves the tab, so the way back has to be recorded before it goes.
    rememberOAuthReturn('/onboarding');
    const result = await openGitHubOAuthPopup();
    return { started: result.opened, error: result.error };
  }, []);

  const connectVercel = useCallback(async () => {
    rememberOAuthReturn('/onboarding');
    const result = await openVercelOAuthPopup();
    if (!result.opened) {
      return {
        started: false,
        error: result.oauthConfigured === false
          ? 'Vercel is not configured for this workspace yet.'
          : result.error,
      };
    }
    return { started: true };
  }, []);

  const activeIndex = Math.max(0, ORDER.indexOf(step));

  const items: StackItem[] = useMemo(
    () => [
      {
        id: 'build_type',
        content: (
          <BuildTypeCard
            projectType={state.projectType}
            role={state.role}
            onProjectType={(value: ProjectType) => update({ projectType: value })}
            onRole={(value: OnboardingRole | null) => update({ role: value })}
            onContinue={() => goTo('github')}
          />
        ),
      },
      {
        id: 'github',
        content: (
          <IntegrationCard
            artwork={ONBOARDING_ARTWORK.github}
            headline="Bring your code with you"
            description="Connect GitHub so Xroga can understand and work with your repositories."
            providerName="GitHub"
            brandIcon={<BrandMark slug="github" label="GitHub" />}
            alreadyConnected={state.githubConnected}
            active={step === 'github'}
            onConnect={connectGitHub}
            onSkip={() => {
              update({ githubSkipped: true });
              goTo('vercel');
            }}
            onConnected={() => goTo('vercel')}
          />
        ),
      },
      {
        id: 'vercel',
        content: (
          <IntegrationCard
            artwork={ONBOARDING_ARTWORK.vercel}
            headline="Ready to ship?"
            description="Connect Vercel so Xroga can deploy and manage what you build."
            providerName="Vercel"
            brandIcon={<BrandMark slug="vercel" label="Vercel" />}
            alreadyConnected={state.vercelConnected}
            active={step === 'vercel'}
            onConnect={connectVercel}
            onSkip={() => {
              update({ vercelSkipped: true });
              goTo('preparing');
            }}
            onConnected={() => goTo('preparing')}
          />
        ),
      },
      {
        id: 'preparing',
        content: (
          <WorkspacePreparationCard state={state} ready={ready} onStart={enterWorkspace} />
        ),
      },
    ],
    [state, step, ready, update, goTo, connectGitHub, connectVercel, enterWorkspace],
  );

  return (
    <div className="xv-onb" data-leaving={leaving ? 'true' : 'false'}>
      <header className="xv-onb__bar">
        <Logo href={null} height={30} variant="header" className="xv-onb__mark" />
        <button type="button" onClick={skipSetup} className="xv-onb-skip-global">
          Skip setup
        </button>
      </header>

      <main className="xv-onb__stage">
        <OnboardingCardStack items={items} activeIndex={activeIndex} />
      </main>
    </div>
  );
}

export { DEFAULT_ONBOARDING, normalizeOnboarding };
