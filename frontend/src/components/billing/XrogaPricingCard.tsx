'use client';

import type { ReactNode } from 'react';
import type { GalacticPlan, PlanTier } from '@/lib/plans';
import { getPlanFeatures } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { cn } from '@/lib/utils';

export type NeonBorderVariant = 'trial' | PlanTier;

const TIER_BORDER: Record<NeonBorderVariant, string> = {
  trial: 'xv-neon-plan--trial',
  spark: 'xv-neon-plan--spark',
  pulse: 'xv-neon-plan--pulse',
  nova: 'xv-neon-plan--nova',
  zenith: 'xv-neon-plan--zenith',
  singularity: 'xv-neon-plan--fire',
};

export interface XrogaPricingCardProps {
  name: string;
  price: string;
  subtitle: string;
  features?: string[];
  cta: ReactNode;
  current?: boolean;
  popular?: boolean;
  compact?: boolean;
  description?: string;
  borderVariant?: NeonBorderVariant;
  className?: string;
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[12px] leading-snug text-[#d4c4b0]/85">
      <span className="mt-0.5 text-[#e8dcc8] shrink-0">✓</span>
      <span>{children}</span>
    </li>
  );
}

function parsePriceDisplay(price: string): { main: string; suffix: string } {
  const cleaned = price.replace(/^\$/, '');
  if (cleaned.includes('.')) {
    const [main, cents] = cleaned.split('.');
    return { main: `$${main}`, suffix: `.${cents}` };
  }
  return { main: price, suffix: '' };
}

export function XrogaPricingCard({
  name,
  price,
  subtitle,
  features,
  cta,
  current,
  popular,
  compact,
  description,
  borderVariant = 'spark',
  className,
}: XrogaPricingCardProps) {
  const { main, suffix } = parsePriceDisplay(price);
  const borderClass = TIER_BORDER[borderVariant];

  return (
    <div className={cn('xv-neon-plan h-full', borderClass, className)}>
      <div className="xv-neon-plan__electric" aria-hidden>
        <div className="xv-neon-plan__electric-track" />
      </div>
      <div className={cn('xv-neon-plan__inner', compact && 'xv-neon-plan__inner--compact')}>
        {popular && (
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c084fc] mb-1">Most Popular</p>
        )}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#e8dcc8]/90">{name}</p>
            {current && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#4a7aff] px-1.5 py-0.5 rounded bg-[#4a7aff]/15">
                Current
              </span>
            )}
          </div>
          <p className="mt-2 flex items-baseline gap-0.5 tabular-nums">
            <span className="text-3xl sm:text-4xl font-bold text-[#e8dcc8]">{main}</span>
            {suffix && <span className="text-lg font-medium text-[#e8dcc8]/70">{suffix}</span>}
            <span className="text-xs font-normal text-[#a89880]/70 ml-1">/monthly</span>
          </p>
          {description && (
            <p className="mt-2 text-[11px] text-[#a89880]/80 leading-relaxed">{description}</p>
          )}
          {!description && subtitle && (
            <p className="mt-2 text-[11px] text-[#a89880]/80 leading-relaxed">{subtitle}</p>
          )}
        </div>

        {features && features.length > 0 && (
          <>
            <hr className="border-[#e8dcc8]/10 my-1" />
            <ul className="space-y-2 flex-1">
              {features.map((f) => (
                <CheckItem key={f}>{f}</CheckItem>
              ))}
            </ul>
          </>
        )}

        {description && subtitle && (
          <p className="text-[10px] text-[#4a7aff]/80 font-medium">{subtitle}</p>
        )}

        <div className="mt-auto pt-2">{cta}</div>
      </div>
    </div>
  );
}

export function GalacticPlanPricingCard({
  plan,
  cta,
  current,
  compact,
}: {
  plan: GalacticPlan;
  cta: ReactNode;
  current?: boolean;
  compact?: boolean;
}) {
  return (
    <XrogaPricingCard
      name={plan.name}
      price={plan.priceLabel}
      subtitle={`${plan.aiTokensLabel} · ${plan.xrgLabel}`}
      description={plan.tagline}
      features={getPlanFeatures(plan, FEATURE_COUNT)}
      cta={cta}
      current={current}
      popular={plan.highlight}
      compact={compact}
      borderVariant={plan.tier}
    />
  );
}

export function PricingPlanGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('xv-pricing-grid relative', className)}>
      <div className="relative z-[1] grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {children}
      </div>
    </div>
  );
}

export function PricingCtaButton({
  children,
  onClick,
  variant = 'outline',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'outline' | 'solid' | 'ghost';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'xv-pricing-cta w-full text-xs sm:text-sm font-semibold',
        variant === 'outline' && 'xv-pricing-cta--outline',
        variant === 'solid' && 'xv-pricing-cta--solid',
        variant === 'ghost' && 'xv-pricing-cta--ghost',
        className
      )}
    >
      {children}
    </button>
  );
}
