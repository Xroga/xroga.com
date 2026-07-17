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
  tokensLabel?: string;
  xrgLabel?: string;
  features?: string[];
  cta: ReactNode;
  current?: boolean;
  popular?: boolean;
  compact?: boolean;
  description?: string;
  className?: string;
}

function PlanCheckIcon() {
  return (
    <svg className="xv-plan-check__svg" fill="currentColor" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        clipRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function StandardPricingCard({
  name,
  price,
  subtitle,
  tokensLabel,
  xrgLabel,
  features,
  cta,
  current,
  description,
  className,
}: Omit<XrogaPricingCardProps, 'popular' | 'compact'>) {
  return (
    <div className={cn('xv-plan-card h-full', className)}>
      <div className="xv-plan-border" aria-hidden />
      <div className="xv-plan-title__container">
        <div className="flex items-center gap-2">
          <Image
            src={SIDEBAR_LOGO_URL}
            alt="Xroga"
            width={24}
            height={24}
            className="object-contain rounded shrink-0"
            unoptimized
          />
          <span className="xv-plan-title">{name}</span>
          {current && <span className="xv-plan-current">Current</span>}
        </div>
        <p className="xv-plan-price">
          {price}
          <span className="xv-plan-price__suffix">/mo</span>
        </p>
        {tokensLabel && <p className="xv-plan-tokens">{tokensLabel}</p>}
        <p className="xv-plan-paragraph">
          {xrgLabel ? `${xrgLabel}${description ? ` · ${description}` : ''}` : description ?? subtitle}
        </p>
      </div>
      <hr className="xv-plan-line" />
      {features && features.length > 0 && (
        <ul className="xv-plan-list">
          {features.map((f) => (
            <li key={f} className="xv-plan-list__item">
              <span className="xv-plan-check">
                <PlanCheckIcon />
              </span>
              <span className="xv-plan-list__text">{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="xv-plan-cta">{cta}</div>
    </div>
  );
}

function PopularPricingCard({
  name,
  price,
  subtitle,
  tokensLabel,
  xrgLabel,
  description,
  features,
  cta,
  current,
  className,
}: Omit<XrogaPricingCardProps, 'popular' | 'compact'>) {
  return (
    <div className={cn('xv-galactic-popular-card h-full', className)}>
      <div className="xv-galactic-popular-border" aria-hidden />
      <div className="xv-galactic-popular-badge">
        <span>MOST POPULAR</span>
        <Sparkles className="w-4 h-4" aria-hidden />
      </div>
      <div className="xv-galactic-popular-title__container">
        <div className="flex items-center gap-2">
          <Image
            src={SIDEBAR_LOGO_URL}
            alt="Xroga"
            width={24}
            height={24}
            className="object-contain rounded shrink-0"
            unoptimized
          />
          <span className="xv-galactic-popular-title">{name}</span>
          {current && <span className="xv-plan-current xv-plan-current--popular">Current</span>}
        </div>
        <p className="xv-galactic-popular-price">
          {price}
          <span className="xv-plan-price__suffix">/mo</span>
        </p>
        {tokensLabel && <p className="xv-galactic-popular-tokens">{tokensLabel}</p>}
        <p className="xv-galactic-popular-paragraph">
          {xrgLabel ? `${xrgLabel}${description ? ` · ${description}` : ''}` : description ?? subtitle}
        </p>
      </div>
      <hr className="xv-galactic-popular-line" />
      {features && features.length > 0 && (
        <ul className="xv-galactic-popular-list">
          {features.map((f) => (
            <li key={f} className="xv-galactic-popular-list__item">
              <span className="xv-galactic-popular-check">
                <PlanCheckIcon />
              </span>
              <span className="xv-galactic-popular-list__text">{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="xv-galactic-popular-cta">{cta}</div>
    </div>
  );
}

export function XrogaPricingCard(props: XrogaPricingCardProps) {
  if (props.popular) {
    return <PopularPricingCard {...props} />;
  }
  return <StandardPricingCard {...props} />;
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
      subtitle={plan.tagline ?? `${plan.concurrency} concurrent tasks`}
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
