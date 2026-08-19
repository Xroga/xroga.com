'use client';

import type { ReactNode } from 'react';
import styles from './LiquidPricingCard.module.css';

interface LiquidPricingCardProps {
  badge?: string;
  title: string;
  price: string;
  priceSuffix?: string;
  billingText?: string;
  features: string[];
note?: ReactNode;
  action: ReactNode;
}

export function LiquidPricingCard({
  badge = 'Plus',
  title,
  price,
  priceSuffix,
  billingText,
  features,
  note,
  action,
}: LiquidPricingCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.noise} aria-hidden="true" />

      {/* TOP VISUAL AREA */}
      <div className={styles.visualPanel} aria-hidden="true">
        <div className={styles.visualSky} />
       <div
  className={`${styles.visualCloud} ${styles.visualCloudOne}`}
/>

<div
  className={`${styles.visualCloud} ${styles.visualCloudTwo}`}
/>

<div
  className={`${styles.visualCloud} ${styles.visualCloudThree}`}
/>
        <div className={styles.visualGlowLeft} />
        <div className={styles.visualGlowRight} />
        <div className={styles.visualCenterMist} />

        <div className={styles.visualTopRow}>
          <span>All Features</span>
          <span>Premium</span>
        </div>

        <div className={styles.visualMiddleIcon}>
          <div className={styles.visualIconCircle}>
            <span className={styles.visualIconDot} />
          </div>
        </div>

        <div className={styles.visualBottomRow}>
          <div>
            <p className={styles.visualLabel}>Build</p>
            <h3 className={styles.visualValue}>Faster</h3>
          </div>

          <div className={styles.visualDivider} />

          <div className={styles.visualRightBlock}>
            <p className={styles.visualLabel}>Ship</p>
            <h3 className={styles.visualValue}>Smarter</h3>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className={styles.content}>
        <div className={styles.headerBlock}>
          <p className={styles.badge}>{badge}</p>

          <div className={styles.priceRow}>
            <span className={styles.price}>{price}</span>

            <div className={styles.priceMeta}>
              {priceSuffix ? (
                <span className={styles.priceSuffix}>{priceSuffix}</span>
              ) : null}

              {billingText ? (
                <span className={styles.billingText}>{billingText}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.actionWrap}>
          {action}
        </div>

        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature} className={styles.featureItem}>
              <span className={styles.featureIcon} />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
    </article>
  );
}
