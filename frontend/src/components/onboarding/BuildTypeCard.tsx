'use client';

import { ArrowRight, Blocks, Bot, Globe, LayoutGrid, Wrench, Sparkles } from 'lucide-react';
import { OnboardingCard, OnboardingChoice } from './OnboardingCard';
import { ONBOARDING_ARTWORK } from './artwork';
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  ONBOARDING_ROLES,
  ROLE_LABELS,
  type ProjectType,
  type OnboardingRole,
} from '@/lib/onboarding';

const PROJECT_ICONS: Record<ProjectType, React.ReactNode> = {
  saas: <Blocks className="h-4 w-4" strokeWidth={1.75} />,
  web_app: <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />,
  ai_app: <Bot className="h-4 w-4" strokeWidth={1.75} />,
  website: <Globe className="h-4 w-4" strokeWidth={1.75} />,
  internal_tool: <Wrench className="h-4 w-4" strokeWidth={1.75} />,
  other: <Sparkles className="h-4 w-4" strokeWidth={1.75} />,
};

/**
 * The one question worth asking.
 *
 * A project type shapes the workspace that gets prepared, so it earns its place.
 * The role does not — it is offered because it is cheap to answer and useful to
 * know, and it never blocks Continue.
 */
export function BuildTypeCard({
  projectType,
  role,
  onProjectType,
  onRole,
  onContinue,
}: {
  projectType: ProjectType | null;
  role: OnboardingRole | null;
  onProjectType: (value: ProjectType) => void;
  onRole: (value: OnboardingRole | null) => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingCard
      artwork={ONBOARDING_ARTWORK.build}
      priority
      headline="What do you want to build?"
      description="Xroga will prepare the right workspace around your idea."
      footer={
        <div className="xv-onb-actions">
          <button
            type="button"
            onClick={onContinue}
            disabled={!projectType}
            className="xv-onb-cta"
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      }
    >
      <div className="xv-onb-group" role="radiogroup" aria-label="What do you want to build?">
        {PROJECT_TYPES.map((type) => (
          <OnboardingChoice
            key={type}
            selected={projectType === type}
            onSelect={() => onProjectType(type)}
            icon={PROJECT_ICONS[type]}
            label={PROJECT_TYPE_LABELS[type]}
          />
        ))}
      </div>

      <p className="xv-onb-sublabel" id="xv-onb-role-label">
        I&rsquo;m a <span className="xv-onb-optional">optional</span>
      </p>
      <div className="xv-onb-group xv-onb-group--sm" role="radiogroup" aria-labelledby="xv-onb-role-label">
        {ONBOARDING_ROLES.map((r) => (
          <OnboardingChoice
            key={r}
            size="small"
            selected={role === r}
            // Pressing the chosen role again clears it. Without that the only way out
            // of an accidental tap is to pick a different wrong answer.
            onSelect={() => onRole(role === r ? null : r)}
            label={ROLE_LABELS[r]}
          />
        ))}
      </div>
    </OnboardingCard>
  );
}
