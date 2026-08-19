'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './LiquidPricingCard.module.css';

interface LiquidPricingCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  features: string[];
  price: string;
  period: string;
  action: ReactNode;
}

export function LiquidPricingCard({
  eyebrow,
  title,
  description,
  features,
  price,
  period,
  action,
}: LiquidPricingCardProps) {
  const rawId = useId().replace(/:/g, '');

  const gradientId = `liquid-gradient-${rawId}`;
  const highlightId = `liquid-highlight-${rawId}`;
  const turbulenceId = `liquid-turbulence-${rawId}`;
  const blurId = `liquid-blur-${rawId}`;

  return (
    <article className={styles.card}>
      <div className={styles.content}>
        <div>
          {eyebrow ? (
            <p className={styles.eyebrow}>{eyebrow}</p>
          ) : null}

          <h2 className={styles.title}>{title}</h2>

          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
        </div>

        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature} className={styles.feature}>
              {feature}
            </li>
          ))}
        </ul>

        <div className={styles.purchaseRow}>
          <div className={styles.priceWrap}>
            <span className={styles.price}>{price}</span>
            <span className={styles.period}>{period}</span>
          </div>

          <div className={styles.action}>
            {action}
          </div>
        </div>
      </div>

      <div className={styles.liquid} aria-hidden="true">
        <svg
          className={styles.liquidSvg}
          viewBox="0 0 900 340"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="15%"
              x2="100%"
              y2="95%"
            >
              <stop offset="0%" stopColor="#ecebf5" />
              <stop offset="18%" stopColor="#d9d5ed" />
              <stop offset="40%" stopColor="#b7add9" />
              <stop offset="63%" stopColor="#8f82c3" />
              <stop offset="80%" stopColor="#b7a8d7" />
              <stop offset="100%" stopColor="#ddd6ec" />
            </linearGradient>

            <linearGradient
              id={highlightId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="24%" stopColor="#ffffff" stopOpacity="0.68" />
              <stop offset="48%" stopColor="#dcd5f5" stopOpacity="0.28" />
              <stop offset="68%" stopColor="#ffffff" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <filter
              id={turbulenceId}
              x="-25%"
              y="-35%"
              width="150%"
              height="180%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.008 0.023"
                numOctaves="2"
                seed="8"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values="
                    0.008 0.023;
                    0.012 0.017;
                    0.006 0.027;
                    0.008 0.023
                  "
                  dur="14s"
                  repeatCount="indefinite"
                />
              </feTurbulence>

              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="54"
                xChannelSelector="R"
                yChannelSelector="B"
              />
            </filter>

            <filter
              id={blurId}
              x="-30%"
              y="-40%"
              width="160%"
              height="180%"
            >
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          <rect
            width="900"
            height="340"
            fill={`url(#${gradientId})`}
          />

          <g
            filter={`url(#${turbulenceId})`}
            className={styles.streamGroupOne}
          >
            <path
              d="M-120 266 C55 36 178 354 359 128 C517 -69 663 58 1000 218"
              fill="none"
              stroke={`url(#${highlightId})`}
              strokeWidth="32"
              strokeLinecap="round"
              opacity="0.76"
            />

            <path
              d="M-170 302 C60 101 202 346 392 164 C576 -11 734 84 1030 282"
              fill="none"
              stroke="#7465ad"
              strokeWidth="19"
              strokeLinecap="round"
              opacity="0.35"
            />
          </g>

          <g
            filter={`url(#${blurId})`}
            className={styles.streamGroupTwo}
          >
            <path
              d="M-100 170 C112 7 246 295 434 79 C567 -73 753 54 1012 157"
              fill="none"
              stroke="#f8f5ff"
              strokeWidth="16"
              strokeLinecap="round"
              opacity="0.74"
            />

            <path
              d="M-80 350 C92 115 277 395 474 190 C619 38 789 163 1010 316"
              fill="none"
              stroke="#9584c6"
              strokeWidth="38"
              strokeLinecap="round"
              opacity="0.42"
            />
          </g>

          <ellipse
            className={styles.orbOne}
            cx="170"
            cy="270"
            rx="200"
            ry="125"
            fill="#ffffff"
            opacity="0.13"
            filter={`url(#${blurId})`}
          />

          <ellipse
            className={styles.orbTwo}
            cx="755"
            cy="126"
            rx="190"
            ry="112"
            fill="#775fae"
            opacity="0.17"
            filter={`url(#${blurId})`}
          />
        </svg>

        <div className={styles.liquidGloss} />
      </div>
    </article>
  );
}
