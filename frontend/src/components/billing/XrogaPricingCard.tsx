'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { GalacticPlan } from '@/lib/plans';
import { getPlanFeatures } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { SIDEBAR_LOGO_URL } from '@/lib/theme';
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

function BrutalPricingCard({
  name,
  price,
  subtitle,
  features,
  cta,
  current,
  description,
  className,
}: Omit<XrogaPricingCardProps, 'popular' | 'compact'>) {
  return (
    <div className={cn('xv-brutal-card h-full', className)}>
      <div className="xv-brutal-card__inner">
        <div className="xv-brutal-card__front">
          <div className="xv-brutal-card__noise" aria-hidden />
          <div className="xv-brutal-card__image">
            <Image
              src={SIDEBAR_LOGO_URL}
              alt="Xroga"
              width={72}
              height={72}
              className="xv-brutal-card__logo object-contain"
              unoptimized
            />
          </div>
          <div className="xv-brutal-card__content">
            <div>
              <div className="xv-brutal-card__title flex items-center gap-2">
                {name}
                {current && (
                  <span className="text-[8px] font-bold uppercase tracking-wider bg-black text-white px-1 py-0.5">
                    Current
                  </span>
                )}
              </div>
              <div className="xv-brutal-card__price">{price}</div>
              <div className="xv-brutal-card__desc">{description ?? subtitle}</div>
            </div>
            {features && features.length > 0 && (
              <ul className="space-y-1 my-2">
                {features.map((f) => (
                  <li key={f} className="text-[9px] uppercase tracking-wide font-bold flex gap-1.5">
                    <span>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="xv-brutal-card__cta-wrap">{cta}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PopularPricingCard({
  name,
  price,
  subtitle,
  description,
  features,
  cta,
  current,
  className,
}: Omit<XrogaPricingCardProps, 'popular' | 'compact'>) {
  return (
    <div className={cn('xv-popular-card h-full', className)}>
      <div className="xv-popular-badge">
        <p>MOST POPULAR</p>
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="xv-popular-inner">
        <div className="flex items-center gap-2 mb-1">
          <Image
            src={SIDEBAR_LOGO_URL}
            alt="Xroga"
            width={28}
            height={28}
            className="object-contain rounded"
            unoptimized
          />
          <p className="xv-title !mb-0">{name}</p>
          {current && <span className="text-[9px] text-cyan-300 uppercase font-bold">Current</span>}
        </div>
        <p>
          <span className="xv-price">{price}</span>
          <span> / month</span>
        </p>
        <p>{subtitle}</p>
        {description && <p className="text-[11px] opacity-80">{description}</p>}
        {features && features.length > 0 && (
          <ul className="space-y-1 text-[11px] text-[#bab9b9]">
            {features.map((f) => (
              <li key={f} className="flex gap-1.5">
                <span className="text-cyan-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto">{cta}</div>
      </div>
    </div>
  );
}

export function XrogaPricingCard(props: XrogaPricingCardProps) {
  if (props.popular) {
    return <PopularPricingCard {...props} />;
  }
  return <BrutalPricingCard {...props} />;
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
  const isPopular = Boolean(plan.highlight);

  return (
    <XrogaPricingCard
      name={plan.name}
      price={plan.priceLabel}
      subtitle={`${plan.aiTokensLabel} · ${plan.xrgLabel}`}
      description={plan.tagline}
      features={getPlanFeatures(plan, FEATURE_COUNT)}
      cta={cta}
      current={current}
      popular={isPopular}
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
      <div className="relative z-[1] grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-stretch">
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
