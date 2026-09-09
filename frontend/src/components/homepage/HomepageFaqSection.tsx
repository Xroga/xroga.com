'use client';

import { useId, useState } from 'react';
import { HOMEPAGE_FAQS } from '@/lib/homepageFaq';

export function HomepageFaqSection() {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="xv-hc-faq" aria-labelledby="faq-heading">
      <div className="xv-hc-faq-inner">
        <header className="xv-hc-faq-heading">
          <p className="xv-hc-pixel-kicker" id="faq-heading">FAQ · BEFORE YOU BUILD</p>
          <h2 className="xv-hc-section-title">Clear answers.<br /><em>No hype.</em></h2>
          <p className="xv-hc-section-copy">Product, shipping, and billing—before you start.</p>
          <span>{HOMEPAGE_FAQS.length} honest answers</span>
        </header>

        <div className="xv-hc-faq-list">
          {HOMEPAGE_FAQS.map((item, i) => {
            const panelId = `${baseId}-panel-${i}`;
            const btnId = `${baseId}-btn-${i}`;
            const isOpen = open === i;
            return (
              <div key={item.q} className={`xv-hc-faq-item${isOpen ? ' is-open' : ''}`}>
                <h3>
                  <button
                    type="button"
                    id={btnId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="xv-hc-faq-q"
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span className="xv-hc-faq-index">{String(i + 1).padStart(2, '0')}</span>
                    <span>{item.q}</span>
                    <span className="xv-hc-faq-icon" aria-hidden>
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="xv-hc-faq-a"
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
