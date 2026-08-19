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
  note?: string;
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
      <div className={styles.topGlow} aria-hidden="true" />
      <div className={styles.bottomSky} aria-hidden="true" />
      <div className={styles.buttonGlow} aria-hidden="true" />
      <div className={styles.noise} aria-hidden="true" />

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
