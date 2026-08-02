'use client';

import { useState } from 'react';
import { HudIcon } from './HudIcons';
import { GAME_FAQ } from '@/lib/gameBuilderContent';
import { cn } from '@/lib/utils';

/**
 * The FAQ.
 *
 * A native button/panel accordion rather than `<details>`, because this needs
 * one-open-at-a-time and a controlled indicator. It carries `aria-expanded` and
 * `aria-controls`, and the panels stay in the DOM when closed so the answers remain
 * present for indexing rather than only existing after a click.
 */
export function GameFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="xv-gc-faq">
      {GAME_FAQ.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.q} className="xv-gc-faq__item">
            <button
              type="button"
              className="xv-gc-faq__q"
              aria-expanded={isOpen}
              aria-controls={`gb-faq-panel-${index}`}
              id={`gb-faq-q-${index}`}
              onClick={() => setOpen(isOpen ? null : index)}
            >
              <span>{item.q}</span>
              <HudIcon
                name="chevron"
                size={13}
                className={cn('xv-gc-faq__chev', isOpen && 'is-open')}
              />
            </button>
            <div
              id={`gb-faq-panel-${index}`}
              role="region"
              aria-labelledby={`gb-faq-q-${index}`}
              className={cn('xv-gc-faq__a', isOpen && 'is-open')}
              hidden={!isOpen}
            >
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
