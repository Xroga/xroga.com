'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PricingCards } from '@/components/pricing/PricingCards';
import { GitHubConnect } from '@/components/integrations/GitHubConnect';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { ArrowRight, ArrowLeft, Rocket, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

const BUILD_OPTIONS = [
  { id: 'website', label: 'Build a website', icon: '🖥️', prompt: 'Build a web app for ' },
  { id: 'video', label: 'Make a video', icon: '🎬', prompt: 'Make a movie about ' },
  { id: 'automate', label: 'Automate my work', icon: '🤖', prompt: 'Automate ' },
  { id: 'research', label: 'Deep research', icon: '🔬', prompt: 'Research ' },
  { id: 'app', label: 'Build a mobile app', icon: '📱', prompt: 'Build a mobile app for ' },
];

const STEPS = ['Connect GitHub', 'What to Build', 'Choose Plan', 'Welcome'];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [finishing, setFinishing] = useState(false);

  async function completeOnboarding(redirectTo?: string) {
    setFinishing(true);
    try {
      await api.profile.completeOnboarding();
      trackEvent('Onboarding Completed', { step: STEPS[step], goal: selectedGoal });
      router.push(redirectTo ?? '/dashboard');
    } catch (err) {
      toast.error((err as Error).message);
      router.push('/dashboard');
    }
  }

  function handleSkip() {
    trackEvent('Onboarding Skipped', { step: STEPS[step] });
    completeOnboarding('/dashboard');
  }

  function handleGoalSelect(id: string) {
    setSelectedGoal(id);
    const option = BUILD_OPTIONS.find((o) => o.id === id);
    if (option) {
      api.profile.update({}).catch(() => {});
    }
  }

  function handleStartBuilding() {
    const option = BUILD_OPTIONS.find((o) => o.id === selectedGoal);
    const prefill = customGoal
      ? (option?.prompt ?? '') + customGoal
      : option?.prompt ?? '';
    completeOnboarding(`/dashboard?prefill=${encodeURIComponent(prefill)}`);
  }

  return (
    <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors',
                i <= step ? 'border-violet-500 bg-violet-600 text-white' : 'border-[var(--card-border)] text-[var(--muted)]'
              )}>
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-2', i < step ? 'bg-violet-500' : 'bg-[var(--card-border)]')} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 sm:p-8">
          <button
            type="button"
            onClick={handleSkip}
            className="float-right flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white transition-colors"
          >
            <SkipForward className="w-3 h-3" /> Skip
          </button>

          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Connect Your GitHub</h1>
              <p className="text-[var(--muted)] text-sm">
                Push your generated code directly to GitHub. You can always connect later.
              </p>
              <GitHubConnect />
              <div className="flex justify-between pt-4">
                <button type="button" onClick={() => setStep(1)} className="text-sm text-[var(--muted)] hover:text-white">
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">What do you want to build?</h1>
              <p className="text-[var(--muted)] text-sm">Pick a goal so we can personalize your experience.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {BUILD_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleGoalSelect(opt.id)}
                    className={cn(
                      'p-4 rounded-xl border text-left transition-all',
                      selectedGoal === opt.id
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-[var(--card-border)] hover:border-violet-500/30'
                    )}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <p className="font-medium mt-2 text-sm">{opt.label}</p>
                  </button>
                ))}
              </div>
              {selectedGoal && (
                <input
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  placeholder={BUILD_OPTIONS.find((o) => o.id === selectedGoal)?.prompt + '...'}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
                />
              )}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(0)} className="flex items-center gap-1 text-sm text-[var(--muted)]">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={!selectedGoal}
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm disabled:opacity-50"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Choose Your Plan</h1>
              <p className="text-[var(--muted)] text-sm">
                Plans start at $19/mo. Pick a tier and subscribe to activate your Swarm.
              </p>
              <PricingCards compact onSelectPlan={(tier) => {
                api.billing.createCheckout(tier).then(({ checkoutUrl }) => {
                  window.location.href = checkoutUrl;
                }).catch((err) => toast.error((err as Error).message));
              }} />
              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-[var(--muted)]">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm text-[var(--muted)]"
                >
                  I&apos;ll subscribe later <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 text-center">
              <Rocket className="w-16 h-16 text-violet-400 mx-auto" />
              <h1 className="text-2xl font-bold">Welcome to Xroga!</h1>
              <p className="text-[var(--muted)] text-sm max-w-md mx-auto">
                Your account is ready. Subscribe to a plan from <strong className="text-white">$19/mo</strong> to unlock all 92 features.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 text-left text-sm">
                {[
                  { icon: '💬', title: 'Chat', desc: 'Talk to the Swarm from your dashboard' },
                  { icon: '📁', title: 'Projects', desc: 'Every build is saved automatically' },
                  { icon: '⚡', title: 'Actions', desc: 'Your fuel meter tracks usage' },
                ].map((item) => (
                  <div key={item.title} className="p-3 rounded-lg border border-[var(--card-border)]">
                    <span className="text-xl">{item.icon}</span>
                    <p className="font-medium mt-1">{item.title}</p>
                    <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={finishing}
                onClick={handleStartBuilding}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {finishing ? 'Loading...' : selectedGoal ? 'Start Building' : 'Go to Dashboard'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
