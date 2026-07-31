'use client';

/**
 * About-page FAQ accordion.
 *
 * Built on native <button> + hidden panels rather than <details>, because the brief
 * requires one-open-at-a-time on mobile and a controlled open animation, neither of
 * which <details> gives without fighting it.
 *
 * On mobile only one item stays open at a time; on wider screens several may be open,
 * since there is room to read them side by side. The breakpoint is observed rather
 * than assumed, so rotating a phone behaves correctly.
 */

import { useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AboutFaq as AboutFaqItem } from '@/lib/aboutContent';

const MOBILE_QUERY = '(max-width: 767px)';

export function AboutFaq({ items }: { items: readonly AboutFaqItem[] }) {
  const uid = useId();
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const [singleOpenOnly, setSingleOpenOnly] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setSingleOpenOnly(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Collapsing to one open item must happen when the viewport narrows, not only on
  // the next click, or a rotation could leave several panels open on a phone.
  useEffect(() => {
    if (!singleOpenOnly) return;
    setOpen((current) => (current.size <= 1 ? current : new Set([[...current][0]])));
  }, [singleOpenOnly]);

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(singleOpenOnly ? [] : current);
      if (current.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="ab-faq">
      {items.map((item, index) => {
        const isOpen = open.has(index);
        const panelId = `${uid}-panel-${index}`;
        const buttonId = `${uid}-button-${index}`;
        return (
          <div key={item.question} className={cn('ab-faq-item', isOpen && 'is-open')}>
            <h3 className="ab-faq-heading">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="ab-faq-trigger"
              >
                <span>{item.question}</span>
                <Plus className="ab-faq-sign" aria-hidden="true" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="ab-faq-panel">
              <p>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
