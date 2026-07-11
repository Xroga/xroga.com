'use client';

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { GalacticPlan } from '@/lib/plans';
import { getPlanFeatures } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { cn } from '@/lib/utils';

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
  className?: string;
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[11px] sm:text-xs leading-snug text-white/75">
      <span className="mt-0.5 w-4 h-4 rounded-full bg-[#2dd4bf]/90 flex items-center justify-center text-[9px] text-black font-bold shrink-0">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
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
  className,
}: XrogaPricingCardProps) {
  if (popular) {
    return (
      <div className={cn('xv-pricing-popular h-full', className)}>
        <div className="xv-pricing-popular__glow" aria-hidden />
        <div className="xv-pricing-popular__badge">
          <span>MOST POPULAR</span>
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className={cn('xv-pricing-popular__inner', compact && 'xv-pricing-popular__inner--compact')}>
          <div>
            <p className="text-lg font-bold text-white">{name}</p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-white tabular-nums">
              {price}
              <span className="text-sm font-normal text-white/50">/mo</span>
            </p>
            <p className="mt-1.5 text-[11px] text-white/55">{subtitle}</p>
            {description && <p className="mt-1 text-[11px] text-white/40 italic">{description}</p>}
          </div>
          {features && features.length > 0 && (
            <ul className="space-y-1.5 mt-1">
              {features.map((f) => (
                <CheckItem key={f}>{f}</CheckItem>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-2">{cta}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'xv-pricing-card group h-full',
        current && 'xv-pricing-card--current',
        compact && 'xv-pricing-card--compact',
        className
      )}
    >
      <div className="xv-pricing-card__sheen" aria-hidden />
      <div className="xv-pricing-card__border" aria-hidden />
      <div className="relative z-[1] flex flex-col gap-3 h-full">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">{name}</span>
            {current && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#2dd4bf] px-1.5 py-0.5 rounded bg-[#2dd4bf]/10">
                Current
              </span>
            )}
          </div>
          <p className="mt-1 text-2xl font-bold text-white tabular-nums">
            {price}
            <span className="text-sm font-normal text-white/50">/mo</span>
          </p>
          <p className="mt-1 text-[11px] text-[#2dd4bf]/90 font-medium">{subtitle}</p>
        </div>
        {features && features.length > 0 && (
          <>
            <hr className="border-white/10" />
            <ul className="space-y-1.5 flex-1">
              {features.map((f) => (
                <CheckItem key={f}>{f}</CheckItem>
              ))}
            </ul>
          </>
        )}
        <div className="mt-auto">{cta}</div>
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
      description={plan.highlight ? plan.tagline : undefined}
      features={getPlanFeatures(plan, FEATURE_COUNT)}
      cta={cta}
      current={current}
      popular={plan.highlight}
      compact={compact}
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
      <div className="xv-pricing-grid__ambient" aria-hidden />
      <div className="relative z-[1] grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
